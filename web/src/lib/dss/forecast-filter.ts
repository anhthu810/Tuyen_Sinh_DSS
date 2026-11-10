// Bộ lọc dự báo điểm chuẩn — dùng chung cho Toolbar (client), trang /diem-chuan (server)
// và API /api/v1/forecasts. Không import gì phía server ở đây.
import type { MethodFamily, MethodGroup } from "@/types/database.types";

export const METHOD_GROUPS = [
  "GROUP_THPT",
  "GROUP_HOCBA",
  "GROUP_EXAM",
  "GROUP_COMBINED",
  "GROUP_TALENT",
] as const satisfies readonly MethodGroup[];

export const METHOD_GROUP_LABEL: Record<MethodGroup, string> = {
  GROUP_THPT: "Thi tốt nghiệp THPT",
  GROUP_HOCBA: "Học bạ",
  GROUP_EXAM: "ĐGNL / ĐGTD (HSA, TSA, SPT, SAT, V-ACT)",
  GROUP_COMBINED: "Xét tuyển kết hợp",
  GROUP_TALENT: "Năng khiếu / tài năng",
};

export const METHOD_GROUP_SHORT: Record<MethodGroup, string> = {
  GROUP_THPT: "THPT",
  GROUP_HOCBA: "Học bạ",
  GROUP_EXAM: "ĐGNL/ĐGTD",
  GROUP_COMBINED: "Kết hợp",
  GROUP_TALENT: "Năng khiếu",
};

/** method_family (1..5) trong DB ↔ method_group — khớp 05_method_group.sql. */
export const METHOD_GROUP_BY_FAMILY = {
  1: "GROUP_THPT",
  2: "GROUP_HOCBA",
  3: "GROUP_EXAM",
  4: "GROUP_COMBINED",
  5: "GROUP_TALENT",
} as const satisfies Record<MethodFamily, MethodGroup>;

export const FAMILY_BY_METHOD_GROUP: Record<MethodGroup, MethodFamily> = {
  GROUP_THPT: 1,
  GROUP_HOCBA: 2,
  GROUP_EXAM: 3,
  GROUP_COMBINED: 4,
  GROUP_TALENT: 5,
};

export const MODEL_TYPES = ["MA2", "NAIVE", "HOLT"] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

export const MODEL_LABEL: Record<ModelType, string> = {
  MA2: "MA2 (TB 2 năm)",
  NAIVE: "NAIVE (năm trước)",
  HOLT: "Holt's Linear Trend",
};

/** Thang mặc định khi chưa đọc được từ DB. */
export const DEFAULT_SCALES = [30, 40, 100, 150] as const;

export const ALL = "ALL" as const;

/** Một trường trong dropdown — lấy động từ /api/v1/schools hoặc getSchoolOptions(). */
export type SchoolOption = { code: string; name: string; shortName?: string | null };

export type ForecastFilters = {
  keyword: string;
  schoolCode: string | typeof ALL;
  methodGroup: MethodGroup | typeof ALL;
  scoreScale: number | typeof ALL;
  modelType: ModelType | typeof ALL;
};

export const DEFAULT_FILTERS: ForecastFilters = {
  keyword: "",
  schoolCode: ALL,
  methodGroup: ALL,
  scoreScale: ALL,
  modelType: ALL,
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(src: ParamSource, key: string): string | null {
  const v = src instanceof URLSearchParams ? src.get(key) : src[key];
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : null;
}

const isAll = (v: string | null) => v == null || v.toUpperCase() === ALL;

/**
 * Đọc bộ lọc từ query string. Giá trị rỗng / 'ALL' → bỏ lọc.
 * Giá trị sai định dạng được bỏ qua và ghi vào `errors` (API trả 400).
 */
export function parseForecastFilters(src: ParamSource): {
  filters: ForecastFilters;
  errors: string[];
} {
  const errors: string[] = [];
  const f: ForecastFilters = { ...DEFAULT_FILTERS };

  f.keyword = (read(src, "keyword") ?? "").slice(0, 100);

  const school = read(src, "schoolCode");
  if (!isAll(school)) {
    if (/^[A-Za-z0-9_-]{1,20}$/.test(school!)) f.schoolCode = school!.toUpperCase();
    else errors.push(`schoolCode không hợp lệ: ${school}`);
  }

  const group = read(src, "methodGroup");
  if (!isAll(group)) {
    const g = group!.toUpperCase() as MethodGroup;
    if ((METHOD_GROUPS as readonly string[]).includes(g)) f.methodGroup = g;
    else errors.push(`methodGroup phải thuộc ${METHOD_GROUPS.join(", ")} hoặc ALL`);
  }

  const scale = read(src, "scoreScale");
  if (!isAll(scale)) {
    const n = Number(scale);
    if (Number.isFinite(n) && n > 0 && n <= 2000) f.scoreScale = n;
    else errors.push(`scoreScale không hợp lệ: ${scale}`);
  }

  const model = read(src, "modelType");
  if (!isAll(model)) {
    const m = model!.toUpperCase() as ModelType;
    if ((MODEL_TYPES as readonly string[]).includes(m)) f.modelType = m;
    else errors.push(`modelType phải thuộc ${MODEL_TYPES.join(", ")} hoặc ALL`);
  }

  return { filters: f, errors };
}

/** Bộ lọc → query string (bỏ giá trị mặc định để URL gọn). */
export function filtersToSearchParams(f: ForecastFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.keyword.trim()) p.set("keyword", f.keyword.trim());
  if (f.schoolCode !== ALL) p.set("schoolCode", f.schoolCode);
  if (f.methodGroup !== ALL) p.set("methodGroup", f.methodGroup);
  if (f.scoreScale !== ALL) p.set("scoreScale", String(f.scoreScale));
  if (f.modelType !== ALL) p.set("modelType", f.modelType);
  return p;
}

export const isDefaultFilters = (f: ForecastFilters) =>
  filtersToSearchParams(f).toString() === "";

/** Chuẩn hóa để tìm không dấu: "Khoa học Máy tính" ~ "khoa hoc may tinh". */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** Loại mô hình từ cột method của fact_cutoff_forecast. */
export function modelOf(method: string | null): ModelType | null {
  const m = (method ?? "").toUpperCase();
  if (m.startsWith("HOLT")) return "HOLT";
  if (m.startsWith("MA2")) return "MA2";
  if (m.startsWith("NAIVE")) return "NAIVE";
  return null;
}
