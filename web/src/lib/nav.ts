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
    href: "/tu-van-ai",
    label: "Tư vấn AI",
    icon: "Bot",
    title: "Tư vấn AI chọn ngành",
    description:
      "Nhập điểm + mô tả tính cách/sở thích → GLM-5.3 phân tích và gợi ý 3–5 ngành phù hợp nhất kèm lý do.",
  },
  {
    href: "/tu-van",
    label: "Tư vấn chọn ngành",
    icon: "Target",
    title: "Tư vấn chọn ngành & trường",
    description:
      "Nhập điểm (thang 30) → quét toàn bộ ngành, phân loại cơ hội đỗ và gợi ý ngành/trường phù hợp theo sở thích, việc làm, chi phí.",
  },
  {
    href: "/nguyen-vong",
    label: "Xếp nguyện vọng",
    icon: "ListOrdered",
    title: "Xếp nguyện vọng",
    description:
      "Xếp NV vừa có cơ hội vào ngành mơ ước, vừa chắc đỗ — phân loại reach / match / safety.",
    milestone: "M3 + M4",
  },
  {
    href: "/diem-chuan",
    label: "Dự báo điểm chuẩn",
    icon: "TrendingUp",
    title: "Dự báo điểm chuẩn",
    description: "Dự báo (NAIVE/MA2) vs thực tế, sai số MAE (K03) và khoảng an toàn nên giữ.",
    milestone: "M3",
  },
  {
    href: "/viec-lam",
    label: "Cơ hội việc làm",
    icon: "Briefcase",
    title: "Cơ hội việc làm",
    description: "Tỷ lệ việc làm (K05) + tăng trưởng nhu cầu ngành (K04) theo nhóm nghề.",
    milestone: "M3",
  },
  {
    href: "/chi-phi",
    label: "Chi phí & chi trả",
    icon: "Wallet",
    title: "Chi phí & khả năng chi trả",
    description: "Tổng chi phí toàn khóa (K06) và áp lực tài chính so với ngân sách (K07).",
    milestone: "M3",
  },
  {
    href: "/khuyen-nghi",
    label: "Khuyến nghị tổng hợp",
    icon: "Sparkles",
    title: "Khuyến nghị tổng hợp",
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
