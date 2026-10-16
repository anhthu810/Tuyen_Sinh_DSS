// Bảng màu biểu đồ dùng chung (đã cân nhắc tương phản light + dark).
// Dùng cho mọi chart (Recharts) để toàn app nhất quán.
export const chartPalette = {
  // Dãy phân loại (categorical) — tối đa 8 chuỗi.
  categorical: [
    "#4f46e5", // indigo
    "#0891b2", // cyan
    "#16a34a", // green
    "#d97706", // amber
    "#db2777", // pink
    "#7c3aed", // violet
    "#0d9488", // teal
    "#ca8a04", // yellow-700
  ],
  // Vai trò ngữ nghĩa cho dự báo điểm chuẩn (Q2).
  actual: "#4f46e5",
  naive: "#94a3b8",
  ma2: "#0891b2",
  band: "#6366f1", // dải sai số (dùng với opacity thấp)
  // Trạng thái.
  positive: "#16a34a",
  negative: "#dc2626",
  warning: "#d97706",
  neutral: "#64748b",
  grid: "#e2e8f0",
};

export type ChartTone = "positive" | "negative" | "warning" | "neutral";
