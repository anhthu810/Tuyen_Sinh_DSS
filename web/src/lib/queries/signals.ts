import { createClient } from "@/lib/supabase/server";
import { METHOD_ACTUAL, isMa2 } from "@/lib/queries/forecast";
import { fetchAllRows } from "@/lib/queries/paginate";

// "Tín hiệu" tổng hợp cho mỗi ngành — phục vụ tư vấn khi HS nhập điểm.
export type ProgramSignal = {
  programId: string;
  majorName: string | null;
  universityCode: string;
  shortName: string | null;
  subjectCombinations: string[];
  hollandCode: string | null;
  industryGroup: string | null;
  durationYears: number | null;
  latestCutoff30: number | null;
  latestCutoffYear: number | null;
  forecast30: number | null;
  forecastYear: number | null;
  mae: number | null;
  minEligibility30: number | null; // ngưỡng đầu vào (≠ điểm chuẩn)
  employmentRate: number | null;
  tuitionMid: number | null;
};

export function parseSubjectCombinations(
  value: string | null | undefined,
): string[] {
  return (
    value
      ?.split(/[;,，]/)
      .map((combination) => combination.trim().toUpperCase())
      .filter((combination) => /^[A-Z]\d{2}$/.test(combination)) ?? []
  );
}

export async function getSubjectCombinationOptions(): Promise<string[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("dim_program")
    .select("subject_combinations")
    .limit(1000);
  return [
    ...new Set(
      (data ?? []).flatMap((program) =>
        parseSubjectCombinations(program.subject_combinations),
      ),
    ),
  ].sort();
}

export async function getProgramSignals(): Promise<ProgramSignal[]> {
  const sb = await createClient();
  const [progs, cuts, fcs, emps, tuis] = await Promise.all([
    sb
      .from("dim_program")
      .select(
        "program_id, major_name, university_code, subject_combinations, holland_code, industry_group, duration_years, dim_university(short_name)",
      )
      .limit(1000),
    // Ngưỡng đầu vào (≠ điểm chuẩn) — năm gần nhất có ngưỡng.
    fetchAllRows<{
      program_id: string;
      admission_year: number;
      minimum_eligibility_score: number;
    }>(() =>
      sb
        .from("fact_cutoff_score")
        .select("program_id, admission_year, minimum_eligibility_score")
        .not("minimum_eligibility_score", "is", null)
        .order("cutoff_id"),
    ).catch(() => []), // cột chưa có (chưa chạy migration 02) → bỏ qua ngưỡng
    // Chỉ nhóm THPT (điểm thi / quy đổi chung) — không trộn học bạ, TSA, HSA...
    fetchAllRows<{
      program_id: string;
      target_year: number;
      method: string | null;
      forecast_cutoff_30: number | null;
      actual_cutoff: number | null;
      score_scale: number | null;
      abs_error: number | null;
      is_primary: boolean | null;
    }>(() =>
      sb
        .from("fact_cutoff_forecast")
        .select(
          "program_id, target_year, method, forecast_cutoff_30, actual_cutoff, score_scale, abs_error, is_primary",
        )
        .eq("method_family", 1)
        .in("score_scale", [30, 40])
        .order("forecast_id"),
    ).catch(() => []),
    sb.from("fact_employment").select("program_id, employment_rate_pct"),
    sb
      .from("fact_tuition")
      .select("university_code, program_id, tuition_mid_vnd_year"),
  ]);

  const minElig: Record<string, { y: number; v: number }> = {};
  for (const r of cuts) {
    const cur = minElig[r.program_id];
    if (!cur || r.admission_year > cur.y)
      minElig[r.program_id] = { y: r.admission_year, v: r.minimum_eligibility_score };
  }

  // Điểm chuẩn gần nhất (thang 30): ưu tiên chuỗi chính; nếu ngành chưa có chuỗi
  // chính (mới 1 năm dữ liệu) thì lấy điểm THPT/quy đổi chung cao nhất năm gần nhất.
  const latest: Record<string, { y: number; v: number; primary: boolean }> = {};
  const fc: Record<string, { y: number; v: number }> = {};
  const maeAcc: Record<string, { s: number; n: number }> = {};
  for (const r of fcs) {
    const primary = r.is_primary === true;
    if (r.method === METHOD_ACTUAL && r.actual_cutoff != null) {
      const v30 = r.score_scale === 40 ? r.actual_cutoff * 0.75 : r.actual_cutoff;
      const cur = latest[r.program_id];
      const better =
        !cur ||
        (primary && !cur.primary) ||
        (primary === cur.primary &&
          (r.target_year > cur.y || (r.target_year === cur.y && v30 > cur.v)));
      if (better) latest[r.program_id] = { y: r.target_year, v: v30, primary };
      continue;
    }
    if (!primary || !isMa2(r.method)) continue;
    if (r.forecast_cutoff_30 != null && r.actual_cutoff == null) {
      const cur = fc[r.program_id];
      if (!cur || r.target_year > cur.y)
        fc[r.program_id] = { y: r.target_year, v: r.forecast_cutoff_30 };
    }
    if (r.abs_error != null) {
      maeAcc[r.program_id] ??= { s: 0, n: 0 };
      maeAcc[r.program_id].s += r.score_scale === 40 ? r.abs_error * 0.75 : r.abs_error;
      maeAcc[r.program_id].n += 1;
    }
  }

  const emp: Record<string, { s: number; n: number }> = {};
  for (const r of (emps.data ?? []) as {
    program_id: string;
    employment_rate_pct: number | null;
  }[]) {
    if (r.employment_rate_pct == null) continue;
    emp[r.program_id] ??= { s: 0, n: 0 };
    emp[r.program_id].s += r.employment_rate_pct;
    emp[r.program_id].n += 1;
  }

  const tuiProg: Record<string, number> = {};
  const tuiUni: Record<string, number> = {};
  for (const r of (tuis.data ?? []) as {
    university_code: string;
    program_id: string | null;
    tuition_mid_vnd_year: number | null;
  }[]) {
    if (r.tuition_mid_vnd_year == null) continue;
    if (r.program_id && r.program_id !== "ALL")
      tuiProg[r.program_id] = r.tuition_mid_vnd_year;
    else if (r.program_id === "ALL")
      tuiUni[r.university_code] = r.tuition_mid_vnd_year;
  }

  return ((progs.data ?? []) as Record<string, unknown>[]).map((p) => {
    const u = p.dim_university as { short_name?: string } | null;
    const pid = p.program_id as string;
    return {
      programId: pid,
      majorName: (p.major_name as string) ?? null,
      universityCode: p.university_code as string,
      shortName: u?.short_name ?? null,
      subjectCombinations: parseSubjectCombinations(
        p.subject_combinations as string | null,
      ),
      hollandCode: (p.holland_code as string) ?? null,
      industryGroup: (p.industry_group as string) ?? null,
      durationYears: (p.duration_years as number) ?? null,
      latestCutoff30: latest[pid]?.v ?? null,
      latestCutoffYear: latest[pid]?.y ?? null,
      forecast30: fc[pid]?.v ?? null,
      forecastYear: fc[pid]?.y ?? null,
      mae: maeAcc[pid] ? maeAcc[pid].s / maeAcc[pid].n : null,
      minEligibility30: minElig[pid]?.v ?? null,
      employmentRate: emp[pid] ? emp[pid].s / emp[pid].n : null,
      tuitionMid: tuiProg[pid] ?? tuiUni[p.university_code as string] ?? null,
    };
  });
}
