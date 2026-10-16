-- =====================================================================
-- DSS TƯ VẤN TUYỂN SINH & HƯỚNG NGHIỆP — Data Package v5 (Nhóm 5)
-- 001_schema.sql — AUTHORITATIVE base-table schema (Postgres / Supabase)
-- ---------------------------------------------------------------------
-- Scope        : 7 trường ĐH Hà Nội, 380 ngành/chương trình,
--                500 học sinh mô phỏng, năm tuyển sinh 2023–2026.
-- Derived from : _schema_facts.txt → sheet "Data_Dictionary" (259 rows,
--                authoritative) + per-column profile (null/range/distinct).
-- Star schema  : dim_university 1─< dim_program 1─<
--                  (fact_cutoff_score / fact_quota / fact_tuition /
--                   fact_employment / fact_cutoff_forecast);
--                dim_student 1─< fact_exam_score,
--                dim_student 1─< fact_application 1─< fact_application_method;
--                fact_application_method.cutoff_id ─> fact_cutoff_score
--                  (NULL cho phương thức TUYEN_THANG);
--                fact_labor_demand keyed by industry_group (no dim).
--
-- 12 base tables. Run order respects FK deps: DIMS FIRST, THEN FACTS.
-- Vietnamese labels are preserved VERBATIM (they are real data values).
--
-- Conventions / refinements applied:
--   * Data_Dictionary data_type -> Postgres:
--       Text -> text, Integer -> integer, Decimal -> numeric,
--       Date -> date, Boolean -> boolean.
--   * Money ("Integer (VND)" and tuition amounts) -> bigint
--       (VND amounts are large; bigint avoids any int32 overflow risk).
--   * Natural TEXT primary keys exactly as in the data (no surrogate uuids).
--   * FOREIGN KEYS added per the star schema with
--       ON UPDATE CASCADE ON DELETE RESTRICT (the live DB was MISSING these).
--   * Nullability taken from missing_count/nulls in the column profile.
--   * CHECK constraints only where the domain is small AND stable.
--   * Year columns are NOT range-checked (keep load-friendly for future
--     years); only NOT NULL is enforced. See trailing notes.
--   * Idempotent-friendly: CREATE TABLE/INDEX IF NOT EXISTS; RLS policies
--     use DROP POLICY IF EXISTS + CREATE POLICY.
-- =====================================================================


-- =====================================================================
-- SECTION 1 — DIMENSION TABLES (create first)
-- =====================================================================

-- ---------------------------------------------------------------------
-- dim_university  (source sheet: "university")
-- Grain: one row per university (Bộ GD&ĐT code). 7 rows.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_university (
    university_code     text PRIMARY KEY
        CONSTRAINT dim_university_code_chk
        CHECK (university_code IN ('BKA','KHA','YHB','SPH','DCN','TLA','HVN')),
    university_name     text    NOT NULL,   -- Tên trường đầy đủ
    short_name          text    NOT NULL,   -- Viết tắt (HUST, NEU, HMU, ...)
    tier                text    NOT NULL    -- Nhóm xếp hạng (do nhóm phân loại)
        CONSTRAINT dim_university_tier_chk
        CHECK (tier IN ('Top 1','Nhóm khá','Nhóm trung bình',
                        'Nhóm trung bình – thấp','Nhóm thấp')),
    tier_rank           integer NOT NULL
        CONSTRAINT dim_university_tier_rank_chk CHECK (tier_rank BETWEEN 1 AND 7),
    field_focus         text    NOT NULL,   -- Thế mạnh khối ngành
    admission_website   text    NOT NULL    -- URL tuyển sinh
);

-- ---------------------------------------------------------------------
-- dim_program  (source sheet: "program")
-- Grain: one row per chương trình/mã xét tuyển (= mã trường + mã ngành).
-- 380 rows.
-- NOTE on multi-value text columns (subject_combinations, years_offered):
--   V1 decision = KEEP AS TEXT (';'-separated, e.g. 'A00;A01;D07',
--   '2023;2024;2025;2026'). This is the pragmatic choice: the lists are
--   short, read-mostly, and only used for display/filtering in the web app.
--   Normalized alternative (if you later need to JOIN/aggregate by a single
--   combination or year): a child table
--       map_program_combination(program_id, subject_combination)  and/or
--       map_program_year(program_id, admission_year)
--   populated by SPLIT on ';'. Not required for v1.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_program (
    program_id          text PRIMARY KEY,          -- e.g. 'BKA_IT1'
    university_code     text    NOT NULL
        REFERENCES dim_university (university_code)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    major_code          text,                       -- mã ngành 7 số; NULL 138/380
    admission_code      text    NOT NULL,           -- mã xét tuyển riêng của trường
    major_name          text    NOT NULL,
    program_type        text    NOT NULL
        CONSTRAINT dim_program_type_chk
        CHECK (program_type IN ('Chuẩn','Tiên tiến/CLC','Tiếng Anh','POHE',
                                'Liên kết','Phân hiệu Thanh Hóa','Khác')),
    khoi_nganh          text    NOT NULL
        CONSTRAINT dim_program_khoi_nganh_chk
        CHECK (khoi_nganh IN ('I','II','III','IV','V','VI','VII')),
    khoi_nganh_name     text    NOT NULL,
    industry_group      text    NOT NULL,           -- nhóm nghề (khóa nối labor_demand); 23 giá trị, không CHECK
    subject_combinations text,                      -- ';'-separated; NULL 17/380
    holland_code        text    NOT NULL,           -- mã Holland của ngành (3 ký tự RIASEC)
    duration_years      integer NOT NULL
        CONSTRAINT dim_program_duration_chk CHECK (duration_years BETWEEN 4 AND 6),
    years_offered       text    NOT NULL,           -- ';'-separated, e.g. '2023;2024;2025;2026'
    source_version      text    NOT NULL,           -- 'v2 (49 ngành gốc)' / 'v3 (bổ sung)'
    note                text                        -- NULL 84/380
);

-- ---------------------------------------------------------------------
-- dim_student  (source sheet: "student")  — SIMULATED DATA
-- Grain: one row per học sinh mô phỏng. 500 rows (200 v2 + 300 v4).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_student (
    student_id              text PRIMARY KEY,        -- e.g. 'HS2023001'
    cohort_year             integer NOT NULL,        -- 2023–2026 (not range-checked)
    profile_created_date    date    NOT NULL,
    gender                  text    NOT NULL
        CONSTRAINT dim_student_gender_chk CHECK (gender IN ('Nam','Nữ')),
    priority_area           text    NOT NULL
        CONSTRAINT dim_student_priority_area_chk
        CHECK (priority_area IN ('KV1','KV2-NT','KV2','KV3')),
    priority_bonus_base     numeric NOT NULL
        CONSTRAINT dim_student_priority_bonus_base_chk CHECK (priority_bonus_base >= 0),
    high_school_type        text    NOT NULL
        CONSTRAINT dim_student_hs_type_chk
        CHECK (high_school_type IN ('Công lập','Tư thục','Chuyên')),
    subject_track           text    NOT NULL
        CONSTRAINT dim_student_subject_track_chk CHECK (subject_track IN ('A','B','C','D')),
    interest_industry       text    NOT NULL,        -- 23 giá trị, không CHECK
    holland_code            text    NOT NULL,        -- mã Holland HS (mô phỏng)
    gpa_grade10             numeric NOT NULL
        CONSTRAINT dim_student_gpa10_chk CHECK (gpa_grade10 BETWEEN 0 AND 10),
    gpa_grade11             numeric NOT NULL
        CONSTRAINT dim_student_gpa11_chk CHECK (gpa_grade11 BETWEEN 0 AND 10),
    gpa_grade12             numeric NOT NULL
        CONSTRAINT dim_student_gpa12_chk CHECK (gpa_grade12 BETWEEN 0 AND 10),
    ielts_score             numeric                  -- NULL ~65% (326/500)
        CONSTRAINT dim_student_ielts_chk CHECK (ielts_score BETWEEN 0 AND 9),
    tsa_score               numeric                  -- thang 100; NULL 350/500
        CONSTRAINT dim_student_tsa_chk CHECK (tsa_score BETWEEN 0 AND 100),
    hsa_score               numeric                  -- thang 150; NULL 361/500
        CONSTRAINT dim_student_hsa_chk CHECK (hsa_score BETWEEN 0 AND 150),
    spt_score               numeric                  -- chỉ khóa 2023; NULL 488/500
        CONSTRAINT dim_student_spt_chk CHECK (spt_score >= 0),
    family_budget_vnd_year  bigint  NOT NULL
        CONSTRAINT dim_student_budget_chk CHECK (family_budget_vnd_year >= 0),
    n_test_types            integer NOT NULL
        CONSTRAINT dim_student_n_test_types_chk CHECK (n_test_types >= 0),
    candidate_type          text    NOT NULL
        CONSTRAINT dim_student_candidate_type_chk
        CHECK (candidate_type IN ('Học sinh lớp 12 (đương niên)','Thí sinh tự do')),
    thpt_graduation_year    integer,                 -- NULL = chưa/không TN (32/500)
    is_thpt_graduated       boolean NOT NULL,
    exam_status             text    NOT NULL
        CONSTRAINT dim_student_exam_status_chk
        CHECK (exam_status IN ('Dự thi đầy đủ','Bỏ thi toàn bộ','Bỏ thi 1 bài thi',
                               'Có điểm liệt (≤ 1,0)','Miễn thi Ngoại ngữ (chứng chỉ)',
                               'Miễn thi toàn bộ – tuyển thẳng')),
    special_case            text    NOT NULL
        CONSTRAINT dim_student_special_case_chk
        CHECK (special_case IN ('NORMAL','TU_DO','BO_THI_TOAN_BO','BO_THI_1_MON',
                                'DIEM_LIET','MIEN_THI_NN','MIEN_THI_TOAN_BO')),
    case_note               text,                    -- NULL 396/500
    data_batch              text    NOT NULL
        CONSTRAINT dim_student_data_batch_chk
        CHECK (data_batch IN ('v2 (200 HS gốc)','v4 (bổ sung 300 HS)'))
);


-- =====================================================================
-- SECTION 2 — FACT TABLES (create after dims)
-- =====================================================================

-- ---------------------------------------------------------------------
-- fact_exam_score  (source sheet: "score")  — SIMULATED DATA
-- Grain: one điểm-record per học sinh (THPT scores + học bạ averages).
-- 500 rows (1:1 with dim_student in this package — see trailing notes).
-- Subject score columns are NULL when the student did not sit that paper
-- (from 2025: Toán, Văn + 2 môn tự chọn). học bạ (hb_*) columns always set.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_exam_score (
    score_id            text PRIMARY KEY,            -- e.g. 'SC2023001'
    student_id          text    NOT NULL
        REFERENCES dim_student (student_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    exam_year           integer NOT NULL,
    exam_date           date    NOT NULL,
    -- THPT per-subject scores (thang 10), NULL = không thi môn đó
    score_math          numeric CONSTRAINT fes_score_math_chk       CHECK (score_math       BETWEEN 0 AND 10),
    score_physics       numeric CONSTRAINT fes_score_physics_chk    CHECK (score_physics    BETWEEN 0 AND 10),
    score_chemistry     numeric CONSTRAINT fes_score_chemistry_chk  CHECK (score_chemistry  BETWEEN 0 AND 10),
    score_biology       numeric CONSTRAINT fes_score_biology_chk    CHECK (score_biology    BETWEEN 0 AND 10),
    score_literature    numeric CONSTRAINT fes_score_literature_chk CHECK (score_literature BETWEEN 0 AND 10),
    score_history       numeric CONSTRAINT fes_score_history_chk    CHECK (score_history    BETWEEN 0 AND 10),
    score_geography     numeric CONSTRAINT fes_score_geography_chk  CHECK (score_geography  BETWEEN 0 AND 10),
    score_english       numeric CONSTRAINT fes_score_english_chk    CHECK (score_english    BETWEEN 0 AND 10),
    -- Học bạ per-subject averages (3 năm, thang 10), NOT NULL
    hb_math             numeric NOT NULL CONSTRAINT fes_hb_math_chk       CHECK (hb_math       BETWEEN 0 AND 10),
    hb_physics          numeric NOT NULL CONSTRAINT fes_hb_physics_chk    CHECK (hb_physics    BETWEEN 0 AND 10),
    hb_chemistry        numeric NOT NULL CONSTRAINT fes_hb_chemistry_chk  CHECK (hb_chemistry  BETWEEN 0 AND 10),
    hb_biology          numeric NOT NULL CONSTRAINT fes_hb_biology_chk    CHECK (hb_biology    BETWEEN 0 AND 10),
    hb_literature       numeric NOT NULL CONSTRAINT fes_hb_literature_chk CHECK (hb_literature BETWEEN 0 AND 10),
    hb_history          numeric NOT NULL CONSTRAINT fes_hb_history_chk    CHECK (hb_history    BETWEEN 0 AND 10),
    hb_geography        numeric NOT NULL CONSTRAINT fes_hb_geography_chk  CHECK (hb_geography  BETWEEN 0 AND 10),
    hb_english          numeric NOT NULL CONSTRAINT fes_hb_english_chk    CHECK (hb_english    BETWEEN 0 AND 10),
    registered_subjects text    NOT NULL,            -- ';'-separated môn đăng ký thi
    absent_subjects     text,                        -- ';'-separated; NULL 476/500
    exempt_subjects     text,                        -- ';'-separated; NULL 468/500
    failing_subjects    text                         -- ';'-separated (điểm liệt); NULL 492/500
);

-- ---------------------------------------------------------------------
-- fact_cutoff_score  (source sheet: "cutoff_score")  — REAL DATA
-- Grain: one dòng điểm chuẩn = program × năm × phương thức × tổ hợp.
-- 2939 rows. Referenced by fact_application_method.cutoff_id.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_cutoff_score (
    cutoff_id               text PRIMARY KEY,         -- e.g. 'CUT0001'
    program_id              text    NOT NULL
        REFERENCES dim_program (program_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    university_code         text    NOT NULL
        REFERENCES dim_university (university_code)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    admission_year          integer NOT NULL,
    announce_date           date    NOT NULL,
    announce_date_is_approx boolean NOT NULL,
    admission_method        text    NOT NULL
        CONSTRAINT fcs_admission_method_chk
        CHECK (admission_method IN ('THPT','TSA','QUY_DOI_CHUNG','XTTN_CCQT',
            'XTTN_HSNL','HOC_BA','KET_HOP_XT','HSA','SAT','XTTH','SPT',
            'KET_HOP_CCNN','OTHER')),
    method_group            text    NOT NULL
        CONSTRAINT fcs_method_group_chk
        CHECK (method_group IN ('Điểm thi THPT','Đánh giá tư duy (TSA)',
            'Quy đổi chung (mọi phương thức)','Xét tuyển tài năng – CCQT',
            'Xét tuyển tài năng – hồ sơ năng lực','Học bạ',
            'Kết hợp (giải/chứng chỉ + học bạ)','Đánh giá năng lực (HSA)',
            'Chứng chỉ quốc tế (SAT)','Xét tuyển tổng hợp (học bạ + điều kiện)',
            'Đánh giá năng lực ĐHSP (SPT)','Kết hợp chứng chỉ ngoại ngữ',
            'Khác (V-ACT, XTTN gộp, ĐGNL quy đổi…)')),
    subject_combination     text    NOT NULL,         -- 'ALL' = mọi tổ hợp; 'HB' = học bạ; 185 giá trị
    cutoff_score            numeric,                  -- NULL 1/2939
    score_scale             integer                   -- NULL 21/2939
        CONSTRAINT fcs_score_scale_chk
        CHECK (score_scale IN (30,40,100,110,150,1200,1600)),
    scale_confirmed         boolean NOT NULL,         -- FALSE => không dùng cho mô phỏng
    cutoff_score_30         numeric                   -- chỉ thang 30/40; NULL 844/2939
        CONSTRAINT fcs_cutoff_30_chk CHECK (cutoff_score_30 BETWEEN 0 AND 30),
    is_missing              boolean NOT NULL,
    n_sources_agree         integer NOT NULL
        CONSTRAINT fcs_n_sources_chk CHECK (n_sources_agree >= 0),
    confidence              text    NOT NULL
        CONSTRAINT fcs_confidence_chk
        CHECK (confidence IN ('Cao','Trung bình','Thấp','Không có dữ liệu')),
    source_type             text    NOT NULL,
    source_url              text    NOT NULL,
    note                    text,                     -- NULL 282/2939
    published_code          text,                     -- NULL 136/2939
    data_version            text    NOT NULL
        CONSTRAINT fcs_data_version_chk CHECK (data_version IN ('v2','v3'))
);

-- ---------------------------------------------------------------------
-- fact_application  (source sheet: "application")  — SIMULATED DATA
-- Grain: one nguyện vọng (NV) = student × program wish. 3096 rows.
-- UNIQUE (student_id, nv_order): a student cannot file two NV with the
-- same priority order (true in this package; see trailing notes).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_application (
    application_id              text PRIMARY KEY,     -- e.g. 'APP00001'
    student_id                  text    NOT NULL
        REFERENCES dim_student (student_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    registration_date           date    NOT NULL,
    result_date                 date    NOT NULL,
    nv_order                    integer NOT NULL
        CONSTRAINT fa_nv_order_chk CHECK (nv_order BETWEEN 1 AND 10),
    program_id                  text    NOT NULL
        REFERENCES dim_program (program_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    ref_cutoff_30               numeric NOT NULL,     -- điểm chuẩn tham khảo (thang 30)
    is_eligible                 boolean NOT NULL,
    is_admitted                 boolean NOT NULL,
    holland_match_pct           numeric NOT NULL
        CONSTRAINT fa_holland_match_chk CHECK (holland_match_pct BETWEEN 0 AND 100),
    first_year_tuition_vnd      bigint  NOT NULL
        CONSTRAINT fa_first_year_tuition_chk CHECK (first_year_tuition_vnd >= 0),
    tuition_is_imputed          boolean NOT NULL,
    living_support_vnd_year     bigint  NOT NULL
        CONSTRAINT fa_living_support_chk CHECK (living_support_vnd_year >= 0),
    est_total_cost_vnd          bigint  NOT NULL
        CONSTRAINT fa_est_total_cost_chk CHECK (est_total_cost_vnd >= 0),
    affordability_index_pct     numeric NOT NULL      -- có thể > 100 (vượt ngân sách)
        CONSTRAINT fa_affordability_chk CHECK (affordability_index_pct >= 0),
    scholarship_eligibility_score numeric,            -- chỉ NV trúng tuyển; NULL 2642/3096
    score_eligible              boolean NOT NULL,
    combo_is_assumed            boolean NOT NULL,
    not_admitted_reason         text,                 -- trống = trúng tuyển; NULL 454/3096
    CONSTRAINT fa_student_nv_order_uq UNIQUE (student_id, nv_order)
);

-- ---------------------------------------------------------------------
-- fact_application_method  (source sheet: "application_method")  — SIMULATED
-- Grain: one NV × phương thức xét tuyển evaluation. 4587 rows.
-- cutoff_id -> fact_cutoff_score is NULLABLE (8 rows = phương thức
-- TUYEN_THANG, không có điểm chuẩn). Those rows also have the score_*
-- numeric columns NULL (8/4587), matching the profile.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_application_method (
    app_method_id       text PRIMARY KEY,             -- e.g. 'APP00001-M1'
    application_id       text    NOT NULL
        REFERENCES fact_application (application_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    cutoff_id           text                          -- NULLABLE: trống ở TUYEN_THANG (8/4587)
        REFERENCES fact_cutoff_score (cutoff_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    admission_method    text    NOT NULL
        CONSTRAINT fam_admission_method_chk
        CHECK (admission_method IN ('THPT','TSA','HOC_BA','KET_HOP_CCNN','XTTH',
            'QUY_DOI_CHUNG','HSA','SPT','TUYEN_THANG')),
    combination_used    text    NOT NULL,             -- tổ hợp/bài thi dùng để xét
    raw_score           numeric,                      -- NULL 8/4587
    priority_bonus      numeric                       -- NULL 8/4587
        CONSTRAINT fam_priority_bonus_chk CHECK (priority_bonus >= 0),
    final_score         numeric,                      -- NULL 8/4587
    score_scale         integer                       -- NULL 8/4587
        CONSTRAINT fam_score_scale_chk CHECK (score_scale IN (30,40,100,150)),
    cutoff_score        numeric,                      -- NULL 8/4587
    score_margin        numeric,                      -- NULL 8/4587 (thang gốc)
    score_margin_30     numeric NOT NULL,             -- biên điểm quy về thang 30
    is_eligible         boolean NOT NULL,
    converted_from      text                          -- NULL 4111/4587
        CONSTRAINT fam_converted_from_chk CHECK (converted_from IN ('HSA','TSA'))
);

-- ---------------------------------------------------------------------
-- fact_quota  (source sheet: "quota")  — REAL DATA
-- Grain: chỉ tiêu = program (or toàn trường) × năm × phương thức. 1366 rows.
-- program_id is NULLABLE (26/1366): rows with quota_scope='Toàn trường'
-- carry university_code only.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_quota (
    quota_id            text PRIMARY KEY,             -- e.g. 'QUO001'
    program_id          text                          -- NULLABLE (toàn trường): 26/1366
        REFERENCES dim_program (program_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    university_code     text    NOT NULL
        REFERENCES dim_university (university_code)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    admission_year      integer NOT NULL,
    plan_date           date    NOT NULL,             -- quy ước 01/03
    admission_method    text    NOT NULL
        CONSTRAINT fq_admission_method_chk
        CHECK (admission_method IN ('TOTAL','THPT','KET_HOP_CCNN','SPT','HOC_BA',
            'TSA','XTTN','HSA','XTTH','OTHER','KET_HOP_XT')),
    quota               integer NOT NULL
        CONSTRAINT fq_quota_chk CHECK (quota >= 0),
    source_type         text    NOT NULL,
    source_url          text    NOT NULL,
    note                text,                          -- NULL 374/1366
    published_code      text,                          -- NULL 166/1366
    data_version        text    NOT NULL
        CONSTRAINT fq_data_version_chk CHECK (data_version IN ('v2','v3')),
    quota_scope         text    NOT NULL
        CONSTRAINT fq_quota_scope_chk
        CHECK (quota_scope IN ('Ngành/nhóm ngành','Toàn trường'))
);

-- ---------------------------------------------------------------------
-- fact_tuition  (source sheet: "tuition")  — REAL DATA
-- Grain: học phí = university (or program) × năm học. 63 rows.
-- program_id handling: the column mixes real program_ids with SENTINELS
--   'ALL'  (toàn trường), 'SU_PHAM' / 'NGOAI_SU_PHAM' (nhóm ngành).
--   CLEANEST approach (chosen): NO foreign key on fact_tuition.program_id,
--   because the sentinels are not rows in dim_program and inventing sentinel
--   dim_program rows would pollute the dimension. Join to dim_program only
--   WHERE program_id NOT IN ('ALL','SU_PHAM','NGOAI_SU_PHAM'). The granularity
--   column tells you how to interpret the row. (See idx below for lookups.)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_tuition (
    tuition_id              text PRIMARY KEY,          -- e.g. 'TUI001'
    university_code         text    NOT NULL
        REFERENCES dim_university (university_code)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    program_id              text    NOT NULL,          -- 'ALL'/'SU_PHAM'/'NGOAI_SU_PHAM' OR a dim_program.program_id (NO FK — see note)
    granularity             text    NOT NULL
        CONSTRAINT ft_granularity_chk
        CHECK (granularity IN ('Toàn trường (CT chuẩn)','Theo ngành','Nhóm ngành')),
    academic_year           text    NOT NULL,          -- e.g. '2023-2024'
    academic_year_start_date date   NOT NULL,          -- quy ước 01/09
    amount_min              bigint  NOT NULL CONSTRAINT ft_amount_min_chk CHECK (amount_min >= 0),
    amount_max              bigint  NOT NULL CONSTRAINT ft_amount_max_chk CHECK (amount_max >= 0),
    unit                    text    NOT NULL
        CONSTRAINT ft_unit_chk CHECK (unit IN ('VND/năm','VND/tín chỉ')),
    tuition_min_vnd_year    bigint  NOT NULL CONSTRAINT ft_tmin_chk CHECK (tuition_min_vnd_year >= 0),
    tuition_max_vnd_year    bigint  NOT NULL CONSTRAINT ft_tmax_chk CHECK (tuition_max_vnd_year >= 0),
    tuition_mid_vnd_year    bigint  NOT NULL CONSTRAINT ft_tmid_chk CHECK (tuition_mid_vnd_year >= 0),
    is_converted_from_credit boolean NOT NULL,
    source_type             text    NOT NULL,
    source_url              text    NOT NULL,
    note                    text                       -- NULL 32/63
);

-- ---------------------------------------------------------------------
-- fact_employment  (source sheet: "employment")  — REAL DATA
-- Grain: tỷ lệ việc làm = program/lĩnh vực × khóa tốt nghiệp. 37 rows.
-- program_id is NULLABLE (3/37): field-level / toàn-trường rows.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_employment (
    employment_id       text PRIMARY KEY,              -- e.g. 'EMP001'
    program_id          text                           -- NULLABLE (lĩnh vực/toàn trường): 3/37
        REFERENCES dim_program (program_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    university_code     text    NOT NULL
        REFERENCES dim_university (university_code)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    program_label       text    NOT NULL,              -- tên ngành/lĩnh vực theo nguồn
    graduation_year     integer,                       -- NULL 4/37
    survey_year         integer,                       -- NULL 8/37
    employment_rate_pct numeric NOT NULL
        CONSTRAINT fe_employment_rate_chk CHECK (employment_rate_pct BETWEEN 0 AND 100),
    n_graduates         integer                        -- NULL 16/37
        CONSTRAINT fe_n_graduates_chk CHECK (n_graduates >= 0),
    n_responses         integer                        -- NULL 29/37
        CONSTRAINT fe_n_responses_chk CHECK (n_responses >= 0),
    note                text,                           -- NULL 24/37
    source_url          text    NOT NULL,
    source_type         text    NOT NULL,
    survey_date         date,                           -- NULL 8/37
    granularity         text    NOT NULL
        CONSTRAINT fe_granularity_chk CHECK (granularity IN ('Ngành','Lĩnh vực','Toàn trường'))
);

-- ---------------------------------------------------------------------
-- fact_labor_demand  (source sheet: "labor_demand")  — REAL DATA
-- Grain: một chỉ số nhu cầu lao động = industry_group × kỳ × metric. 22 rows.
-- Keyed by industry_group (a free-text career grouping also found in
-- dim_program.industry_group / v_main_dataset) — NO dim table exists, so
-- NO FK; industry_group here includes 'Toàn thị trường'. Index for joins.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_labor_demand (
    demand_id           text PRIMARY KEY,              -- e.g. 'DEM001'
    industry_group      text    NOT NULL,              -- nhóm nghề (+ 'Toàn thị trường')
    period_end_year     integer NOT NULL,
    metric              text    NOT NULL,              -- tên chỉ số (19 giá trị)
    value               numeric NOT NULL,
    unit                text    NOT NULL,              -- %, người/năm, người, giáo viên, %/năm
    source_name         text    NOT NULL,
    source_url          text    NOT NULL,
    note                text,                           -- NULL 14/22
    period_end_date     date    NOT NULL
);

-- ---------------------------------------------------------------------
-- fact_cutoff_forecast  (source sheet: "cutoff_forecast")  — DERIVED/REAL
-- Grain: dự báo điểm chuẩn = program × năm dự báo × phương pháp. 1826 rows.
-- actual_cutoff / error / abs_error are NULL (693/1826) for target_year
-- 2027 (no ground truth yet).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_cutoff_forecast (
    forecast_id         text PRIMARY KEY,              -- e.g. 'FC0001'
    program_id          text    NOT NULL
        REFERENCES dim_program (program_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    university_code     text    NOT NULL
        REFERENCES dim_university (university_code)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    target_year         integer NOT NULL,              -- 2025–2027
    forecast_date       date    NOT NULL,
    method              text    NOT NULL
        CONSTRAINT fcf_method_chk
        CHECK (method IN ('NAIVE (năm trước)','MA2 (TB 2 năm trước)')),
    forecast_cutoff     numeric NOT NULL,
    actual_cutoff       numeric,                        -- NULL 693/1826 (2027 chưa có)
    error               numeric,                        -- NULL 693/1826
    abs_error           numeric                         -- NULL 693/1826
        CONSTRAINT fcf_abs_error_chk CHECK (abs_error >= 0)
);


-- =====================================================================
-- SECTION 3 — INDEXES (FK columns + common query paths)
-- =====================================================================

-- dim_program
CREATE INDEX IF NOT EXISTS idx_dim_program_university    ON dim_program (university_code);
CREATE INDEX IF NOT EXISTS idx_dim_program_industry      ON dim_program (industry_group);
CREATE INDEX IF NOT EXISTS idx_dim_program_khoi_nganh    ON dim_program (khoi_nganh);

-- dim_student
CREATE INDEX IF NOT EXISTS idx_dim_student_cohort        ON dim_student (cohort_year);

-- fact_exam_score
CREATE INDEX IF NOT EXISTS idx_fes_student               ON fact_exam_score (student_id);

-- fact_cutoff_score
CREATE INDEX IF NOT EXISTS idx_fcs_program               ON fact_cutoff_score (program_id);
CREATE INDEX IF NOT EXISTS idx_fcs_university            ON fact_cutoff_score (university_code);
CREATE INDEX IF NOT EXISTS idx_fcs_program_year          ON fact_cutoff_score (program_id, admission_year);

-- fact_application
CREATE INDEX IF NOT EXISTS idx_fa_student                ON fact_application (student_id);
CREATE INDEX IF NOT EXISTS idx_fa_program                ON fact_application (program_id);

-- fact_application_method
CREATE INDEX IF NOT EXISTS idx_fam_application           ON fact_application_method (application_id);
CREATE INDEX IF NOT EXISTS idx_fam_cutoff                ON fact_application_method (cutoff_id);

-- fact_quota
CREATE INDEX IF NOT EXISTS idx_fq_program                ON fact_quota (program_id);
CREATE INDEX IF NOT EXISTS idx_fq_university             ON fact_quota (university_code);
CREATE INDEX IF NOT EXISTS idx_fq_program_year           ON fact_quota (program_id, admission_year);

-- fact_tuition (no FK on program_id, but index it for lookups)
CREATE INDEX IF NOT EXISTS idx_ft_university             ON fact_tuition (university_code);
CREATE INDEX IF NOT EXISTS idx_ft_program                ON fact_tuition (program_id);
CREATE INDEX IF NOT EXISTS idx_ft_university_year        ON fact_tuition (university_code, academic_year);

-- fact_employment
CREATE INDEX IF NOT EXISTS idx_fe_program                ON fact_employment (program_id);
CREATE INDEX IF NOT EXISTS idx_fe_university             ON fact_employment (university_code);

-- fact_labor_demand
CREATE INDEX IF NOT EXISTS idx_fld_industry_group        ON fact_labor_demand (industry_group);

-- fact_cutoff_forecast
CREATE INDEX IF NOT EXISTS idx_fcf_program               ON fact_cutoff_forecast (program_id);
CREATE INDEX IF NOT EXISTS idx_fcf_university            ON fact_cutoff_forecast (university_code);
CREATE INDEX IF NOT EXISTS idx_fcf_program_year          ON fact_cutoff_forecast (program_id, target_year);


-- =====================================================================
-- SECTION 4 — ROW LEVEL SECURITY (public academic reference data)
-- ---------------------------------------------------------------------
-- Policy: read-only for everyone. This is public academic reference data,
-- so anon + authenticated get SELECT (USING true). No INSERT/UPDATE/DELETE
-- policy is defined => writes are blocked for anon/authenticated.
-- The Supabase service_role BYPASSES RLS, so ETL/loaders using the service
-- (secret) key can still write. Keep the service key server-side only.
-- Policies use DROP ... IF EXISTS + CREATE for idempotent re-runs.
-- =====================================================================
DO $$
DECLARE
    t text;
    tbls text[] := ARRAY[
        'dim_university','dim_program','dim_student',
        'fact_exam_score','fact_cutoff_score','fact_application',
        'fact_application_method','fact_quota','fact_tuition',
        'fact_employment','fact_labor_demand','fact_cutoff_forecast'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true);',
            t || '_read', t);
    END LOOP;
END $$;


-- =====================================================================
-- TRAILING NOTES
-- ---------------------------------------------------------------------
-- 1. The 4 VIEWS (v_main_dataset, v_student_outcome, v_coverage_real,
--    v_coverage_sim) are DERIVED and are defined in 002_kpi_views.sql —
--    not here. This file is the base-table source of truth.
-- 2. Optional / future reference tables mentioned in Source_Log but with NO
--    data sheet in v5: fact_salary (S08) and fact_macro_labor (S10). They are
--    intentionally NOT created here. If needed later, add them in a separate
--    migration (both key off industry_group / toàn-quốc × năm).
-- 3. Run order: this file creates dims before facts; FK constraints require
--    the referenced dim rows to be loaded first when importing data.
-- 4. The live Supabase DB was inspected and found incomplete: dims + several
--    facts existed but EMPTY, and fact_application / fact_application_method /
--    fact_cutoff_forecast were MISSING entirely, with no verifiable FKs and a
--    stray 'main_dataset' table. Re-apply this file to establish the correct
--    base schema + FKs, then 002_kpi_views.sql, then load data dims-first.
-- =====================================================================
