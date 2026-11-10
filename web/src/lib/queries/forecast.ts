import { createClient } from "@/lib/supabase/server";
import type {
  FactCutoffForecast,
  ForecastStatus,
  MethodFamily,
} from "@/types/database.types";

export type ForecastPoint = FactCutoffForecast;

// Tên phương pháp trong fact_cutoff_forecast.method (sinh bởi etl/build_method_forecast.py).
export const METHOD_ACTUAL = "ACTUAL";
export const isNaive = (m: string | null) => (m ?? "").toUpperCase().startsWith("NAIVE");
export const isMa2 = (m: string | null) => (m ?? "").toUpperCase().startsWith("MA2");
export const isHolt = (m: string | null) => (m ?? "").toUpperCase().startsWith("HOLT");

export const METHOD_FAMILY_LABEL: Record<MethodFamily, string> = {
  1: "Thi tốt nghiệp THPT",
  2: "Học bạ THPT",
  3: "Kỳ thi đánh giá độc lập",
  4: "Xét tuyển kết hợp",
  5: "Năng khiếu / tài năng / phỏng vấn",
};

export const FORECAST_STATUS_LABEL: Record<ForecastStatus, string> = {
  OK: "Đủ cơ sở dự báo",
  CAUTION: "Dự báo cần thận trọng",
  INSUFFICIENT_HISTORY: "Chưa đủ dữ liệu",
  DISCONTINUED: "Không còn áp dụng",
  NOT_FORECASTED: "Không dự báo",
};

/** Một chuỗi điểm chuẩn = trường + ngành + phương thức + tổ hợp + thang điểm. */
export type ForecastSeries = {
  key: string;
  admissionMethod: string;
  examType: string | null;
  family: MethodFamily | null;
  subjectCombination: string | null;
  scoreScale: number | null;
  status: ForecastStatus | null;
  statusReason: string | null;
  isPrimary: boolean;
  crossesPolicyChange: boolean;
  points: ForecastPoint[];
};

/** Mọi chuỗi (thực tế + dự báo) của 1 ngành; chuỗi chính lên đầu, rồi theo nhóm phương thức. */
export async function getForecastSeries(programId: string): Promise<ForecastSeries[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("fact_cutoff_forecast")
    .select("*")
    .eq("program_id", programId)
    .order("target_year")
    .order("method");
  const rows = (data ?? []) as ForecastPoint[];

  const map = new Map<string, ForecastSeries>();
  for (const r of rows) {
    const key = r.series_key ?? `${r.program_id}|legacy`;
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        admissionMethod: r.admission_method ?? "—",
        examType: r.exam_type,
        family: r.method_family,
        subjectCombination: r.subject_combination,
        scoreScale: r.score_scale,
        status: r.forecast_status,
        statusReason: r.status_reason,
        isPrimary: r.is_primary === true,
        crossesPolicyChange: false,
        points: [],
      };
      map.set(key, s);
    }
    if (r.method !== METHOD_ACTUAL && r.actual_cutoff == null) {
      // Dòng dự báo năm tới mang tổ hợp của năm gần nhất.
      s.subjectCombination = r.subject_combination ?? s.subjectCombination;
    }
    if (r.crosses_policy_change) s.crossesPolicyChange = true;
    s.points.push(r);
  }
  return [...map.values()].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      (a.family ?? 9) - (b.family ?? 9) ||
      a.admissionMethod.localeCompare(b.admissionMethod) ||
      (a.subjectCombination ?? "").localeCompare(b.subjectCombination ?? ""),
  );
}

/** MAE từng chuỗi theo từng mô hình (chỉ dòng có thực tế). */
export function seriesMae(points: ForecastPoint[]): {
  naive: number | null;
  ma2: number | null;
  holt: number | null;
  nMa2: number;
} {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const errs = (pred: (m: string | null) => boolean) =>
    points
      .filter((p) => pred(p.method) && p.abs_error != null)
      .map((p) => p.abs_error as number);
  const ma2 = errs(isMa2);
  return { naive: mean(errs(isNaive)), ma2: mean(ma2), holt: mean(errs(isHolt)), nMa2: ma2.length };
}

/**
 * MAE MA2 theo ngành — CHỈ trên chuỗi chính (THPT / quy đổi chung thang 30) để
 * không trộn phương thức. Dùng làm dải an toàn khi xếp nguyện vọng.
 */
export async function getForecastAccuracy(): Promise<
  { programId: string; mae: number; n: number }[]
> {
  const sb = await createClient();
  const { data } = await sb
    .from("fact_cutoff_forecast")
    .select("program_id, abs_error, method")
    .eq("is_primary", true)
    .ilike("method", "MA2%")
    .not("abs_error", "is", null);
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const r of (data ?? []) as { program_id: string; abs_error: number }[]) {
    (acc[r.program_id] ??= { sum: 0, n: 0 });
    acc[r.program_id].sum += r.abs_error;
    acc[r.program_id].n += 1;
  }
  return Object.entries(acc).map(([programId, v]) => ({
    programId,
    mae: v.sum / v.n,
    n: v.n,
  }));
}

/** MAE tổng thể (K03) — MA2 trên chuỗi chính, mọi ngành có thực tế. */
export async function getOverallMae(): Promise<number | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("fact_cutoff_forecast")
    .select("abs_error")
    .eq("is_primary", true)
    .ilike("method", "MA2%")
    .not("actual_cutoff", "is", null);
  const xs = (data ?? [])
    .map((r) => (r as { abs_error: number }).abs_error)
    .filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
