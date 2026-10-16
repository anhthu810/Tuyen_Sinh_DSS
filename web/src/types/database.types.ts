// Kiểu dữ liệu cho 13 bảng live trên Supabase (viết tay theo introspection thực tế).
// Khi có Postgres connection string / PAT có thể thay bằng:
//   npx supabase gen types typescript --project-id rihxlxjxnbobgwdzwqtp > src/types/database.types.ts

export type DimUniversity = {
  university_code: string;
  university_name: string;
  short_name: string | null;
  tier: string | null;
  field_focus: string | null;
  admission_website: string | null;
};

export type DimProgram = {
  program_id: string;
  university_code: string;
  major_code: string | null;
  admission_code: string | null;
  major_name: string;
  program_type: string | null;
  khoi_nganh: string | null;
  khoi_nganh_name: string | null;
  industry_group: string | null;
  subject_combinations: string | null; // 'A00;A01;D07'
  holland_code: string | null;
  duration_years: number | null;
  years_offered: string | null;
  in_simulation: boolean | null;
  source_version: string | null;
  note: string | null;
};

export type DimStudent = {
  student_id: string;
  cohort_year: number;
  gender: string;
  priority_area: string;
  priority_bonus_base: number;
  high_school_type: string;
  subject_track: string;
  interest_industry: string;
  holland_code: string;
  gpa_grade10: number;
  gpa_grade11: number;
  gpa_grade12: number;
  ielts_score: number | null;
  tsa_score: number | null;
  hsa_score: number | null;
  spt_score: number | null;
  family_budget_vnd_year: number;
  n_test_types: number;
  candidate_type: string;
  thpt_graduation_year: number | null;
  is_thpt_graduated: boolean;
  exam_status: string;
  special_case: string;
  case_note: string | null;
  admitted_nv_order: number | null;
  admitted_program_id: string | null;
  admitted_by_method: string | null;
  n_nv: number;
  n_universities_applied: number;
  admission_status: string; // 'Trúng tuyển' | 'Trượt tất cả NV' | 'Không tốt nghiệp THPT – không được xét'
};

export type FactExamScore = {
  score_id: string;
  student_id: string;
  exam_year: number | null;
  exam_date: string | null;
  score_math: number | null;
  score_physics: number | null;
  score_chemistry: number | null;
  score_biology: number | null;
  score_literature: number | null;
  score_history: number | null;
  score_geography: number | null;
  score_english: number | null;
  hb_math: number | null;
  hb_physics: number | null;
  hb_chemistry: number | null;
  hb_biology: number | null;
  hb_literature: number | null;
  hb_history: number | null;
  hb_geography: number | null;
  hb_english: number | null;
};

export type FactCutoffScore = {
  cutoff_id: string;
  program_id: string;
  university_code: string;
  admission_year: number;
  announce_date: string | null;
  announce_date_is_approx: boolean | null;
  admission_method: string | null;
  method_group: string | null;
  subject_combination: string | null;
  cutoff_score: number | null;
  score_scale: number | null;
  scale_confirmed: boolean | null;
  cutoff_score_30: number | null;
  is_missing: boolean | null;
  n_sources_agree: number | null;
  confidence: string | null;
  source_type: string | null;
  source_url: string | null;
  note: string | null;
  published_code: string | null;
  data_version: string | null;
};

export type FactQuota = {
  quota_id: string;
  program_id: string | null;
  university_code: string;
  admission_year: number;
  plan_date: string | null;
  admission_method: string | null;
  quota: number | null;
  source_type: string | null;
  quota_scope: string | null;
  note: string | null;
  source_url: string | null;
  published_code: string | null;
  data_version: string | null;
};

export type FactTuition = {
  tuition_id: string;
  university_code: string;
  program_id: string | null; // có thể là 'ALL'
  granularity: string | null;
  academic_year: string | null;
  academic_year_start_date: string | null;
  tuition_min_vnd_year: number | null;
  tuition_max_vnd_year: number | null;
  tuition_mid_vnd_year: number | null;
  is_converted_from_credit: boolean | null;
  source_type: string | null;
  note: string | null;
};

export type FactEmployment = {
  employment_id: string;
  program_id: string;
  university_code: string;
  program_label: string | null;
  graduation_year: number | null;
  survey_year: number | null;
  employment_rate_pct: number | null; // đã là %
  n_graduates: number | null;
  n_responses: number | null;
  source_type: string | null;
  survey_date: string | null;
  granularity: string | null;
  note: string | null;
  source_url: string | null;
};

export type FactLaborDemand = {
  demand_id: string;
  industry_group: string;
  period_end_year: number | null;
  metric: string | null;
  value: number | null;
  unit: string | null;
  note: string | null;
  period_end_date: string | null;
};

export type FactCutoffForecast = {
  forecast_id: string;
  program_id: string;
  university_code: string;
  target_year: number;
  forecast_date: string | null;
  method: string | null; // 'NAIVE (năm trước)' | 'MA2 (TB 2 năm trước)'
  forecast_cutoff: number | null;
  actual_cutoff: number | null;
  error: number | null;
  abs_error: number | null;
};

export type FactSalary = {
  salary_id: string;
  industry_group: string;
  reference_year: number | null;
  experience_level: string | null;
  salary_min_vnd_month: number | null;
  salary_max_vnd_month: number | null;
  salary_avg_vnd_month: number | null;
  salary_point_vnd_month: number | null;
  is_fresher: boolean | null;
  is_public_pay_scale: boolean | null;
  source_name: string | null;
  note: string | null;
};

export type MainDataset = {
  application_id: string;
  student_id: string;
  program_id: string;
  university_code: string;
  cohort_year: number;
  registration_date: string | null;
  result_date: string | null;
  nv_order: number;
  ref_cutoff_30: number | null;
  n_methods_evaluated: number | null;
  n_methods_eligible: number | null;
  best_method: string | null;
  best_margin_30: number | null;
  is_eligible: boolean | null;
  is_admitted: boolean | null;
  score_eligible: number | null; // 0/1 (numeric trong DB)
  holland_match_pct: number | null;
  major_code: string | null;
  major_name: string | null;
  khoi_nganh: string | null;
  industry_group: string | null;
  gender: string | null;
  priority_area: string | null;
  high_school_type: string | null;
  subject_track: string | null;
  interest_industry: string | null;
  holland_code: string | null;
  program_holland_code: string | null;
  n_test_types: number | null;
  duration_years: number | null;
  family_budget_vnd_year: number | null;
  first_year_tuition_vnd: number | null;
  tuition_is_imputed: boolean | null;
  living_support_vnd_year: number | null;
  est_total_cost_vnd: number | null;
  affordability_index_pct: number | null;
  scholarship_eligibility_score: number | null;
  candidate_type: string | null;
  exam_status: string | null;
  is_thpt_graduated: boolean | null;
  not_admitted_reason: string | null;
  combo_is_assumed: boolean | null;
};
