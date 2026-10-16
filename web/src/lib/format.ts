// Định dạng số liệu tiếng Việt dùng chung.

const vndFmt = new Intl.NumberFormat("vi-VN");

/** 308820000 -> "308.820.000 ₫" */
export function formatVnd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return vndFmt.format(Math.round(n)) + " ₫";
}

/** 308820000 -> "~309 triệu ₫" (gọn cho card) */
export function formatVndShort(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + " tỷ ₫";
  if (n >= 1_000_000) return Math.round(n / 1_000_000).toLocaleString("vi-VN") + " triệu ₫";
  return vndFmt.format(Math.round(n)) + " ₫";
}

/** 64.8 -> "64,8%" (đầu vào là phần trăm, không phải phân số) */
export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits).replace(".", ",") + "%";
}

/** 1.3458 -> "1,35" */
export function formatNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits).replace(".", ",");
}
