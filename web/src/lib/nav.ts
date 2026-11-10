// Cấu hình điều hướng 4 trang cốt lõi chuẩn EIS/DSS (Assignment 3).
export type NavItem = {
  href: string;
  label: string;
  icon: string; // tên icon lucide-react
  title: string;
  description: string;
  stage: string;
  milestone?: string;
  childPrefixes?: string[];
};

export const NAV: NavItem[] = [
  {
    href: "/",
    label: "Tổng quan KPI",
    icon: "LayoutDashboard",
    title: "Tổng quan KPI (Executive Overview)",
    description:
      "6–7 chỉ số cốt lõi (7±2) phản ánh hiệu quả trúng tuyển, sai số dự báo, cơ hội việc làm và rủi ro tài chính trên 7 trường · 380 ngành · 500 HS.",
    stage: "Executive",
    childPrefixes: ["/bao-cao"],
  },
  {
    href: "/chan-doan",
    label: "Insight & Chẩn đoán",
    icon: "Target",
    title: "Insight & Chẩn đoán (Diagnostic)",
    description:
      "Phân bổ nguyện vọng (Với cao / Vừa sức / Chắc đỗ), tương quan điểm thi – học phí – việc làm và điểm nghẽn mô hình theo hồ sơ học sinh.",
    stage: "Diagnostic",
    childPrefixes: ["/nguyen-vong", "/tu-van", "/khuyen-nghi", "/viec-lam", "/chi-phi", "/explorer"],
  },
  {
    href: "/du-bao",
    label: "Dự báo & Độ tin cậy",
    icon: "TrendingUp",
    title: "Dự báo & Độ tin cậy (Forecasting)",
    description:
      "Dự báo điểm chuẩn (MA2 / NAIVE) kèm biên sai số ±MAE, khoảng tin cậy và kiểm định độ phủ dữ liệu.",
    stage: "Forecasting",
    childPrefixes: ["/diem-chuan", "/chat-luong-du-lieu"],
  },
  {
    href: "/what-if",
    label: "What-if & Khuyến nghị",
    icon: "SlidersHorizontal",
    title: "Kịch bản What-if & Khuyến nghị (Prescriptive)",
    description:
      "Thanh trượt giả lập điểm thi, học phí, chỉ tiêu & ngân sách; đường cong độ nhạy và quy tắc khuyến nghị hành động IF–THEN.",
    stage: "Prescriptive",
  },
];

export const NAV_BY_HREF = Object.fromEntries(NAV.map((n) => [n.href, n]));
