/**
 * Holt's Linear Trend (san bằng mũ kép) — dự báo điểm chuẩn 1 bước (năm kế tiếp).
 *
 *   Khởi tạo:  L = Y0,  T = Y1 − Y0
 *   Với mỗi t ≥ 1:
 *     Lt = α·Yt + (1 − α)·(Lt−1 + Tt−1)
 *     Tt = β·(Lt − Lt−1) + (1 − β)·Tt−1
 *   Dự báo:    Ŷ(t+1) = Lt + Tt
 *
 * Dải sai số: MAE của các dự báo 1 bước trong mẫu (từ năm thứ 3 trở đi),
 * tức đúng cách mô hình sẽ sai nếu đã chạy ở các năm trước.
 *
 * PHẢI khớp holt() trong etl/build_method_forecast.py.
 */

export const HOLT_ALPHA = 0.6;
export const HOLT_BETA = 0.2;
export const HOLT_MIN_YEARS = 3;

export type HoltResult = {
  forecast: number; // Ŷ năm kế tiếp, làm tròn 2 chữ số
  mae: number; // MAE dự báo 1 bước trong mẫu
  lower: number; // forecast − mae
  upper: number; // forecast + mae
  level: number;
  trend: number;
  nYears: number;
};

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * @param historyScores điểm chuẩn của MỘT chuỗi (trường + ngành + phương thức + thang),
 *                      sắp xếp theo năm tăng dần, các năm liên tiếp.
 * @returns null nếu < 3 năm hoặc có giá trị không hợp lệ.
 */
export function holtForecast(
  historyScores: readonly number[],
  alpha: number = HOLT_ALPHA,
  beta: number = HOLT_BETA,
): HoltResult | null {
  if (historyScores.length < HOLT_MIN_YEARS) return null;
  if (!historyScores.every(Number.isFinite)) return null;
  if (!(alpha > 0 && alpha <= 1 && beta > 0 && beta <= 1)) {
    throw new RangeError("alpha, beta phải thuộc (0, 1]");
  }

  let level = historyScores[0];
  let trend = historyScores[1] - historyScores[0];
  const absErrors: number[] = [];

  for (let t = 1; t < historyScores.length; t++) {
    const y = historyScores[t];
    // Dự báo 1 bước cho năm t (từ năm thứ 3 trở đi mới là dự báo thật, không dùng chính y để khởi tạo).
    if (t >= 2) absErrors.push(Math.abs(y - (level + trend)));
    const prevLevel = level;
    level = alpha * y + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const forecast = round2(level + trend);
  const mae = round2(absErrors.reduce((s, e) => s + e, 0) / absErrors.length);
  return {
    forecast,
    mae,
    lower: round2(forecast - mae),
    upper: round2(forecast + mae),
    level: round2(level),
    trend: round2(trend),
    nYears: historyScores.length,
  };
}
