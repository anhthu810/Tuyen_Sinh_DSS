// Engine DSS — phân loại reach/match/safety, xác suất đỗ, điểm 4 trục cho Σ.
import { normalCdf, clamp } from "./scale";

export type Bucket = "reach" | "match" | "safety";

// Sai số dự báo tối thiểu (điểm, thang 30) — baseline MAE toàn hệ (K03 ≈ 1,35).
export const BASE_MAE = 1.35;

export function effectiveBand(programMae: number | null | undefined): number {
  return Math.max(programMae ?? 0, BASE_MAE);
}

/**
 * Phân loại một nguyện vọng theo biên điểm (thang 30) so với sai số dự báo.
 * margin = điểm HS − điểm chuẩn (dự báo); band co giãn theo MAE của ngành.
 */
export function classify(margin: number, band: number): Bucket {
  if (margin < -0.4 * band) return "reach";
  if (margin < 1.1 * band) return "match";
  return "safety";
}

/** Xác suất đỗ ước lượng: Φ(margin / band). */
export function admitProbability(margin: number, band: number): number {
  return clamp(normalCdf(margin / band) * 100, 0, 100) / 100;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  reach: "Với cao",
  match: "Vừa sức",
  safety: "Chắc đỗ",
};

export const BUCKET_TONE: Record<Bucket, "danger" | "warning" | "success"> = {
  reach: "danger",
  match: "warning",
  safety: "success",
};

// ---- Dữ liệu 1 nguyện vọng đầu vào (từ main_dataset + forecast) ----
export type NvInput = {
  programId: string;
  majorName: string | null;
  universityCode: string;
  shortName: string | null;
  nvOrder: number;
  bestMethod: string | null;
  margin30: number | null; // best_margin_30
  programMae: number | null;
  hollandMatchPct: number | null;
  affordabilityIndexPct: number | null;
  employmentRatePct: number | null;
  estTotalCostVnd: number | null;
  isAdmitted: boolean | null;
};

export type NvScored = NvInput & {
  band: number;
  bucket: Bucket | null;
  admitProb: number | null; // 0..1
};

export function scoreNv(nv: NvInput): NvScored {
  const band = effectiveBand(nv.programMae);
  if (nv.margin30 == null) {
    return { ...nv, band, bucket: null, admitProb: null };
  }
  return {
    ...nv,
    band,
    bucket: classify(nv.margin30, band),
    admitProb: admitProbability(nv.margin30, band),
  };
}

/** P(đỗ ít nhất 1 NV) = 1 − Π(1 − p_i). */
export function probAtLeastOne(probs: number[]): number {
  const valid = probs.filter((p) => p != null && !Number.isNaN(p));
  if (!valid.length) return 0;
  return 1 - valid.reduce((acc, p) => acc * (1 - p), 1);
}

/**
 * Thứ tự NV khuyến nghị (ladder): nhóm Với cao lên đầu (NV1–2), rồi Vừa sức, cuối là Chắc đỗ.
 * Trong mỗi nhóm, margin cao hơn xếp trước.
 */
export function recommendOrder(items: NvScored[]): NvScored[] {
  const rank: Record<Bucket, number> = { reach: 0, match: 1, safety: 2 };
  return [...items].sort((a, b) => {
    const ra = a.bucket ? rank[a.bucket] : 99;
    const rb = b.bucket ? rank[b.bucket] : 99;
    if (ra !== rb) return ra - rb;
    return (b.margin30 ?? -99) - (a.margin30 ?? -99);
  });
}

// ---- Σ: điểm 4 trục (0–100) ----
export type AxisScores = {
  fit: number; // phù hợp (Holland)
  prob: number; // xác suất đỗ
  job: number | null; // việc làm (null nếu thiếu dữ liệu)
  afford: number; // khả năng chi trả
};

export function axisScores(nv: NvScored): AxisScores {
  return {
    fit: clamp(nv.hollandMatchPct ?? 0),
    prob: clamp((nv.admitProb ?? 0) * 100),
    job: nv.employmentRatePct != null ? clamp(nv.employmentRatePct) : null,
    // affordability_index_pct thấp = dễ chi trả hơn; 100 = vừa đủ ngân sách.
    afford:
      nv.affordabilityIndexPct != null
        ? clamp(200 - nv.affordabilityIndexPct)
        : 50,
  };
}

export type Weights = { fit: number; prob: number; job: number; afford: number };

export function weightedScore(a: AxisScores, w: Weights): number {
  const parts: [number, number][] = [
    [a.fit, w.fit],
    [a.prob, w.prob],
    [a.job ?? 50, w.job], // thiếu việc làm -> trung tính 50
    [a.afford, w.afford],
  ];
  const wsum = parts.reduce((s, [, wi]) => s + wi, 0);
  if (wsum === 0) return 0;
  return parts.reduce((s, [v, wi]) => s + v * wi, 0) / wsum;
}
