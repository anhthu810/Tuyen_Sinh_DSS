import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/queries/paginate";
import { METHOD_ACTUAL } from "@/lib/queries/forecast";
import {
  ALL,
  DEFAULT_SCALES,
  FAMILY_BY_METHOD_GROUP,
  METHOD_GROUP_BY_FAMILY,
  modelOf,
  normalizeText,
  type ForecastFilters,
  type ModelType,
  type SchoolOption,
} from "@/lib/dss/forecast-filter";
import type { ForecastStatus, MethodFamily, MethodGroup } from "@/types/database.types";

export type { SchoolOption };

/** Danh mục trường lấy động từ dim_university (chỉ trường có ít nhất 1 ngành). */
export async function getSchoolOptions(): Promise<SchoolOption[]> {
  const sb = await createClient();
  const [unis, progs] = await Promise.all([
    sb.from("dim_university").select("university_code, university_name, short_name"),
    sb.from("dim_program").select("university_code").limit(1000),
  ]);
  if (unis.error) throw new Error(unis.error.message);
  const withPrograms = new Set((progs.data ?? []).map((p) => p.university_code as string));
  return ((unis.data ?? []) as { university_code: string; university_name: string; short_name: string | null }[])
    .filter((u) => withPrograms.size === 0 || withPrograms.has(u.university_code))
    .map((u) => ({ code: u.university_code, name: u.university_name, shortName: u.short_name }))
    .sort((a, b) => (a.shortName ?? a.code).localeCompare(b.shortName ?? b.code, "vi"));
}

/** Các thang điểm gốc đang có trong dữ liệu (30, 40, 100, 150, 1200...). */
export async function getScaleOptions(): Promise<number[]> {
  const sb = await createClient();
  try {
    const rows = await fetchAllRows<{ score_scale: number | null }>(() =>
      sb
        .from("fact_cutoff_forecast")
        .select("score_scale")
        .eq("method", METHOD_ACTUAL)
        .not("score_scale", "is", null)
        .order("forecast_id"),
    );
    const set = new Set(rows.map((r) => Number(r.score_scale)));
    return set.size ? [...set].sort((a, b) => a - b) : [...DEFAULT_SCALES];
  } catch {
    return [...DEFAULT_SCALES];
  }
}

/** Một dòng kết quả = một chuỗi (trường + ngành + phương thức + tổ hợp + thang). */
export type SeriesSummary = {
  seriesKey: string;
  programId: string;
  majorName: string | null;
  schoolCode: string;
  schoolName: string | null;
  methodGroup: MethodGroup | null;
  admissionMethod: string | null;
  examType: string | null;
  subjectCombination: string | null;
  scoreScale: number | null;
  status: ForecastStatus | null;
  isPrimary: boolean;
  latestYear: number | null;
  latestActual: number | null;
  targetYear: number | null;
  forecasts: Record<ModelType, number | null>;
  mae: Record<ModelType, number | null>;
  nHistoryYears: number | null;
};

type Row = {
  series_key: string | null;
  program_id: string;
  university_code: string;
  target_year: number;
  method: string | null;
  forecast_cutoff: number | null;
  actual_cutoff: number | null;
  abs_error: number | null;
  admission_method: string | null;
  exam_type: string | null;
  method_family: MethodFamily | null;
  subject_combination: string | null;
  score_scale: number | null;
  forecast_status: ForecastStatus | null;
  n_history_years: number | null;
  is_primary: boolean | null;
};

const COLS =
  "series_key, program_id, university_code, target_year, method, forecast_cutoff, actual_cutoff, abs_error, admission_method, exam_type, method_family, subject_combination, score_scale, forecast_status, n_history_years, is_primary";

/** Ngưỡng số mã ngành để đẩy lọc từ khóa xuống DB bằng IN (...) — tránh URL quá dài. */
const MAX_IN_IDS = 150;

/**
 * Lọc fact_cutoff_forecast với điều kiện động: tham số 'ALL'/rỗng → bỏ điều kiện.
 *   schoolCode  → university_code = ?
 *   methodGroup → method_family = ?   (tương đương method_group, chạy được cả khi chưa có 05)
 *   scoreScale  → score_scale = ?     (thang gốc, không quy đổi)
 *   keyword     → tên ngành / mã ngành / program_id (không phân biệt dấu)
 *   modelType   → chuỗi có dòng dự báo năm tới của mô hình đó (Holt chỉ khi ≥ 3 năm)
 */
export async function searchForecastSeries(f: ForecastFilters): Promise<SeriesSummary[]> {
  const sb = await createClient();

  const [progRes, schools] = await Promise.all([
    sb.from("dim_program").select("program_id, major_name, major_code, university_code").limit(1000),
    getSchoolOptions().catch(() => [] as SchoolOption[]),
  ]);
  const programs = (progRes.data ?? []) as {
    program_id: string;
    major_name: string | null;
    major_code: string | null;
  }[];
  const majorById = new Map(programs.map((p) => [p.program_id, p.major_name]));
  const schoolByCode = new Map(schools.map((s) => [s.code, s.shortName ?? s.name]));

  // Từ khóa: so khớp không dấu trên tên ngành + mã ngành.
  const kw = normalizeText(f.keyword);
  let keywordIds: Set<string> | null = null;
  if (kw) {
    keywordIds = new Set(
      programs
        .filter(
          (p) =>
            normalizeText(p.major_name).includes(kw) ||
            normalizeText(p.program_id).includes(kw) ||
            normalizeText(p.major_code).includes(kw),
        )
        .map((p) => p.program_id),
    );
    if (keywordIds.size === 0) return [];
  }

  const rows = await fetchAllRows<Row>(() => {
    let q = sb.from("fact_cutoff_forecast").select(COLS);
    if (f.schoolCode !== ALL) q = q.eq("university_code", f.schoolCode);
    if (f.methodGroup !== ALL) q = q.eq("method_family", FAMILY_BY_METHOD_GROUP[f.methodGroup]);
    if (f.scoreScale !== ALL) q = q.eq("score_scale", f.scoreScale);
    if (keywordIds && keywordIds.size <= MAX_IN_IDS) q = q.in("program_id", [...keywordIds]);
    return q.order("forecast_id");
  });

  const map = new Map<string, SeriesSummary & { _err: Record<ModelType, number[]> }>();
  for (const r of rows) {
    if (keywordIds && !keywordIds.has(r.program_id)) continue;
    const key = r.series_key ?? `${r.program_id}|legacy`;
    let s = map.get(key);
    if (!s) {
      s = {
        seriesKey: key,
        programId: r.program_id,
        majorName: majorById.get(r.program_id) ?? null,
        schoolCode: r.university_code,
        schoolName: schoolByCode.get(r.university_code) ?? null,
        methodGroup: r.method_family ? METHOD_GROUP_BY_FAMILY[r.method_family] : null,
        admissionMethod: r.admission_method,
        examType: r.exam_type,
        subjectCombination: r.subject_combination,
        scoreScale: r.score_scale,
        status: r.forecast_status,
        isPrimary: r.is_primary === true,
        latestYear: null,
        latestActual: null,
        targetYear: null,
        forecasts: { MA2: null, NAIVE: null, HOLT: null },
        mae: { MA2: null, NAIVE: null, HOLT: null },
        nHistoryYears: null,
        _err: { MA2: [], NAIVE: [], HOLT: [] },
      };
      map.set(key, s);
    }
    if (r.method === METHOD_ACTUAL) {
      if (r.actual_cutoff != null && (s.latestYear == null || r.target_year > s.latestYear)) {
        s.latestYear = r.target_year;
        s.latestActual = r.actual_cutoff;
        s.subjectCombination = r.subject_combination ?? s.subjectCombination;
      }
      continue;
    }
    const model = modelOf(r.method);
    if (!model) continue;
    if (r.actual_cutoff == null && r.forecast_cutoff != null) {
      // Dòng dự báo năm tới (chưa có thực tế).
      if (s.targetYear == null || r.target_year >= s.targetYear) {
        s.targetYear = r.target_year;
        s.forecasts[model] = r.forecast_cutoff;
        s.nHistoryYears = Math.max(s.nHistoryYears ?? 0, r.n_history_years ?? 0) || null;
      }
    } else if (r.abs_error != null) {
      s._err[model].push(Number(r.abs_error));
    }
  }

  const out: SeriesSummary[] = [];
  for (const { _err, ...s } of map.values()) {
    if (f.modelType !== ALL && s.forecasts[f.modelType] == null) continue;
    for (const m of Object.keys(_err) as ModelType[]) {
      const e = _err[m];
      s.mae[m] = e.length ? Math.round((e.reduce((a, b) => a + b, 0) / e.length) * 100) / 100 : null;
    }
    out.push(s);
  }

  return out.sort(
    (a, b) =>
      (a.schoolName ?? a.schoolCode).localeCompare(b.schoolName ?? b.schoolCode, "vi") ||
      (a.majorName ?? a.programId).localeCompare(b.majorName ?? b.programId, "vi") ||
      Number(b.isPrimary) - Number(a.isPrimary) ||
      (a.methodGroup ? FAMILY_BY_METHOD_GROUP[a.methodGroup] : 9) -
        (b.methodGroup ? FAMILY_BY_METHOD_GROUP[b.methodGroup] : 9) ||
      (a.scoreScale ?? 0) - (b.scoreScale ?? 0),
  );
}
