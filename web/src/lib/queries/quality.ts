import { createClient } from "@/lib/supabase/server";

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

  const { data: conf } = await sb
    .from("fact_cutoff_score")
    .select("confidence, scale_confirmed");
  const cutoffConfidence: Record<string, number> = {};
  let unconfirmed = 0;
  for (const r of (conf ?? []) as { confidence: string | null; scale_confirmed: boolean | null }[]) {
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
