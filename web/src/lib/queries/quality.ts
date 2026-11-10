import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/queries/paginate";

export type QualityStats = {
  rowCounts: Record<string, number>;
  cutoffConfidence: Record<string, number>; // 'Cao'|'Trung bình'|'Thấp' -> count
  cutoffScaleUnconfirmed: number; // số dòng scale_confirmed = false
};

const TABLES = [
  "dim_university",
  "dim_program",
  "dim_student",
  "fact_exam_score",
  "fact_cutoff_score",
  "fact_quota",
  "fact_tuition",
  "fact_employment",
  "fact_labor_demand",
  "fact_salary",
  "main_dataset",
  "fact_cutoff_forecast",
  "fact_application_method",
];

export async function getQualityStats(): Promise<QualityStats> {
  const sb = await createClient();

  const counts = await Promise.all(
    TABLES.map(async (t) => {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    }),
  );

  // > 1000 dòng → đọc theo trang (trước đây bị cắt ở 1000 dòng đầu).
  const conf = await fetchAllRows<{ confidence: string | null; scale_confirmed: boolean | null }>(
    () => sb.from("fact_cutoff_score").select("confidence, scale_confirmed").order("cutoff_id"),
  );
  const cutoffConfidence: Record<string, number> = {};
  let unconfirmed = 0;
  for (const r of conf) {
    const k = r.confidence ?? "—";
    cutoffConfidence[k] = (cutoffConfidence[k] ?? 0) + 1;
    if (r.scale_confirmed === false) unconfirmed++;
  }

  return {
    rowCounts: Object.fromEntries(counts),
    cutoffConfidence,
    cutoffScaleUnconfirmed: unconfirmed,
  };
}

export type RegulationCheck = { rule_name: string; check_result: string; n_rows: number };

/** Tóm tắt kiểm tra quy chế (view v_regulation_check_summary, migration 02). */
export async function getRegulationChecks(): Promise<RegulationCheck[] | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("v_regulation_check_summary")
    .select("rule_name, check_result, n_rows")
    .order("rule_name")
    .order("check_result");
  if (error) return null; // view chưa tạo
  return (data ?? []) as RegulationCheck[];
}
