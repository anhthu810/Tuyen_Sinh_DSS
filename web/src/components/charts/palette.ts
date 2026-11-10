// Bảng màu biểu đồ tối giản theo chuẩn EIS/DSS (≤ 5 sắc độ màu).
// Màu nhấn (xanh/vàng/đỏ) chỉ dùng cho trạng thái (Chắc đỗ/An toàn · Vừa sức/Lưu ý · Với cao/Nguy cơ).
export const chartPalette = {
  // Dãy phân loại tối đa 5 sắc độ: indigo, slate, green, amber, red.
  categorical: [
    "#4f46e5", // indigo (dữ liệu chính)
    "#64748b", // slate (tham chiếu / cơ sở)
    "#16a34a", // green (an toàn / tích cực)
    "#d97706", // amber (lưu ý / vừa sức)
    "#dc2626", // red (nguy cơ / với cao)
  ],
  // Vai trò ngữ nghĩa cho dự báo & mô phỏng.
  actual: "#4f46e5", // indigo
  naive: "#94a3b8", // light slate (mốc cơ sở)
  ma2: "#334155", // dark slate
  band: "#4f46e5", // dải sai số ±MAE (opacity thấp)
  // Màu trạng thái duy nhất cho Reach / Match / Safety & Nguy cơ / An toàn.
  positive: "#16a34a",
  warning: "#d97706",
  negative: "#dc2626",
  neutral: "#64748b",
  grid: "#e2e8f0",
};

export type ChartTone = "positive" | "negative" | "warning" | "neutral";
