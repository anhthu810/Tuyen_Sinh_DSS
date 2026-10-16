import { createClient } from "@/lib/supabase/server";
import type { FactEmployment, FactLaborDemand } from "@/types/database.types";
import type { CommonFilter } from "./filters";

export type EmploymentRow = FactEmployment & {
  major_name: string | null;
  university_code: string;
};

export async function getEmployment(f: CommonFilter = {}): Promise<EmploymentRow[]> {
  const sb = await createClient();
  let q = sb.from("fact_employment").select("*, dim_program(major_name, khoi_nganh, industry_group)");
  if (f.universityCode) q = q.eq("university_code", f.universityCode);
  const { data } = await q.order("employment_rate_pct", { ascending: false });
  let rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const p = r.dim_program as { major_name?: string; khoi_nganh?: string; industry_group?: string } | null;
    return {
      ...(r as unknown as FactEmployment),
      major_name: p?.major_name ?? null,
      _khoi: p?.khoi_nganh ?? null,
      _ig: p?.industry_group ?? null,
    };
  });
  if (f.khoiNganh) rows = rows.filter((r) => r._khoi === f.khoiNganh);
  if (f.industryGroup) rows = rows.filter((r) => r._ig === f.industryGroup);
  return rows as unknown as EmploymentRow[];
}

export async function getLaborDemand(industryGroup?: string): Promise<FactLaborDemand[]> {
  const sb = await createClient();
  let q = sb.from("fact_labor_demand").select("*");
  if (industryGroup) q = q.eq("industry_group", industryGroup);
  const { data } = await q.order("industry_group").order("period_end_year");
  return (data ?? []) as FactLaborDemand[];
}
