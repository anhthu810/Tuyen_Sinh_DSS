# 04 — Schema & KPI Verification (adversarial review)

Ground truth: `_schema_facts.txt` → `Data_Dictionary` (259 rows), `KPI_Sheet`, `Case_Summary`, `Source_Log`, and the per-column profiles in PART B.
Reviewed: `schema/001_schema.sql`, `schema/002_kpi_views.sql`.
Verdict: **The base schema is faithful** — all 12 tables and all dictionary columns are present with plausible types, correct nullability, correct CHECK domains, and all star-schema FKs. **One real KPI defect** (K02 uses the wrong eligibility flag) and a handful of low-severity / verification items. Vietnamese labels are preserved verbatim.

Arithmetic cross-checks (all exact):
- K01 324/500 = 0.648 ✓ (sample 0.648)
- K02 667/1770 = 0.3768361582 ✓ — **requires `score_eligible`**; with `is_eligible` → 667/1696 = 0.39328 ✗
- K06 `fn_est_total_cost(20,000,000, 4, 0)` = 308,820,000 ✓ (matches APP00001 stored)
- K07 `fn_affordability_index(308,820,000, 65,000,000, 4)` = 118.8 ✓; share 151/454 = 0.3325991189 ✓ (sample)

---

## HIGH

### H1 — K02 uses `is_eligible` but the KPI_Sheet formula is "NV đủ điểm" (= `score_eligible`)
`002_kpi_views.sql` `v_kpi_k02` filters both numerator and denominator on `is_eligible`
(`is_eligible AND best_method <> 'THPT'` over `is_eligible`).

KPI_Sheet K02 `formula_definition` = "… / **Tổng số NV đủ điểm** × 100", `sample_scope` = "NV đủ điểm",
`sample_value` = **0.3768361582**. In the Data_Dictionary, "đủ điểm" is `score_eligible`
("NV đủ điểm ở ít nhất 1 phương thức, chưa xét tốt nghiệp"), whereas `is_eligible` = "NV đủ điều kiện
trúng tuyển = score_eligible VÀ đã tốt nghiệp THPT". These differ by exactly the 74 NVs in
`Case_Summary.so_nv_du_diem_nhung_khong_TN`.

Proof the intended column is `score_eligible`: 0.3768361582 = **667 / 1770** exactly. Using `is_eligible`
the denominator drops by 74 (and the numerator by the non-THPT subset), giving ≈0.393 — it cannot
reproduce the published sample. (README mục 6 says K02 is "NV đủ điều kiện", which conflicts with the
KPI_Sheet; the KPI_Sheet formula + sample_value is authoritative here.)

**Fix:** in `v_kpi_k02` replace both `is_eligible` with `score_eligible`:
```sql
COUNT(*) FILTER (WHERE score_eligible)                            AS n_eligible_nv,
COUNT(*) FILTER (WHERE score_eligible AND best_method <> 'THPT')  AS n_eligible_nonthpt,
... / NULLIF(COUNT(*) FILTER (WHERE score_eligible), 0) ...
```
`v_main_dataset` already exposes `score_eligible` (column 40), so no other change is needed.

---

## MEDIUM

### M1 — `fact_application_method.score_scale` CHECK may reject values the dictionary domain allows
`002`/`001` restrict `score_scale IN (30,40,100,150)`. The dictionary note for this column lists
"30, 40, 100 (TSA), 150 (HSA), **1600 (SAT)**". Current simulated data has no SAT rows
(profile distinct = {30,40,100,150}, `admission_method` has no SAT), so the CHECK passes today, but any
future SAT-method row (scale 1600) would be rejected. `fact_cutoff_score.score_scale` correctly allows
all 7 observed scales (30,40,100,110,150,1200,1600), so the two tables are inconsistent about SAT.

**Fix:** either add `1600` to the `fact_application_method` CHECK to match the documented domain, or add
a comment that SAT is intentionally out of scope for the simulation and keep it strict (decide one).

### M2 — Verify `program_id` referential integrity before relying on the new FKs
`fact_cutoff_score` (373 distinct `program_id`) and `fact_cutoff_forecast` (373 distinct, includes
combination-group codes like `BKA_BF-E12`) now carry `REFERENCES dim_program`. `dim_program` has 380
program_ids, so the sets are almost certainly a superset — but the whole point of this migration is that
the live DB lacked FKs, so any orphan code (e.g. a HUST combination-group code not materialised as a
`dim_program` row) will make the data load **fail** at FK creation/insert.

**Fix:** before loading, run
`SELECT DISTINCT program_id FROM fact_cutoff_score EXCEPT SELECT program_id FROM dim_program;`
and the same for `fact_cutoff_forecast`, `fact_quota` (non-null), `fact_employment` (non-null),
`fact_application`. Expect 0 rows; if not, add the missing `dim_program` rows first.

---

## LOW

### L1 — `fact_tuition.program_id` has no FK (dictionary marks it FK)
Documented and justified: the column mixes real `program_id`s with the sentinels `ALL`, `SU_PHAM`,
`NGOAI_SU_PHAM` (profile distinct = 17 values incl. those three), which are not `dim_program` rows, so a
plain FK would fail. The schema's choice (no FK + `granularity` column) is correct. Recommend hardening
it with a CHECK so the sentinel set stays closed and typos are caught:
```sql
CHECK (granularity = 'Toàn trường (CT chuẩn)' AND program_id = 'ALL'
    OR granularity = 'Nhóm ngành'            AND program_id IN ('SU_PHAM','NGOAI_SU_PHAM')
    OR granularity = 'Theo ngành')   -- 'Theo ngành' → must exist in dim_program
```
(and validate the `Theo ngành` rows against `dim_program` in ETL, per M2).

### L2 — `fact_application` UNIQUE(student_id, nv_order) is an assumption, not a dictionary rule
True in the current package (each student's NVs have distinct priority order), but nothing in the
Data_Dictionary guarantees it; if a reload ever contains a duplicate order the insert will fail. Keep it
(it is a good integrity guard) but note it in ETL so a load failure here is understood.

### L3 — K03 and K05 views drop granularity the KPI_Sheet lists
- K03 granularity is "Ngành × năm" but `v_kpi_k03` groups only by `target_year` (+overall). The headline
  MAE matches scope ("Toàn bộ ngành thang 30, 2025–2026"), but you cannot get per-program MAE from the view.
- K05 granularity is "Ngành/lĩnh vực × khóa TN" but `v_kpi_k05` rolls up by `university_code` (+overall) and
  averages `employment_rate_pct` (correct: sample 0.9448378378 = simple mean of the 37 rows, since
  `n_responses` is null for 29/37 so a weighted employed/surveyed is impossible). The per-industry/per-cohort
  slice needs an extra join.

**Fix (optional):** add `program_id` / `graduation_year` (K05) and `program_id` (K03) as extra grouping
columns, or expose detail views, so the app can slice without re-implementing the formula.

### L4 — K04 cannot reproduce its KPI_Sheet sample_value (by design) — document, don't "fix"
`v_kpi_k04` computes year-over-year growth within the same `(industry_group, metric)`. The KPI_Sheet
sample −0.2918 is explicitly "minh họa" and divides two *different* TopCV measures (12.2% → 8.64%), which a
correct like-with-like view must refuse. `fact_labor_demand` (22 rows) mixes incompatible metrics/units
(`%`, `người/năm`, `người`, `giáo viên`, `%/năm`) across sources/years, so K04 is only meaningful where the
same metric recurs across years. This is a data limitation, not a SQL bug — surface it in the UI.

---

## Confirmed correct (no action)

- **Tables/columns:** all 12 base tables (`dim_university`, `dim_program`, `dim_student`,
  `fact_exam_score`, `fact_cutoff_score`, `fact_application`, `fact_application_method`, `fact_quota`,
  `fact_tuition`, `fact_employment`, `fact_labor_demand`, `fact_cutoff_forecast`) present; every
  Data_Dictionary column present with a plausible type; no extra/undocumented columns; VND money → `bigint`.
- **Views:** `v_main_dataset` (42 cols, exact order), `v_student_outcome` (11 cols), `v_coverage_real`
  (11 cols, 380×4), `v_coverage_sim` (6 cols) all match the dictionary column sets. Computed rules sound:
  `is_eligible = score_eligible AND is_thpt_graduated`; `admission_status` 3-value domain matches
  (454 Trúng tuyển / 32 Không tốt nghiệp / 14 Trượt → reproduces the 46 non-admitted); `holland_match_pct`
  COALESCE(stored, fn) with fn validated by the formula note; `best_method` QUY_DOI_CHUNG(TSA)/(HSA)
  relabelling matches the `main_dataset` domain.
- **FKs:** every star-schema edge present and pointing at an existing column —
  `dim_program.university_code`→`dim_university`; `fact_cutoff_score`/`fact_quota`/`fact_employment`/
  `fact_cutoff_forecast` → `dim_program` + `dim_university`; `fact_exam_score`/`fact_application` →
  `dim_student`; `fact_application.program_id`→`dim_program`;
  `fact_application_method.application_id`→`fact_application` and `.cutoff_id`→`fact_cutoff_score`
  (nullable for TUYEN_THANG, matching the 8 null `cutoff_id` rows). `fact_labor_demand` correctly has no
  FK (keyed by free-text `industry_group`).
- **Nullability:** every NOT NULL column has dictionary `missing_count = 0`; every `missing_count > 0`
  column is nullable (checked all 12 tables, incl. the 8-null method columns, the 693-null forecast
  columns, 844-null `cutoff_score_30`, 2642-null `scholarship_eligibility_score`). No contradictions.
- **CHECK domains match the actual distinct values** (no legal value excluded) for: `university_code`,
  `tier`, `program_type`, `khoi_nganh` (all I–VII incl. II), `gender`, `priority_area` (incl. KV2-NT),
  `high_school_type`, `subject_track`, `exam_status` (6), `special_case` (7), `data_batch`,
  `admission_method` on `fact_cutoff_score` (13), on `fact_application_method` (9), on `fact_quota` (11),
  `method_group` (13), `confidence` (4), `granularity` (tuition/employment), `unit`, `quota_scope`,
  `data_version`, `cutoff_score.score_scale` (7), forecast `method`, `converted_from`. `industry_group`
  correctly left un-CHECKed (23 distinct, drifts vs the "20 nhóm" note).
- **KPIs K01, K03, K05, K06, K07** match the KPI_Sheet formula/scope and reproduce the sample values; the
  helper functions `fn_est_total_cost` and `fn_affordability_index` reproduce the stored
  `est_total_cost_vnd` / `affordability_index_pct` exactly.
- **Optional/missing sources:** `fact_salary` (S08) and `fact_macro_labor` (S10) have no data sheet and are
  correctly omitted and flagged as future. `v_coverage_real` / `v_coverage_sim` (dictionary-defined, no data
  sheet) are provided as views in `002`.
