import { createClient } from "@/lib/supabase/server";
import type {
  DimProgram,
  DimUniversity,
  FactCutoffScore,
  FactQuota,
  FactTuition,
  FactEmployment,
  FactCutoffForecast,
} from "@/types/database.types";
import type { CommonFilter } from "./filters";

export type ProgramRow = DimProgram & {
  university_name: string | null;
  short_name: string | null;
};

export type ProgramDetail = {
  program: (DimProgram & { university: DimUniversity | null }) | null;
  cutoffs: FactCutoffScore[];
  quotas: FactQuota[];
  tuition: FactTuition[];
  employment: FactEmployment[];
  forecasts: FactCutoffForecast[];
};

export async function getPrograms(f: CommonFilter = {}): Promise<ProgramRow[]> {
  const sb = await createClient();
  let q = sb
    .from("dim_program")
    .select("*, dim_university(university_name, short_name)");
  if (f.universityCode) q = q.eq("university_code", f.universityCode);
  if (f.khoiNganh) q = q.eq("khoi_nganh", f.khoiNganh);
  if (f.industryGroup) q = q.eq("industry_group", f.industryGroup);
  if (f.search) q = q.ilike("major_name", `%${f.search}%`);
  const { data } = await q.order("program_id").limit(1000);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const u = r.dim_university as { university_name?: string; short_name?: string } | null;
    return {
      ...(r as unknown as DimProgram),
      university_name: u?.university_name ?? null,
      short_name: u?.short_name ?? null,
    };
  });
}

export async function getProgramDetail(programId: string): Promise<ProgramDetail> {
  const sb = await createClient();
  const [program, cutoffs, quotas, tuition, employment, forecasts] = await Promise.all([
    sb.from("dim_program").select("*, dim_university(*)").eq("program_id", programId).maybeSingle(),
    sb.from("fact_cutoff_score").select("*").eq("program_id", programId).order("admission_year"),
    sb.from("fact_quota").select("*").eq("program_id", programId).order("admission_year"),
    sb.from("fact_tuition").select("*").eq("program_id", programId),
    sb.from("fact_employment").select("*").eq("program_id", programId),
    sb.from("fact_cutoff_forecast").select("*").eq("program_id", programId).order("target_year"),
  ]);
  const p = program.data as (Record<string, unknown> & { dim_university?: DimUniversity }) | null;
  return {
    program: p
      ? ({ ...(p as unknown as DimProgram), university: (p.dim_university ?? null) as DimUniversity | null })
      : null,
    cutoffs: (cutoffs.data ?? []) as FactCutoffScore[],
    quotas: (quotas.data ?? []) as FactQuota[],
    tuition: (tuition.data ?? []) as FactTuition[],
    employment: (employment.data ?? []) as FactEmployment[],
    forecasts: (forecasts.data ?? []) as FactCutoffForecast[],
  };
}
