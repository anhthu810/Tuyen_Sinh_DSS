-- ============================================================================
-- 002_kpi_views.sql
-- DSS "Tư vấn Tuyển sinh & Hướng nghiệp" (Nhóm 5) — KPI + derived-view layer
-- Target: PostgreSQL / Supabase (public schema)
-- Depends on: 001_schema.sql (base tables below must already exist)
-- Idempotent: every object uses CREATE OR REPLACE.
-- ----------------------------------------------------------------------------
-- WHAT THIS FILE CONTAINS
--   Part 0  Parameters / assumptions (KPI_Sheet "THAM SỐ") + helper functions.
--   Part 1  4 derived VIEWS: v_main_dataset, v_student_outcome,
--           v_coverage_real, v_coverage_sim  (+ internal v_application_method_agg).
--   Part 2  7 KPIs K01–K07 as VIEWS (+ detail views & SQL functions).
-- ----------------------------------------------------------------------------
-- BASE TABLES ASSUMED (canonical names — Data_Dictionary is authoritative):
--   dim_university(university_code PK, university_name, short_name, tier,
--       tier_rank, field_focus, admission_website)
--   dim_program(program_id PK, university_code, major_code, admission_code,
--       major_name, program_type, khoi_nganh, khoi_nganh_name, industry_group,
--       subject_combinations, holland_code, duration_years, years_offered,
--       source_version, note)
--   dim_student(student_id PK, cohort_year, profile_created_date, gender,
--       priority_area, priority_bonus_base, high_school_type, subject_track,
--       interest_industry, holland_code, gpa_grade10/11/12, ielts_score,
--       tsa_score, hsa_score, spt_score, family_budget_vnd_year, n_test_types,
--       candidate_type, thpt_graduation_year, is_thpt_graduated, exam_status,
--       special_case, case_note, data_batch)
--   fact_exam_score(score_id PK, student_id, exam_year, exam_date,
--       score_* , hb_* , registered_subjects, absent_subjects,
--       exempt_subjects, failing_subjects)
--   fact_application(application_id PK, student_id, registration_date,
--       result_date, nv_order, program_id, ref_cutoff_30, is_eligible,
--       is_admitted, holland_match_pct, first_year_tuition_vnd,
--       tuition_is_imputed, living_support_vnd_year, est_total_cost_vnd,
--       affordability_index_pct, scholarship_eligibility_score, score_eligible,
--       combo_is_assumed, not_admitted_reason)
--   fact_application_method(app_method_id PK, application_id, cutoff_id,
--       admission_method, combination_used, raw_score, priority_bonus,
--       final_score, score_scale, cutoff_score, score_margin, score_margin_30,
--       is_eligible, converted_from)
--   fact_cutoff_score(cutoff_id PK, program_id, university_code, admission_year,
--       announce_date, announce_date_is_approx, admission_method, method_group,
--       subject_combination, cutoff_score, score_scale, scale_confirmed,
--       cutoff_score_30, is_missing, n_sources_agree, confidence, source_type,
--       source_url, note, published_code, data_version)
--   fact_quota(quota_id PK, program_id, university_code, admission_year,
--       plan_date, admission_method, quota, source_type, source_url, note,
--       published_code, data_version, quota_scope)
--   fact_tuition(tuition_id PK, university_code, program_id, granularity,
--       academic_year, academic_year_start_date, amount_min, amount_max, unit,
--       tuition_min_vnd_year, tuition_max_vnd_year, tuition_mid_vnd_year,
--       is_converted_from_credit, source_type, source_url, note)
--   fact_employment(employment_id PK, program_id, university_code,
--       program_label, graduation_year, survey_year, employment_rate_pct,
--       n_graduates, n_responses, note, source_url, source_type, survey_date,
--       granularity)
--   fact_labor_demand(demand_id PK, industry_group, period_end_year, metric,
--       value, unit, source_name, source_url, note, period_end_date)
--   fact_cutoff_forecast(forecast_id PK, program_id, university_code,
--       target_year, forecast_date, method, forecast_cutoff, actual_cutoff,
--       error, abs_error)
--
--   fact_salary (Source_Log S08) and fact_macro_labor (S10) are referenced by
--   the Source_Log but HAVE NO DATA SHEET in v5 — treated as OPTIONAL/FUTURE.
--   No KPI below needs them; see risks note at bottom of this file.
-- ----------------------------------------------------------------------------
-- SERVER-SIDE (SQL, this file) vs CLIENT-SIDE (web app) split
--   * Compute SERVER-SIDE (here): every KPI and every derived view. They are
--     set-based aggregations / window functions over thousands of rows; doing
--     them in SQL keeps one source of truth and lets Supabase push filters
--     down (indexes on the FK + year columns). The app should SELECT from these
--     views with a WHERE clause, never re-implement the formulas in JS.
--   * Compute CLIENT-SIDE (app): only presentation — number/VND/% formatting,
--     RIASEC "what-if" previews for programs a student has NOT applied to (call
--     fn_holland_match_pct via RPC), colour thresholds (e.g. K05 >= 90 green),
--     and chart binning. No business rule lives in the client.
-- ----------------------------------------------------------------------------
-- PARAMETERIZATION the app passes as a WHERE filter on these views:
--   per-student  : student_id = $1
--   per-cohort   : cohort_year = $1            (KPI views already roll this up;
--                                                cohort_year IS NULL = overall)
--   per-program  : program_id = $1
--   per-university: university_code = $1
--   per-industry : industry_group = $1
-- All KPI views keep raw numerator/denominator columns so the app can
-- re-aggregate across any slice without losing precision.
-- ============================================================================


-- ============================================================================
-- PART 0 — PARAMETERS / ASSUMPTIONS  (KPI_Sheet → "THAM SỐ / GIẢ ĐỊNH", src S12)
-- ============================================================================
-- Constants used across the KPIs (kept here once, inlined where needed):
--   Chi phí sinh hoạt Hà Nội            = 54,000,000 VND/năm  (4,5tr × 12)
--   Tăng học phí/năm                    = 10%  (×1.1^k)
--   Số tín chỉ/năm (quy đổi học phí)     = 35
--   Hỗ trợ sinh hoạt SV sư phạm (NĐ116) = 36,300,000 VND/năm (3,63tr × 10 tháng)
--   Quy đổi TSA → thang 30              = 9.6 + 0.248 × TSA   (cặp tương đương HUST 2026)
--   Quy đổi HSA → thang 30              = 14.6 + 0.117 × HSA  (cặp tương đương NEU 2026)
--   Ngưỡng giảm điểm ưu tiên            = 22.5 (quy chế tuyển sinh từ 2023;
--                                          priority_bonus bị giảm tuyến tính về 0
--                                          khi final_score trong [22.5, 30])
--   Ngày thi THPT 2026 / cửa sổ NV 2026 = 11/06 ; 15–28/07 (giả định)
-- Exposed as a queryable view so the app / notebooks read the same numbers:

CREATE OR REPLACE VIEW v_kpi_params AS
SELECT *
FROM (VALUES
    ('living_cost_vnd_year'       , 54000000::numeric, 'Chi phí sinh hoạt Hà Nội (VND/năm) – giả định 4,5tr×12'),
    ('tuition_growth_rate'        ,       0.10::numeric, 'Tăng học phí/năm (×1.1^k)'),
    ('credits_per_year'           ,         35::numeric, 'Số tín chỉ/năm (quy đổi học phí tín chỉ → VND/năm)'),
    ('living_support_sp_vnd_year' , 36300000::numeric, 'Hỗ trợ sinh hoạt SV sư phạm (NĐ 116/2020) = 3,63tr×10'),
    ('priority_bonus_cap'         ,       22.5::numeric, 'Ngưỡng giảm điểm ưu tiên (quy chế từ 2023)'),
    ('tsa_to30_intercept'         ,        9.6::numeric, 'Quy đổi TSA→30: a trong a + b×TSA'),
    ('tsa_to30_slope'             ,      0.248::numeric, 'Quy đổi TSA→30: b trong a + b×TSA'),
    ('hsa_to30_intercept'         ,       14.6::numeric, 'Quy đổi HSA→30: a trong a + b×HSA'),
    ('hsa_to30_slope'             ,      0.117::numeric, 'Quy đổi HSA→30: b trong a + b×HSA')
) AS t(param_key, param_value, note);


-- --- Helper: TSA (thang 100) → thang 30 ------------------------------------
CREATE OR REPLACE FUNCTION fn_tsa_to_30(tsa numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN tsa IS NULL THEN NULL ELSE round(9.6 + 0.248 * tsa, 2) END;
$$;

-- --- Helper: HSA (thang 150) → thang 30 ------------------------------------
CREATE OR REPLACE FUNCTION fn_hsa_to_30(hsa numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN hsa IS NULL THEN NULL ELSE round(14.6 + 0.117 * hsa, 2) END;
$$;

-- --- Helper: Holland (RIASEC) match %  (reconstructed from main_dataset) ----
-- RULE (reverse-engineered from the 11 distinct holland_match_pct values in the
-- main_dataset sheet; all observed pairs reproduced exactly):
--   Both codes are 3 letters. For each student letter at position i (1..3) that
--   also appears in the program code at position j, award weight (8 - i - j):
--       exact i=j gives 6/4/2 for pos 1/2/3; a displaced letter earns less;
--       a letter absent from the program earns 0.
--   Any permutation of the SAME 3 letters sums to the maximum 12 → 100%.
--   Score % = round( Σ(8-i-j) / 12 * 100 , 1 ).
-- Used by the app for "what-if" program suggestions; it reproduces the stored
-- fact_application.holland_match_pct (see COALESCE in v_main_dataset).
CREATE OR REPLACE FUNCTION fn_holland_match_pct(student_code text, program_code text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN student_code IS NULL OR program_code IS NULL
             OR length(student_code) < 3 OR length(program_code) < 3 THEN NULL
        ELSE round(
            100.0 * COALESCE((
                SELECT SUM(8 - i - strpos(program_code, substr(student_code, i, 1)))
                FROM generate_series(1, 3) AS i
                WHERE strpos(program_code, substr(student_code, i, 1)) > 0
            ), 0) / 12.0
        , 1)
    END;
$$;

-- --- Helper: total 4/5/6-year cost (VND)  — the K06 formula ------------------
--   Σ_{k=0}^{years-1} first_year_tuition × 1.1^k  (geometric series)
--     + (54,000,000 − living_support) × years
-- Reproduces fact_application.est_total_cost_vnd.
CREATE OR REPLACE FUNCTION fn_est_total_cost(
    first_year_tuition numeric, years integer, living_support numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN years IS NULL OR years <= 0 THEN NULL
        ELSE round(
            COALESCE(first_year_tuition,0) * (power(1.1, years) - 1) / 0.1          -- tuition, +10%/năm
          + (54000000 - COALESCE(living_support,0)) * years                        -- sinh hoạt − hỗ trợ
        , 0)
    END;
$$;

-- --- Helper: financial affordability index (%) — the K07 per-NV formula ------
--   est_total_cost / (family_budget_year × years) × 100
-- i.e. total course cost vs total family budget over the course.
-- Reproduces fact_application.affordability_index_pct.
CREATE OR REPLACE FUNCTION fn_affordability_index(
    est_total numeric, family_budget_year numeric, years integer
) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN family_budget_year IS NULL OR family_budget_year = 0
             OR years IS NULL OR years <= 0 THEN NULL
        ELSE round(100.0 * est_total / (family_budget_year * years), 1)
    END;
$$;


-- ============================================================================
-- PART 1 — DERIVED VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_application_method_agg  (internal helper; README calls this "v_application_summary")
-- Per-application roll-up of fact_application_method. Feeds v_main_dataset and
-- v_student_outcome so the best-method logic lives in exactly one place.
--   n_methods_evaluated : # phương thức NV được xét        = COUNT(*)
--   n_methods_eligible  : # phương thức "đủ điểm"          = COUNT(score_margin_30 >= 0)
--                         (score sufficiency only; graduation handled downstream)
--   best_margin_30      : biên điểm tốt nhất (thang 30)    = MAX(score_margin_30)
--   best_method         : phương thức đạt biên tốt nhất; QUY_DOI_CHUNG rows are
--                         relabelled QUY_DOI_CHUNG(TSA)/(HSA) using converted_from,
--                         matching the best_method domain in the main_dataset sheet.
-- Applications with NO method rows (33 of 3096 — e.g. "Chưa có điểm chuẩn năm
-- này") are absent here and become NULL/0 after the LEFT JOIN downstream.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_application_method_agg AS
WITH per_app AS (
    SELECT
        fam.application_id,
        COUNT(*)                                             AS n_methods_evaluated,
        COUNT(*) FILTER (WHERE fam.score_margin_30 >= 0)     AS n_methods_eligible,
        MAX(fam.score_margin_30)                             AS best_margin_30
    FROM fact_application_method fam
    GROUP BY fam.application_id
),
best AS (
    -- DISTINCT ON picks the single highest-margin method per application;
    -- app_method_id is the deterministic tie-breaker.
    SELECT DISTINCT ON (fam.application_id)
        fam.application_id,
        CASE
            WHEN fam.admission_method = 'QUY_DOI_CHUNG' AND fam.converted_from IS NOT NULL
                THEN 'QUY_DOI_CHUNG(' || fam.converted_from || ')'
            ELSE fam.admission_method
        END AS best_method
    FROM fact_application_method fam
    ORDER BY fam.application_id, fam.score_margin_30 DESC NULLS LAST, fam.app_method_id
)
SELECT p.application_id,
       p.n_methods_evaluated,
       p.n_methods_eligible,
       p.best_margin_30,
       b.best_method
FROM per_app p
JOIN best b USING (application_id);


-- ----------------------------------------------------------------------------
-- v_main_dataset  (42 columns — one row per nguyện vọng / application)
-- Join: fact_application fa  ×  dim_student ds  ×  dim_program dp
--       ×  LEFT JOIN v_application_method_agg mam.
-- Column order follows the main_dataset sheet verbatim.
-- Computed-column rules (per Data_Dictionary + KPI_Sheet):
--   n_methods_evaluated / n_methods_eligible / best_method / best_margin_30
--        → from v_application_method_agg (see above).
--   holland_match_pct → stored fa value, with fn_holland_match_pct as the
--        documented rule / fallback (always equal for applied programs).
--   is_eligible  → score_eligible AND đã tốt nghiệp THPT
--        (computed here = fa.score_eligible AND ds.is_thpt_graduated).
--   is_admitted  → "NV đủ điểm có thứ tự nhỏ nhất" of the student. Passed through
--        from fa.is_admitted (authoritative: the simulator already resolved
--        TUYEN_THANG NV1, higher-priority admits, and no-cutoff NVs). Equivalent
--        live rule, for reference:
--          is_eligible AND nv_order = min(nv_order) FILTER (WHERE is_eligible)
--                                       OVER (PARTITION BY student_id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_main_dataset AS
SELECT
    fa.application_id,                                             -- 1
    fa.student_id,                                                -- 2
    ds.cohort_year,                                               -- 3
    fa.registration_date,                                        -- 4
    fa.result_date,                                              -- 5
    fa.nv_order,                                                 -- 6
    fa.program_id,                                               -- 7
    dp.university_code,                                          -- 8
    dp.major_code,                                               -- 9
    dp.major_name,                                               -- 10
    dp.khoi_nganh,                                               -- 11
    dp.industry_group,                                           -- 12
    fa.ref_cutoff_30,                                            -- 13
    COALESCE(mam.n_methods_evaluated, 0) AS n_methods_evaluated, -- 14
    COALESCE(mam.n_methods_eligible, 0)  AS n_methods_eligible,  -- 15
    mam.best_method,                                             -- 16  (NULL if no method rows)
    mam.best_margin_30,                                          -- 17  (NULL if no method rows)
    (fa.score_eligible AND ds.is_thpt_graduated) AS is_eligible, -- 18  rule: score_eligible AND tốt nghiệp
    fa.is_admitted,                                              -- 19  (see header rule)
    ds.gender,                                                   -- 20
    ds.priority_area,                                            -- 21
    ds.high_school_type,                                         -- 22
    ds.subject_track,                                            -- 23
    ds.interest_industry,                                        -- 24
    ds.holland_code,                                             -- 25  student RIASEC
    dp.holland_code AS program_holland_code,                     -- 26  program RIASEC
    COALESCE(fa.holland_match_pct,
             fn_holland_match_pct(ds.holland_code, dp.holland_code)) AS holland_match_pct, -- 27
    ds.n_test_types,                                             -- 28
    ds.family_budget_vnd_year,                                   -- 29
    dp.duration_years,                                           -- 30
    fa.first_year_tuition_vnd,                                   -- 31
    fa.tuition_is_imputed,                                       -- 32
    fa.living_support_vnd_year,                                  -- 33
    fa.est_total_cost_vnd,                                       -- 34
    fa.affordability_index_pct,                                  -- 35
    fa.scholarship_eligibility_score,                            -- 36
    ds.candidate_type,                                           -- 37
    ds.exam_status,                                              -- 38
    ds.is_thpt_graduated,                                        -- 39
    fa.score_eligible,                                           -- 40
    fa.not_admitted_reason,                                      -- 41
    fa.combo_is_assumed                                          -- 42
FROM fact_application fa
JOIN dim_student  ds ON ds.student_id = fa.student_id
JOIN dim_program  dp ON dp.program_id = fa.program_id
LEFT JOIN v_application_method_agg mam ON mam.application_id = fa.application_id;


-- ----------------------------------------------------------------------------
-- v_student_outcome  (11 columns — one row per student / admission outcome)
-- Computed rules:
--   n_nv                   = COUNT applications of the student
--   n_universities_applied = COUNT DISTINCT university_code across the NVs
--   admitted_*             = the single is_admitted NV (NULL if none);
--                            admitted_by_method = best_method of that NV.
--   admission_status:
--     'Trúng tuyển'                              if an admitted NV exists
--     'Không tốt nghiệp THPT – không được xét'   else if NOT is_thpt_graduated
--     'Trượt tất cả NV'                          otherwise
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_student_outcome AS
WITH app AS (
    SELECT fa.student_id, fa.application_id, fa.program_id, fa.nv_order,
           fa.is_admitted, dp.university_code
    FROM fact_application fa
    JOIN dim_program dp ON dp.program_id = fa.program_id
),
agg AS (
    SELECT student_id,
           COUNT(*)                           AS n_nv,
           COUNT(DISTINCT university_code)     AS n_universities_applied
    FROM app
    GROUP BY student_id
),
admitted AS (
    SELECT DISTINCT ON (a.student_id)
           a.student_id,
           a.nv_order     AS admitted_nv_order,
           a.program_id   AS admitted_program_id,
           ma.best_method AS admitted_by_method
    FROM app a
    LEFT JOIN v_application_method_agg ma ON ma.application_id = a.application_id
    WHERE a.is_admitted
    ORDER BY a.student_id, a.nv_order            -- guard against >1 admit
)
SELECT
    ds.student_id,
    ds.cohort_year,
    ds.special_case,
    ds.exam_status,
    ds.candidate_type,
    adm.admitted_nv_order,
    adm.admitted_program_id,
    adm.admitted_by_method,
    COALESCE(ag.n_nv, 0)                   AS n_nv,
    COALESCE(ag.n_universities_applied, 0) AS n_universities_applied,
    CASE
        WHEN adm.student_id IS NOT NULL      THEN 'Trúng tuyển'
        WHEN NOT ds.is_thpt_graduated        THEN 'Không tốt nghiệp THPT – không được xét'
        ELSE 'Trượt tất cả NV'
    END AS admission_status
FROM dim_student ds
LEFT JOIN agg      ag  ON ag.student_id  = ds.student_id
LEFT JOIN admitted adm ON adm.student_id = ds.student_id;


-- ----------------------------------------------------------------------------
-- v_coverage_real  (QA — ngành × năm cells of REAL data; ~380×4 grid)
-- One row per program × admission_year (2023–2026), whether offered or not.
--   is_offered      : year listed in dim_program.years_offered (';'-separated)
--   has_main_cutoff : có điểm chuẩn chính (THPT hoặc QUY_DOI_CHUNG, not missing)
--   n_cutoff_rows / n_admission_methods / methods : multiplicity of cutoffs
--   has_quota       : có chỉ tiêu cho ô ngành×năm
--   has_tuition_any : có học phí ngành hoặc toàn trường cho năm học Y–(Y+1)
--   max_sources_agree : độ kiểm chứng tối đa trên các dòng điểm chuẩn
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_coverage_real AS
WITH years(admission_year) AS (
    SELECT generate_series(2023, 2026)
),
grid AS (
    SELECT dp.program_id, dp.university_code, y.admission_year,
           (y.admission_year::text = ANY (string_to_array(dp.years_offered, ';'))) AS is_offered
    FROM dim_program dp
    CROSS JOIN years y
),
cut AS (
    SELECT program_id, admission_year,
           COUNT(*)                                          AS n_cutoff_rows,
           COUNT(DISTINCT admission_method)                  AS n_admission_methods,
           string_agg(DISTINCT admission_method, ';' ORDER BY admission_method) AS methods,
           bool_or(admission_method IN ('THPT','QUY_DOI_CHUNG')
                   AND NOT is_missing AND cutoff_score IS NOT NULL)             AS has_main_cutoff,
           MAX(n_sources_agree)                              AS max_sources_agree
    FROM fact_cutoff_score
    GROUP BY program_id, admission_year
)
SELECT
    g.program_id,
    g.university_code,
    g.admission_year,
    g.is_offered,
    COALESCE(c.has_main_cutoff, false)    AS has_main_cutoff,
    COALESCE(c.n_cutoff_rows, 0)          AS n_cutoff_rows,
    COALESCE(c.n_admission_methods, 0)    AS n_admission_methods,
    c.methods,
    EXISTS (SELECT 1 FROM fact_quota q
            WHERE q.program_id = g.program_id
              AND q.admission_year = g.admission_year)        AS has_quota,
    EXISTS (SELECT 1 FROM fact_tuition t
            WHERE t.university_code = g.university_code
              AND t.academic_year = g.admission_year::text || '-' || (g.admission_year + 1)::text)
                                                              AS has_tuition_any,
    COALESCE(c.max_sources_agree, 0)      AS max_sources_agree
FROM grid g
LEFT JOIN cut c ON c.program_id = g.program_id
                AND c.admission_year = g.admission_year;


-- ----------------------------------------------------------------------------
-- v_coverage_sim  (QA — ngành × năm cells of SIMULATED NVs; ~380×4 grid)
-- One row per program × cohort_year (NV year = student's cohort_year).
--   is_offered     : same as v_coverage_real
--   n_applications : số NV mô phỏng vào ô ngành×năm
--   n_admitted     : số NV trúng tuyển
--   n_methods_used : số phương thức thực sự được dùng để xét (distinct)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_coverage_sim AS
WITH years(cohort_year) AS (
    SELECT generate_series(2023, 2026)
),
grid AS (
    SELECT dp.program_id, y.cohort_year,
           (y.cohort_year::text = ANY (string_to_array(dp.years_offered, ';'))) AS is_offered
    FROM dim_program dp
    CROSS JOIN years y
),
apps AS (
    SELECT fa.program_id, ds.cohort_year,
           COUNT(*)                               AS n_applications,
           COUNT(*) FILTER (WHERE fa.is_admitted) AS n_admitted
    FROM fact_application fa
    JOIN dim_student ds ON ds.student_id = fa.student_id
    GROUP BY fa.program_id, ds.cohort_year
),
meth AS (
    SELECT fa.program_id, ds.cohort_year,
           COUNT(DISTINCT fam.admission_method)   AS n_methods_used
    FROM fact_application fa
    JOIN dim_student ds           ON ds.student_id = fa.student_id
    JOIN fact_application_method fam ON fam.application_id = fa.application_id
    GROUP BY fa.program_id, ds.cohort_year
)
SELECT
    g.program_id,
    g.cohort_year,
    g.is_offered,
    COALESCE(a.n_applications, 0) AS n_applications,
    COALESCE(a.n_admitted, 0)     AS n_admitted,
    COALESCE(m.n_methods_used, 0) AS n_methods_used
FROM grid g
LEFT JOIN apps a ON a.program_id = g.program_id AND a.cohort_year = g.cohort_year
LEFT JOIN meth m ON m.program_id = g.program_id AND m.cohort_year = g.cohort_year;


-- ============================================================================
-- PART 2 — KPIs K01–K07  (KPI_Sheet)
-- Convention for every KPI view:
--   * raw numerator & denominator columns are kept (re-aggregate at any slice);
--   * `ratio`   = raw proportion (0–1)  → matches KPI_Sheet "sample_value";
--   * `*_pct`   = ratio × 100           → matches KPI_Sheet "unit = %".
--   * GROUP BY GROUPING SETS ((cohort_year),()) → one row per cohort PLUS an
--     overall row where cohort_year IS NULL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- K01 — Tỷ lệ đỗ nhóm nguyện vọng mục tiêu (NV1–NV3)
--   decision_question : Q1 Xếp nguyện vọng thế nào để vừa có cơ hội vào ngành mơ
--                       ước, vừa chắc chắn đỗ?
--   formula_definition: Số HS trúng tuyển NV1–NV3 / Tổng số HS xét tuyển × 100
--   unit              : %
--   granularity       : HS × khóa
--   source_tables     : v_student_outcome, fact_application, fact_application_method
--   decision_meaning  : Thấp → danh sách quá mạo hiểm, bổ sung ngành/trường an toàn
--   NOTE (README mục 6): denominator = toàn bộ HS (gồm cả HS bỏ thi / không TN).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k01 AS
SELECT
    cohort_year,
    COUNT(*)                                                      AS n_students,
    COUNT(*) FILTER (WHERE admitted_nv_order BETWEEN 1 AND 3)     AS n_admitted_nv1_3,
    ROUND(COUNT(*) FILTER (WHERE admitted_nv_order BETWEEN 1 AND 3)::numeric
          / NULLIF(COUNT(*), 0), 4)                               AS ratio,
    ROUND(100.0 * COUNT(*) FILTER (WHERE admitted_nv_order BETWEEN 1 AND 3)
          / NULLIF(COUNT(*), 0), 2)                               AS rate_pct
FROM v_student_outcome
GROUP BY GROUPING SETS ((cohort_year), ());


-- ----------------------------------------------------------------------------
-- K02 — Lợi thế từ phương thức xét tuyển phụ
--   decision_question : Q1
--   formula_definition: Số NV đỗ có phương thức tốt nhất không phải điểm thi THPT
--                       / Tổng số NV đủ điểm × 100
--   unit              : %
--   granularity       : NV × phương thức
--   source_tables     : fact_application_method, v_main_dataset
--   decision_meaning  : Cao → tận dụng ĐGNL/ĐGTD hoặc học bạ để tăng cơ hội đỗ
--   NOTE: denominator uses is_eligible ("NV đủ điều kiện", per README K02 note).
--   To use the literal "NV đủ điểm" (score only), swap is_eligible → score_eligible
--   in both FILTERs (adds the 74 score-sufficient-but-not-graduated NVs).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k02 AS
SELECT
    cohort_year,
    COUNT(*) FILTER (WHERE is_eligible)                              AS n_eligible_nv,
    COUNT(*) FILTER (WHERE is_eligible AND best_method <> 'THPT')     AS n_eligible_nonthpt,
    ROUND(COUNT(*) FILTER (WHERE is_eligible AND best_method <> 'THPT')::numeric
          / NULLIF(COUNT(*) FILTER (WHERE is_eligible), 0), 4)        AS ratio,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_eligible AND best_method <> 'THPT')
          / NULLIF(COUNT(*) FILTER (WHERE is_eligible), 0), 2)        AS rate_pct
FROM v_main_dataset
GROUP BY GROUPING SETS ((cohort_year), ());


-- ----------------------------------------------------------------------------
-- K03 — Biên độ sai số dự báo điểm chuẩn (MAE, phương pháp MA2)
--   decision_question : Q2 Dự báo điểm chuẩn đáng tin đến đâu?
--   formula_definition: Trung bình |Điểm chuẩn thực tế − Điểm chuẩn dự báo|
--                       (MAE, phương pháp MA2)
--   unit              : điểm
--   granularity       : Ngành × năm
--   source_tables     : fact_cutoff_forecast, fact_cutoff_score
--   decision_meaning  : Nhỏ → yên tâm chốt thứ tự NV; lớn → giữ khoảng an toàn rộng
--   scope             : ngành thang 30, năm có thực tế (actual_cutoff NOT NULL).
--   abs_error is precomputed in fact_cutoff_forecast = |actual − forecast|.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k03 AS
SELECT
    target_year,
    COUNT(*)              AS n_forecasts,
    ROUND(AVG(abs_error), 4) AS mae   -- unit: điểm (thang 30)
FROM fact_cutoff_forecast
WHERE method LIKE 'MA2%'              -- 'MA2 (TB 2 năm trước)'
  AND actual_cutoff IS NOT NULL       -- chỉ ô đã có điểm chuẩn thực tế
GROUP BY GROUPING SETS ((target_year), ());


-- ----------------------------------------------------------------------------
-- K04 — Tốc độ tăng trưởng nhu cầu ngành
--   decision_question : Q3 Học xong ngành này có dễ xin việc?
--   formula_definition: (Chỉ số tuyển dụng năm hiện tại − năm trước) / năm trước × 100
--   unit              : %
--   granularity       : Nhóm nghề × năm
--   source_tables     : fact_labor_demand
--   decision_meaning  : Dương + K05 ≥ 90% → danh mục khuyến nghị; âm → cảnh báo bão hòa
--   IMPLEMENTATION: year-over-year growth within the SAME (industry_group, metric)
--   using LAG; only pairs where the same metric recurs across years produce a row.
--   LIMITATION (see risks): fact_labor_demand mixes incompatible metrics/units
--   across sources & years (22 rows). The KPI_Sheet sample −0.2918 for CNTT
--   2025→2026 is explicitly "minh họa" — it divides two DIFFERENT TopCV measures
--   (12.2% "Tỷ lệ DN ưu tiên tuyển" → 8.64% "Tỷ trọng nhu cầu"); this view will
--   NOT emit that illustrative value because it only compares like-with-like.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k04 AS
WITH base AS (
    SELECT industry_group, metric, period_end_year, value,
           LAG(value)           OVER (PARTITION BY industry_group, metric ORDER BY period_end_year) AS prior_value,
           LAG(period_end_year) OVER (PARTITION BY industry_group, metric ORDER BY period_end_year) AS prior_year
    FROM fact_labor_demand
)
SELECT
    industry_group,
    metric,
    prior_year,
    period_end_year         AS current_year,
    prior_value,
    value                   AS current_value,
    ROUND((value - prior_value) / NULLIF(prior_value, 0) * 100, 4) AS growth_pct
FROM base
WHERE prior_value IS NOT NULL
ORDER BY industry_group, metric, period_end_year;


-- ----------------------------------------------------------------------------
-- K05 — Tỷ lệ sinh viên có việc làm sau 1 năm
--   decision_question : Q3
--   formula_definition: Số SV có việc làm trong 12 tháng / Tổng số SV hoàn thành
--                       khảo sát × 100
--   unit              : %
--   granularity       : Ngành/lĩnh vực × khóa TN
--   source_tables     : fact_employment
--   decision_meaning  : ≥ 90% → đầu ra ổn định
--   IMPLEMENTATION: employment_rate_pct is already the per-row %; the KPI is the
--   simple average of rows that have data ("TB các dòng có số liệu"). Rolled up
--   by university_code + overall; join dim_program for per-industry_group slices.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k05 AS
SELECT
    university_code,
    COUNT(*)                                   AS n_rows_surveyed,
    ROUND(AVG(employment_rate_pct), 4)          AS avg_employment_rate_pct,
    ROUND(AVG(employment_rate_pct) / 100.0, 4)  AS ratio
FROM fact_employment
GROUP BY GROUPING SETS ((university_code), ());


-- ----------------------------------------------------------------------------
-- K06 — Tổng chi phí ước tính toàn khóa
--   decision_question : Q4 Gia đình có đủ sức lo chi phí học không?
--   formula_definition: Σ (Học phí năm đầu × 1,1^k) + (54 triệu − hỗ trợ sinh hoạt) × số năm học
--   unit              : VND
--   granularity       : HS × ngành
--   source_tables     : fact_tuition, dim_program, v_main_dataset
--   decision_meaning  : Số tiền gia đình cần chuẩn bị cho toàn khóa
--   scope             : TB các NV trúng tuyển
--   Per-NV value = fact_application.est_total_cost_vnd = fn_est_total_cost(...).
--   v_kpi_k06_detail exposes stored vs recomputed cost (should be equal).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k06_detail AS
SELECT
    m.application_id,
    m.student_id,
    m.program_id,
    m.cohort_year,
    m.is_admitted,
    m.first_year_tuition_vnd,
    m.duration_years,
    m.living_support_vnd_year,
    m.est_total_cost_vnd AS est_total_cost_stored,
    fn_est_total_cost(m.first_year_tuition_vnd, m.duration_years, m.living_support_vnd_year)
                         AS est_total_cost_computed
FROM v_main_dataset m;

CREATE OR REPLACE VIEW v_kpi_k06 AS
SELECT
    cohort_year,
    COUNT(*) FILTER (WHERE is_admitted)                               AS n_admitted,
    ROUND(AVG(est_total_cost_vnd) FILTER (WHERE is_admitted), 2)       AS avg_est_total_cost_admitted_vnd
FROM v_main_dataset
GROUP BY GROUPING SETS ((cohort_year), ());


-- ----------------------------------------------------------------------------
-- K07 — Chỉ số áp lực tài chính gia đình
--   decision_question : Q4
--   formula_definition: Tổng chi phí toàn khóa / Tổng ngân sách gia đình cho việc
--                       học × 100; ghi nhận = tỷ lệ HS vượt 100%
--   unit              : %
--   granularity       : HS × ngành
--   source_tables     : v_main_dataset, dim_student
--   decision_meaning  : > 100% → vượt khả năng: học bổng, tín dụng, hoặc trường
--                       học phí thấp hơn
--   scope             : Tỷ lệ HS trúng tuyển vượt ngân sách
--   Per-NV index = fact_application.affordability_index_pct
--       = fn_affordability_index(est_total_cost, family_budget_year, duration_years).
--   The reported KPI = share of admitted NVs/students with index > 100%.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_kpi_k07_detail AS
SELECT
    m.student_id,
    m.application_id,
    m.program_id,
    m.cohort_year,
    m.is_admitted,
    m.est_total_cost_vnd,
    m.family_budget_vnd_year,
    m.duration_years,
    m.affordability_index_pct AS affordability_index_pct_stored,
    fn_affordability_index(m.est_total_cost_vnd, m.family_budget_vnd_year, m.duration_years)
                              AS affordability_index_pct_computed,
    (m.affordability_index_pct > 100) AS exceeds_budget
FROM v_main_dataset m;

CREATE OR REPLACE VIEW v_kpi_k07 AS
SELECT
    cohort_year,
    COUNT(*) FILTER (WHERE is_admitted)                                           AS n_admitted,
    COUNT(*) FILTER (WHERE is_admitted AND affordability_index_pct > 100)           AS n_over_budget,
    ROUND(COUNT(*) FILTER (WHERE is_admitted AND affordability_index_pct > 100)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE is_admitted), 0), 4)                      AS ratio_over_budget,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_admitted AND affordability_index_pct > 100)
          / NULLIF(COUNT(*) FILTER (WHERE is_admitted), 0), 2)                      AS pct_over_budget
FROM v_main_dataset
GROUP BY GROUPING SETS ((cohort_year), ());


-- ============================================================================
-- SUGGESTED SUPPORTING INDEXES ON BASE TABLES (create in 001_schema.sql).
-- Views cannot be indexed; these back the joins/filters above:
--   CREATE INDEX IF NOT EXISTS ix_fa_student        ON fact_application(student_id);
--   CREATE INDEX IF NOT EXISTS ix_fa_program        ON fact_application(program_id);
--   CREATE INDEX IF NOT EXISTS ix_fam_application   ON fact_application_method(application_id);
--   CREATE INDEX IF NOT EXISTS ix_cut_prog_year     ON fact_cutoff_score(program_id, admission_year);
--   CREATE INDEX IF NOT EXISTS ix_quota_prog_year   ON fact_quota(program_id, admission_year);
--   CREATE INDEX IF NOT EXISTS ix_tui_uni_year      ON fact_tuition(university_code, academic_year);
--   CREATE INDEX IF NOT EXISTS ix_fcf_year_method   ON fact_cutoff_forecast(target_year, method);
-- For heavy dashboards, consider MATERIALIZED VIEWs for v_main_dataset &
-- v_coverage_* with REFRESH after each data load.
-- ============================================================================
