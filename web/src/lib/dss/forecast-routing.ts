/**
 * ForecastRoutingEngine — chọn phương pháp dự báo cho MỘT chuỗi điểm chuẩn
 * (trường + ngành + phương thức + tổ hợp + thang điểm gốc) và phân loại cơ hội đỗ theo MAE.
 *
 *   GROUP_TALENT (5)               → NO_FORECAST, không chạy mô hình.
 *   GROUP_HOCBA (2) / COMBINED (4) → hasFormulaChanged: dừng dự báo, trả điểm năm gần nhất + thông báo.
 *   GROUP_COMBINED (4) không đổi   → chỉ tham chiếu điểm năm gần nhất (nhóm kết hợp không dự báo).
 *   GROUP_THPT (1) / EXAM (3) / HOCBA (2) không đổi:
 *       ≥ 3 năm liên tiếp → Holt (α=0.6, β=0.2)
 *       = 2 năm           → MA2
 *       = 1 năm           → NAIVE + cảnh báo LOW_DATA_RELIABILITY
 *
 * Mọi con số đều ở THANG GỐC của chuỗi (HSA 150, TSA 100, THPT 30...) — không quy đổi chéo.
 * Điểm học sinh đưa vào phải cùng thang với chuỗi, nếu không sẽ không phân loại.
 */

import { HOLT_ALPHA, HOLT_BETA, holtForecast } from "./holt";
import { BASE_MAE, BUCKET_LABEL, admitProbability, classify, type Bucket } from "./recommend";

import type { MethodGroup } from "@/types/database.types";
export type { MethodGroup };

export { METHOD_GROUP_BY_FAMILY } from "./forecast-filter";

export type RoutingStatus =
  | "FORECAST" //          đã chạy mô hình
  | "LATEST_ACTUAL" //     không dự báo, dùng điểm năm gần nhất làm tham chiếu
  | "NO_FORECAST" //       nhóm năng khiếu — không chạy toán
  | "NO_DATA"; //          chuỗi rỗng

export type ForecastModel = "HOLT" | "MA2" | "NAIVE";

export type RoutingWarning =
  | "LOW_DATA_RELIABILITY" // chỉ 1 năm dữ liệu
  | "FORMULA_CHANGED" //     trường đổi công thức tính điểm
  | "HISTORY_GAP" //         lịch sử có năm bị thiếu → chỉ dùng đoạn liên tiếp cuối
  | "NO_BACKTEST"; //        chưa có năm để kiểm định MAE → dùng sai số nền

export type ChanceBucket = Bucket; // "reach" | "match" | "safety"

export type SeriesInput = {
  seriesKey: string;
  methodGroup: MethodGroup;
  /** Thang điểm gốc của chuỗi (30, 40, 100, 150, 1200...). */
  scoreScale: number;
  /** Điểm chuẩn thực tế theo năm (thứ tự bất kỳ, engine tự sắp). */
  history: ReadonlyArray<{ year: number; score: number }>;
  /** Trường đổi công thức tính điểm (học bạ / kết hợp) ở năm cần dự báo. */
  hasFormulaChanged?: boolean;
  /** Điểm của học sinh — CÙNG thang với chuỗi. Bỏ trống nếu chỉ cần dự báo. */
  studentScore?: number | null;
  /** Thang của điểm học sinh; khác scoreScale → không phân loại. Mặc định = scoreScale. */
  studentScoreScale?: number;
};

export type ChanceResult = {
  bucket: ChanceBucket;
  label: string; // Chắc đỗ / Vừa sức / Với cao
  margin: number; // điểm HS − tham chiếu
  admitProbability: number; // 0..1
  /** Ngưỡng điểm HS theo MAE: < reachBelow → Với cao; ≥ safetyFrom → Chắc đỗ. */
  thresholds: { reachBelow: number; safetyFrom: number };
};

export type RoutingResult = {
  seriesKey: string;
  methodGroup: MethodGroup;
  scoreScale: number;
  status: RoutingStatus;
  model: ForecastModel | null;
  modelLabel: string | null;
  targetYear: number | null;
  /** Điểm tham chiếu: dự báo (FORECAST) hoặc điểm năm gần nhất (LATEST_ACTUAL). */
  referenceScore: number | null;
  latestActual: { year: number; score: number } | null;
  nHistoryYears: number; // số năm liên tiếp dùng cho mô hình
  /** MAE kiểm định trong mẫu; null nếu chưa có năm để kiểm định. */
  mae: number | null;
  /** Bề rộng dải dùng để phân loại = max(MAE, sai số nền theo thang). */
  band: number | null;
  interval: { lower: number; upper: number } | null;
  warnings: RoutingWarning[];
  message: string;
  chance: ChanceResult | null;
};

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Sai số nền theo thang: BASE_MAE (1,35 trên thang 30) co giãn tuyến tính theo thang gốc. */
export function baseMaeForScale(scale: number): number {
  return round2((BASE_MAE * scale) / 30);
}

/** Dải ±band, cắt trong [0, thang gốc]. */
function clampInterval(center: number, band: number, scale: number) {
  return {
    lower: round2(Math.max(0, center - band)),
    upper: round2(Math.min(scale, center + band)),
  };
}

/** Đoạn năm liên tiếp cuối cùng (bỏ trùng năm, giữ giá trị sau cùng). */
function trailingConsecutive(history: SeriesInput["history"]) {
  const byYear = new Map<number, number>();
  for (const h of history) if (Number.isFinite(h.score)) byYear.set(h.year, h.score);
  const sorted = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  let start = sorted.length - 1;
  while (start > 0 && sorted[start - 1][0] === sorted[start][0] - 1) start--;
  return { all: sorted, run: sorted.slice(Math.max(start, 0)) };
}

function ma2Mae(ys: number[]): number | null {
  const errs: number[] = [];
  for (let t = 2; t < ys.length; t++) errs.push(Math.abs(ys[t] - (ys[t - 1] + ys[t - 2]) / 2));
  return errs.length ? round2(mean(errs)) : null;
}

/** Phân loại cơ hội đỗ theo MAE (dùng chung ngưỡng với recommend.classify). */
export function classifyChance(
  studentScore: number,
  reference: number,
  band: number,
): ChanceResult {
  const margin = round2(studentScore - reference);
  const bucket = classify(margin, band);
  return {
    bucket,
    label: BUCKET_LABEL[bucket],
    margin,
    admitProbability: round2(admitProbability(margin, band)),
    thresholds: {
      reachBelow: round2(reference - 0.4 * band),
      safetyFrom: round2(reference + 1.1 * band),
    },
  };
}

export function routeForecast(input: SeriesInput): RoutingResult {
  const { all, run } = trailingConsecutive(input.history);
  const latest = all.length ? { year: all[all.length - 1][0], score: all[all.length - 1][1] } : null;
  const warnings: RoutingWarning[] = [];
  const base = baseMaeForScale(input.scoreScale);

  const result: RoutingResult = {
    seriesKey: input.seriesKey,
    methodGroup: input.methodGroup,
    scoreScale: input.scoreScale,
    status: "NO_DATA",
    model: null,
    modelLabel: null,
    targetYear: latest ? latest.year + 1 : null,
    referenceScore: null,
    latestActual: latest,
    nHistoryYears: run.length,
    mae: null,
    band: null,
    interval: null,
    warnings,
    message: "Chuỗi chưa có điểm chuẩn.",
    chance: null,
  };

  // Nhóm 5 — không chạy toán, kể cả khi có dữ liệu.
  if (input.methodGroup === "GROUP_TALENT") {
    result.status = "NO_FORECAST";
    result.targetYear = null;
    result.message =
      "Phương thức năng khiếu/tài năng: điểm phụ thuộc bài thi năng khiếu, không dự báo — chỉ hiển thị lịch sử.";
    return result;
  }
  if (!latest) return result;

  const toLatest = (message: string) => {
    result.status = "LATEST_ACTUAL";
    result.referenceScore = latest.score;
    result.band = base;
    result.interval = clampInterval(latest.score, base, input.scoreScale);
    result.message = message;
  };

  const formulaSensitive =
    input.methodGroup === "GROUP_HOCBA" || input.methodGroup === "GROUP_COMBINED";

  if (formulaSensitive && input.hasFormulaChanged) {
    warnings.push("FORMULA_CHANGED");
    toLatest(
      `Trường đổi công thức tính điểm ${input.methodGroup === "GROUP_HOCBA" ? "học bạ" : "xét kết hợp"} — ` +
        `dừng dự báo, tham chiếu điểm ${latest.year} (${latest.score}). Cần đối chiếu đề án tuyển sinh mới.`,
    );
  } else if (input.methodGroup === "GROUP_COMBINED") {
    toLatest(
      `Phương thức kết hợp nhiều tiêu chí: không dự báo, tham chiếu điểm ${latest.year} (${latest.score}).`,
    );
  } else {
    if (run.length < all.length) warnings.push("HISTORY_GAP");
    const ys = run.map(([, s]) => s);
    let forecast: number;
    let mae: number | null;

    if (ys.length >= 3) {
      const h = holtForecast(ys, HOLT_ALPHA, HOLT_BETA)!;
      result.model = "HOLT";
      result.modelLabel = `Holt (α=${HOLT_ALPHA}, β=${HOLT_BETA})`;
      forecast = h.forecast;
      mae = h.mae;
    } else if (ys.length === 2) {
      result.model = "MA2";
      result.modelLabel = "MA2 (TB 2 năm)";
      forecast = round2((ys[0] + ys[1]) / 2);
      mae = ma2Mae(ys); // luôn null với 2 năm — chưa có năm để kiểm định
    } else {
      result.model = "NAIVE";
      result.modelLabel = "NAIVE (năm trước)";
      forecast = ys[0];
      mae = null;
      warnings.push("LOW_DATA_RELIABILITY");
    }
    if (mae == null) warnings.push("NO_BACKTEST");

    // Dải: MAE kiểm định nhưng không hẹp hơn sai số nền; 1 năm → nới ×1,5.
    const band = round2(Math.max(mae ?? 0, base) * (result.model === "NAIVE" ? 1.5 : 1));
    result.status = "FORECAST";
    result.referenceScore = forecast;
    result.mae = mae;
    result.band = band;
    result.interval = clampInterval(forecast, band, input.scoreScale);
    result.message =
      `Dự báo ${result.targetYear} bằng ${result.modelLabel} từ ${ys.length} năm liên tiếp` +
      (result.model === "NAIVE" ? " — chỉ 1 năm dữ liệu, độ tin cậy thấp." : ".");
  }

  // Phân loại cơ hội đỗ — chỉ khi điểm HS cùng thang với chuỗi.
  const studentScale = input.studentScoreScale ?? input.scoreScale;
  if (
    input.studentScore != null &&
    Number.isFinite(input.studentScore) &&
    studentScale === input.scoreScale &&
    result.referenceScore != null &&
    result.band != null
  ) {
    result.chance = classifyChance(input.studentScore, result.referenceScore, result.band);
  }
  return result;
}

/** Định tuyến nhiều chuỗi cùng lúc (vd. mọi phương thức của một ngành). */
export function routeForecasts(inputs: readonly SeriesInput[]): RoutingResult[] {
  return inputs.map(routeForecast);
}
