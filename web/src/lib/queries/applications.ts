import { createClient } from "@/lib/supabase/server";

export type StudentApplication = {
  application_id: string;
  program_id: string;
  major_name: string | null;
  university_code: string;
  short_name: string | null;
  industry_group: string | null;
  nv_order: number;
  best_method: string | null;
  best_margin_30: number | null;
  holland_match_pct: number | null;
  affordability_index_pct: number | null;
  est_total_cost_vnd: number | null;
  is_admitted: boolean | null;
  score_eligible: number | null;
};

/** Danh sách nguyện vọng của 1 HS (từ main_dataset), kèm short_name trường. */
export async function getStudentApplications(
  studentId: string,
): Promise<StudentApplication[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("main_dataset")
    .select(
      "application_id, program_id, major_name, university_code, industry_group, nv_order, best_method, best_margin_30, holland_match_pct, affordability_index_pct, est_total_cost_vnd, is_admitted, score_eligible, dim_university(short_name)",
    )
    .eq("student_id", studentId)
    .order("nv_order");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const u = r.dim_university as { short_name?: string } | null;
    return {
      application_id: r.application_id as string,
      program_id: r.program_id as string,
      major_name: (r.major_name as string) ?? null,
      university_code: r.university_code as string,
      short_name: u?.short_name ?? null,
      industry_group: (r.industry_group as string) ?? null,
      nv_order: r.nv_order as number,
      best_method: (r.best_method as string) ?? null,
      best_margin_30: (r.best_margin_30 as number) ?? null,
      holland_match_pct: (r.holland_match_pct as number) ?? null,
      affordability_index_pct: (r.affordability_index_pct as number) ?? null,
      est_total_cost_vnd: (r.est_total_cost_vnd as number) ?? null,
      is_admitted: (r.is_admitted as boolean) ?? null,
      score_eligible: (r.score_eligible as number) ?? null,
    };
  });
}

/** Map program_id -> tỷ lệ việc làm (%) trung bình, cho tập ngành cho trước. */
export async function getEmploymentRateByPrograms(
  programIds: string[],
): Promise<Record<string, number>> {
  if (!programIds.length) return {};
  const sb = await createClient();
  const { data } = await sb
    .from("fact_employment")
    .select("program_id, employment_rate_pct")
    .in("program_id", programIds);
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const r of (data ?? []) as { program_id: string; employment_rate_pct: number | null }[]) {
    if (r.employment_rate_pct == null) continue;
    (acc[r.program_id] ??= { sum: 0, n: 0 });
    acc[r.program_id].sum += r.employment_rate_pct;
    acc[r.program_id].n += 1;
  }
  const out: Record<string, number> = {};
  for (const [pid, v] of Object.entries(acc)) out[pid] = v.sum / v.n;
  return out;
}
