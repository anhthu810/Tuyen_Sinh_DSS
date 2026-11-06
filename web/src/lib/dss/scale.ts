// Engine DSS — quy đổi thang điểm & xác suất (dùng cho Q1 & Σ).

export type ScoreConversionType =
  | "TSA"
  | "HSA"
  | "IELTS"
  | "TOEIC"
  | "SAT"
  | "ACT";

export const scoreConversionMeta: Record<
  ScoreConversionType,
  { label: string; min: number; max: number; description: string }
> = {
  TSA: { label: "TSA", min: 0, max: 100, description: "Thang điểm gốc TSA" },
  HSA: { label: "HSA", min: 0, max: 100, description: "Thang điểm gốc HSA" },
  IELTS: { label: "IELTS", min: 0, max: 9, description: "Band IELTS (0–9)" },
  TOEIC: { label: "TOEIC", min: 0, max: 990, description: "Điểm TOEIC (0–990)" },
  SAT: { label: "SAT", min: 0, max: 1600, description: "Điểm SAT (0–1600)" },
  ACT: { label: "ACT", min: 0, max: 36, description: "Điểm ACT (0–36)" },
};

export const IELTS_ADMISSION_BONUSES = [
  { band: 5.5, bonus: 0.5 },
  { band: 6, bonus: 0.75 },
  { band: 6.5, bonus: 1 },
  { band: 7, bonus: 1.25 },
  { band: 7.5, bonus: 1.5 },
] as const;

export function ieltsAdmissionBonus(band: number): number {
  if (!Number.isFinite(band) || band < 0 || band > 9) return 0;
  for (let i = IELTS_ADMISSION_BONUSES.length - 1; i >= 0; i--) {
    const bracket = IELTS_ADMISSION_BONUSES[i];
    if (band >= bracket.band) return bracket.bonus;
  }
  return 0;
}

// Quy đổi về thang 30 (giả định tuyến tính của nhóm — KPI_Sheet THAM SỐ).
export function tsaTo30(tsa: number): number {
  return 9.6 + 0.248 * tsa;
}
export function hsaTo30(hsa: number): number {
  return 14.6 + 0.117 * hsa;
}
export function ieltsTo30(ielts: number): number {
  return (30 / 9) * ielts;
}
export function toeicTo30(toeic: number): number {
  return (30 / 990) * toeic;
}
export function satTo30(sat: number): number {
  return (30 / 1600) * sat;
}
export function actTo30(act: number): number {
  return (30 / 36) * act;
}

export function convertScoreTo30(
  type: ScoreConversionType,
  value: number,
): number {
  switch (type) {
    case "TSA":
      return clamp(tsaTo30(value), 0, 30);
    case "HSA":
      return clamp(hsaTo30(value), 0, 30);
    case "IELTS":
      return clamp(ieltsTo30(value), 0, 30);
    case "TOEIC":
      return clamp(toeicTo30(value), 0, 30);
    case "SAT":
      return clamp(satTo30(value), 0, 30);
    case "ACT":
      return clamp(actTo30(value), 0, 30);
    default:
      return clamp(value, 0, 30);
  }
}

export function convertScoreTo10(
  type: ScoreConversionType,
  value: number,
): number {
  switch (type) {
    case "TSA":
      return clamp((value / 100) * 10, 0, 10);
    case "HSA":
      return clamp((value / 100) * 10, 0, 10);
    case "IELTS":
      return clamp((value / 9) * 10, 0, 10);
    case "TOEIC":
      return clamp((value / 990) * 10, 0, 10);
    case "SAT":
      return clamp((value / 1600) * 10, 0, 10);
    case "ACT":
      return clamp((value / 36) * 10, 0, 10);
    default:
      return clamp(value, 0, 10);
  }
}

export function convertScoreToScale(
  type: ScoreConversionType,
  value: number,
  targetScale: 10 | 30,
): number {
  return targetScale === 10 ? convertScoreTo10(type, value) : convertScoreTo30(type, value);
}

// CDF phân phối chuẩn (xấp xỉ erf) — dùng ước lượng xác suất đỗ.
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
