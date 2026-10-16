import { createClient } from "@/lib/supabase/server";
import type { DimUniversity } from "@/types/database.types";

export type CommonFilter = {
  universityCode?: string;
  khoiNganh?: string;
  industryGroup?: string;
  year?: number;
  search?: string;
};

export async function getUniversities(): Promise<DimUniversity[]> {
  const sb = await createClient();
  const { data } = await sb.from("dim_university").select("*").order("university_code");
  return (data ?? []) as DimUniversity[];
}

async function distinct(column: string): Promise<string[]> {
  const sb = await createClient();
  const { data } = await sb.from("dim_program").select(column).not(column, "is", null);
  const set = new Set<string>();
  for (const r of (data ?? []) as unknown as Record<string, string>[]) {
    const v = r[column];
    if (v) set.add(v);
  }
  return [...set].sort();
}

export function getKhoiNganhList(): Promise<string[]> {
  return distinct("khoi_nganh");
}

export function getIndustryGroups(): Promise<string[]> {
  return distinct("industry_group");
}
