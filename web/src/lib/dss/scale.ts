// Engine DSS — quy đổi thang điểm & xác suất (dùng cho Q1 & Σ).

// Quy đổi về thang 30 (giả định tuyến tính của nhóm — KPI_Sheet THAM SỐ).
export function tsaTo30(tsa: number): number {
  return 9.6 + 0.248 * tsa;
}
export function hsaTo30(hsa: number): number {
  return 14.6 + 0.117 * hsa;
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
