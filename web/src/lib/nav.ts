// Cấu hình điều hướng + metadata trang (dùng chung cho sidebar và header).
export type NavItem = {
  href: string;
  label: string;
  icon: string; // tên icon lucide-react
  title: string;
  description: string;
  milestone?: string;
};

export const NAV: NavItem[] = [
  {
    href: "/",
    label: "Tổng quan",
    icon: "LayoutDashboard",
    title: "Tổng quan",
    description: "7 KPI chủ chốt (K01–K07) trên toàn bộ dữ liệu tuyển sinh 2023–2026.",
  },
  {
    href: "/nguyen-vong",
    label: "Q1 · Xếp nguyện vọng",
    icon: "ListOrdered",
    title: "Q1 · Xếp nguyện vọng",
    description:
      "Xếp NV vừa có cơ hội vào ngành mơ ước, vừa chắc đỗ — phân loại reach / match / safety.",
    milestone: "M3 + M4",
  },
  {
    href: "/diem-chuan",
    label: "Q2 · Dự báo điểm chuẩn",
    icon: "TrendingUp",
    title: "Q2 · Dự báo điểm chuẩn",
    description: "Dự báo (NAIVE/MA2) vs thực tế, sai số MAE (K03) và khoảng an toàn nên giữ.",
    milestone: "M3",
  },
  {
    href: "/viec-lam",
    label: "Q3 · Cơ hội việc làm",
    icon: "Briefcase",
    title: "Q3 · Cơ hội việc làm",
    description: "Tỷ lệ việc làm (K05) + tăng trưởng nhu cầu ngành (K04) theo nhóm nghề.",
    milestone: "M3",
  },
  {
    href: "/chi-phi",
    label: "Q4 · Chi phí & chi trả",
    icon: "Wallet",
    title: "Q4 · Chi phí & khả năng chi trả",
    description: "Tổng chi phí toàn khóa (K06) và áp lực tài chính so với ngân sách (K07).",
    milestone: "M3",
  },
  {
    href: "/khuyen-nghi",
    label: "Σ · Khuyến nghị tổng hợp",
    icon: "Sparkles",
    title: "Σ · Khuyến nghị tổng hợp",
    description:
      "Xếp hạng ngành theo 4 trục: phù hợp (Holland) · xác suất đỗ · việc làm · chi phí (trọng số chỉnh được).",
    milestone: "M4",
  },
  {
    href: "/explorer",
    label: "Tra cứu ngành",
    icon: "Search",
    title: "Tra cứu ngành",
    description: "Bảng 380 ngành với mọi dữ liệu fact; trang chi tiết từng ngành.",
    milestone: "M2",
  },
  {
    href: "/chat-luong-du-lieu",
    label: "Chất lượng dữ liệu",
    icon: "ShieldCheck",
    title: "Chất lượng & minh bạch dữ liệu",
    description:
      "Độ phủ, độ tin cậy, nhãn THẬT vs MÔ PHỎNG, phạm vi tính của từng KPI.",
    milestone: "M5",
  },
];

export const NAV_BY_HREF = Object.fromEntries(NAV.map((n) => [n.href, n]));
