import { createClient } from "@/lib/supabase/server";
import type { DimStudent } from "@/types/database.types";

export type StudentOption = {
  student_id: string;
  label: string;
};

export async function getStudentOptions(): Promise<StudentOption[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("dim_student")
    .select("student_id, cohort_year, interest_industry, special_case, admission_status")
    .order("student_id")
    .limit(600);
  return ((data ?? []) as Partial<DimStudent>[]).map((s) => ({
    student_id: s.student_id!,
    label: `${s.student_id} · ${s.cohort_year} · ${s.interest_industry ?? ""}${
      s.special_case && s.special_case !== "NORMAL" ? ` · ${s.special_case}` : ""
    }`,
  }));
}

export async function getStudent(id: string): Promise<DimStudent | null> {
  const sb = await createClient();
  const { data } = await sb.from("dim_student").select("*").eq("student_id", id).maybeSingle();
  return (data ?? null) as DimStudent | null;
}
