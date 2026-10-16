import { createClient } from "@/lib/supabase/server";
import type { FactTuition } from "@/types/database.types";
import type { CommonFilter } from "./filters";

export async function getTuition(f: CommonFilter = {}): Promise<FactTuition[]> {
  const sb = await createClient();
  let q = sb.from("fact_tuition").select("*");
  if (f.universityCode) q = q.eq("university_code", f.universityCode);
  const { data } = await q.order("university_code").order("academic_year");
  return (data ?? []) as FactTuition[];
}
