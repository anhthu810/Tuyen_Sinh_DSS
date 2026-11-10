import { createClient } from "@/lib/supabase/server";
import type {
  WhatIfApplication,
  WhatIfDataset,
  WhatIfStudent,
  WhatIfUniversity,
} from "@/lib/dss/what-if";

type RawStudentRow = {
  student_id: string;
  cohort_year: number;
  is_thpt_graduated: boolean;
  family_budget_vnd_year: number;
};

type RawAppRow = {
  student_id: string;
  nv_order: number;
  university_code: string;
  best_method: string | null;
  best_margin_30: number | null;
  is_eligible: boolean | null;
  est_total_cost_vnd: number | null;
  family_budget_vnd_year: number | null;
  duration_years: number | null;
  affordability_index_pct: number | null;
};

const PAGE_SIZE = 1000;

async function fetchAllApplications(): Promise<RawAppRow[]> {
  const sb = await createClient();
  const rows: RawAppRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("main_dataset")
      .select(
        "student_id, nv_order, university_code, best_method, best_margin_30, is_eligible, est_total_cost_vnd, family_budget_vnd_year, duration_years, affordability_index_pct",
      )
      .order("student_id")
      .order("nv_order")
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data?.length) break;
    rows.push(...(data as RawAppRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Tải toàn bộ dữ liệu 500 học sinh, 7 trường và 3.096 nguyện vọng để chạy mô phỏng What-if.
 */
export async function loadWhatIfDataset(): Promise<WhatIfDataset> {
  const sb = await createClient();

  const [studentsRes, unisRes, rawApps] = await Promise.all([
    sb
      .from("dim_student")
      .select("student_id, cohort_year, is_thpt_graduated, family_budget_vnd_year")
      .order("student_id")
      .limit(1000),
    sb
      .from("dim_university")
      .select("university_code, short_name, university_name, tier")
      .order("university_code"),
    fetchAllApplications(),
  ]);

  const appsByStudent = new Map<string, WhatIfApplication[]>();
  for (const r of rawApps) {
    const list = appsByStudent.get(r.student_id) ?? [];
    list.push({
      nv_order: r.nv_order,
      university_code: r.university_code,
      best_method: r.best_method,
      best_margin_30: r.best_margin_30,
      is_eligible: Boolean(r.is_eligible),
      est_total_cost_vnd: r.est_total_cost_vnd,
      family_budget_vnd_year: r.family_budget_vnd_year,
      duration_years: r.duration_years,
      affordability_index_pct: r.affordability_index_pct,
    });
    appsByStudent.set(r.student_id, list);
  }

  for (const list of appsByStudent.values()) {
    list.sort((a, b) => a.nv_order - b.nv_order);
  }

  const rawStudents = (studentsRes.data ?? []) as RawStudentRow[];
  const students: WhatIfStudent[] = rawStudents.map((s) => ({
    student_id: s.student_id,
    cohort_year: s.cohort_year,
    is_thpt_graduated: Boolean(s.is_thpt_graduated),
    family_budget_vnd_year: s.family_budget_vnd_year,
    applications: appsByStudent.get(s.student_id) ?? [],
  }));

  const universities = (unisRes.data ?? []) as WhatIfUniversity[];

  return {
    students,
    universities,
    totalApplications: rawApps.length,
  };
}

