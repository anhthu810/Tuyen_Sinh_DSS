# 02 — ETL & Data Loading (Excel → Supabase)

**Project:** DSS Tư vấn Tuyển sinh & Hướng nghiệp (Nhóm 5, Assignment 1)
**Source workbook:** `DSS_Group5_DataPackage_v5.xlsx` (19 sheets)
**Target:** Supabase Postgres (`public` schema)
**Scope of this doc:** the one-off load of the Excel data package into Supabase, plus the validation that proves the database is correct. Schema DDL (`001_schema.sql`) and KPI views (`002_kpi_views.sql`) are referenced here but specified in the schema/SQL docs.

---

## 0. Current state & why this plan exists

The user is unsure the Supabase database is correct ("database không chắc có ok không"). As of writing, **the live DB state is unverified**:

- No `_db_report.txt` has been produced, and there is no `.env` / `.env.local` with a `DATABASE_URL` in the project root, so the read-only introspection script `_dbcheck/introspect.mjs` (which uses the `pg` driver) has not yet been run against the live instance.
- We therefore cannot assume the tables exist, have the right columns, PKs, FKs, or are empty.

**Consequence for this plan:** treat the load as "schema-first, then data, then verify". The three phases are strictly ordered:

1. **Apply schema** — run `001_schema.sql` (tables, PKs, nullable FKs, enum-ish CHECK constraints). This doc assumes the column names/types match the Data_Dictionary (authoritative, 259 rows).
2. **Load data** — the ETL described below (Section 1–4), idempotent via upsert.
3. **Create views + validate** — run `002_kpi_views.sql` (Section 5) **after** data load, then run the validation suite (Section 6). Optionally re-run `_dbcheck/introspect.mjs` with `DATABASE_URL` set to confirm PKs/FKs/row counts from the catalog side.

Running these three phases end-to-end is what turns "không chắc" into a database we can trust.

---

## 1. Load order (FK dependency order)

Load **dimensions first, then facts**. Within facts, anything whose FK points at another fact must come after its parent. `fact_application_method` is the tail because its `cutoff_id` references `fact_cutoff_score` **and** its `application_id` references `fact_application`.

| # | Table (canonical) | Source sheet | Rows (expected) | Real/Sim | FK dependencies (must exist first) |
|---|---|---|---|---|---|
| 1 | `dim_university` | `university` | 7 | REAL | — |
| 2 | `dim_program` | `program` | 380 | REAL | `dim_university` (university_code) |
| 3 | `dim_student` | `student` | 500 | **SIM** | — |
| 4 | `fact_exam_score` | `score` | 500 | **SIM** | `dim_student` (student_id) |
| 5 | `fact_cutoff_score` | `cutoff_score` | 2 939 | REAL | `dim_program`, `dim_university` |
| 6 | `fact_quota` | `quota` | 1 366 | REAL | `dim_program` (nullable), `dim_university` |
| 7 | `fact_tuition` | `tuition` | 63 | REAL | `dim_university`; `program_id` has sentinels (no strict FK) |
| 8 | `fact_employment` | `employment` | 37 | REAL | `dim_program` (nullable), `dim_university` |
| 9 | `fact_labor_demand` | `labor_demand` | 22 | REAL | none (keyed by `industry_group`, free text) |
| 10 | `fact_cutoff_forecast` | `cutoff_forecast` | 1 826 | REAL | `dim_program`, `dim_university` |
| 11 | `fact_application` | `application` | 3 096 | **SIM** | `dim_student`, `dim_program` |
| 12 | `fact_application_method` | `application_method` | 4 587 | **SIM** | `fact_application`, `fact_cutoff_score` (cutoff_id nullable) |

**Not loaded as base tables** (they are SQL views, built in Section 5):

| Sheet | Canonical | Why skipped |
|---|---|---|
| `main_dataset` | `v_main_dataset` | Denormalized VIEW over application + student + program. Keep the sheet only as a validation oracle (Section 6.4). |
| `student_outcome` | `v_student_outcome` | VIEW over student + application outcomes. Same. |
| (none) | `v_coverage_real`, `v_coverage_sim` | VIEWS defined in Data_Dictionary, no sheet. Built from facts. |

**Metadata sheets** (`README`, `Data_Dictionary`, `Source_Log`, `KPI_Sheet`, `Case_Summary`) are not transactional data. Recommended optional loads:

- `KPI_Sheet` → `meta_params` (the "THAM SỐ / GIẢ ĐỊNH" block: sinh hoạt 54tr/năm, +10%/năm học phí, 35 tín chỉ/năm, TSA→30 = `9,6 + 0,248×TSA`, HSA→30 = `14,6 + 0,117×HSA`, ngưỡng giảm ưu tiên 22,5). The KPI engine needs these; loading them as a table (or a committed JSON config) keeps the web app and the dataset in sync.
- `Data_Dictionary` → `meta_data_dictionary` for in-app column tooltips.
- `Source_Log` → `meta_source_log` for the "nguồn / provenance" panel.

These are convenience tables, not required for KPIs K01–K07.

---

## 2. Global transform rules (apply to every table)

The workbook was written by pandas, so cells arrive in predictable but dirty forms. A SheetJS/exceljs read returns each cell as a **JS number or a string** depending on how it was stored; the mapper must be defensive about both. The `.0` suffixes seen in the text dumps (`2023.0`, `300.0`) are a stringification artifact of floats — the same cell read into JS is usually the number `2023`, but the helpers below also accept the `"2023.0"` string form so the ETL is robust either way.

| Rule | Input examples | Output |
|---|---|---|
| **R1 Empty → NULL** | `""`, `"   "`, `undefined` | `null`. Trim first; whitespace-only becomes `null`. |
| **R2 Integer (year/count)** | `2023.0`, `"2023"`, `300.0`, `1.0` | `parseInt(parseFloat(x), 10)` → `2023`, `300`, `1`. Used for all `*_year`, `nv_order`, `quota`, `score_scale`, `n_*`, `tier_rank`, `duration_years`. |
| **R3 Decimal** | `24.6`, `"24.60"`, `0.75`, `0.25` | `parseFloat(x)`. **Do not** treat small values like `0.25`/`0.5` as empty — only R1 produces NULL. |
| **R4 Boolean** | `"True"`, `"False"`, `true`, `false` | `true`/`false`. Empty → `null`. Case-insensitive match on `true`/`false`; anything else → error (surfaces bad data). |
| **R5 Date (ISO)** | `"2023-07-15"` | Pass through as `date` (string `YYYY-MM-DD`). If a cell comes back as an Excel serial number or JS `Date`, normalize to `YYYY-MM-DD`. Validate `/^\d{4}-\d{2}-\d{2}$/`. |
| **R6 Money (VND)** | `65000000.0`, `941249000` | Integer, stored in a **`bigint`** column. Max observed `est_total_cost_vnd` ≈ 941M (fits int4) but use `bigint` for all VND to be safe against future rows. |
| **R7 Text (identifiers & labels)** | `"7480101"`, `"Nữ"`, `"Học sinh lớp 12 (đương niên)"` | Trimmed string. **Preserve all Vietnamese labels verbatim** (never transliterate, never strip accents). Codes that look numeric (`major_code`, `published_code`) are stored as **text**, not numbers — never let them become `7480101.0` or lose a leading char. |
| **R8 Multi-value list** | `"A00;A01"`, `"2023;2024;2025;2026"`, `"math;physics;english"` | **Keep as TEXT verbatim in v1** (see Section 3, decision note). `;`-separated string, no split into child rows. |

**Multi-value decision (R8), stated explicitly:** the Data_Dictionary types `subject_combinations`, `years_offered`, `registered_subjects`, `absent_subjects`, `exempt_subjects`, `failing_subjects`, and the view column `methods` as **Text with `;` separator**. v1 stores them as a single `text` column exactly as given. We do **not** normalize them into child tables and we do **not** use Postgres `text[]`. Rationale: matches the schema decision in the package, keeps the load 1:1 with the source, and the app can `split(';')` at read time or use `string_to_array(col, ';')` in SQL when it needs set operations. If a later version needs relational querying on combinations, introduce `program_subject_combination(program_id, combination)` as a derived table built post-load — but that is out of scope for v1.

**De-dup / PK integrity (pre-insert, in the ETL, before touching the DB):**

1. For each table, group rows by the PK column(s) and assert `distinct == total`. The source is clean (every PK profiled as `distinct == row_count`), so any duplicate means a corrupted export — **fail loudly**, do not silently keep-last.
2. For each FK column, assert every non-null value exists in the already-mapped parent set loaded earlier in the same run (in-memory check, cheap, catches problems before the round-trip). The DB FK constraints are the backstop; this is the fast feedback loop.

---

## 3. Per-table transform rules

Legend: **PK** = primary key, **FK** = foreign key, nulls shown as "`col` (N null)" where the source profile reported missing values.

### 3.1 `dim_university` ← sheet `university` (7 rows, REAL)
- PK `university_code` (text): `BKA, KHA, YHB, SPH, DCN, TLA, HVN`.
- `tier_rank` → **R2** int (1–7).
- `university_name, short_name, tier, field_focus, admission_website` → **R7** text. Preserve verbatim (e.g. `Học viện Nông nghiệp Việt Nam`, tier `Nhóm trung bình – thấp`).
- No FK. Smallest table — load first.

### 3.2 `dim_program` ← sheet `program` (380 rows, REAL)
- PK `program_id` (text, e.g. `BKA_IT1`, `DCN_7480103`). FK `university_code` → `dim_university`.
- `major_code` (138 null) → **R7 text**, not numeric. `"7480101"`. Empty → NULL.
- `duration_years` → **R2** int (4/5/6).
- `subject_combinations` (17 null), `years_offered` → **R8** text, `;`-separated, verbatim.
- `program_type, khoi_nganh, khoi_nganh_name, industry_group, holland_code, source_version` → **R7** text (verbatim Vietnamese; `program_type` ∈ {Chuẩn, Tiên tiến/CLC, Tiếng Anh, POHE, Liên kết, Phân hiệu Thanh Hóa, Khác}).
- `note` (84 null) → R7/R1.

### 3.3 `dim_student` ← sheet `student` (500 rows, **SIMULATED**)
- PK `student_id` (text, `HS2023001`).
- `cohort_year`, `n_test_types` → **R2** int. `thpt_graduation_year` (32 null) → R2 int or NULL (empty = chưa/không tốt nghiệp).
- `priority_bonus_base`, `gpa_grade10/11/12` → **R3** float.
- `ielts_score` (326 null), `tsa_score` (350 null), `hsa_score` (361 null), `spt_score` (488 null) → **R3** float or NULL. These are genuinely sparse (most students don't sit these exams) — NULL is meaningful, keep it.
- `family_budget_vnd_year` → **R6** bigint.
- `is_thpt_graduated` → **R4** bool.
- `profile_created_date` → **R5** date.
- `gender, priority_area, high_school_type, subject_track, interest_industry, holland_code, candidate_type, exam_status, special_case, case_note (396 null), data_batch` → **R7** text, verbatim. `exam_status` and `special_case` are controlled vocabularies (6 / 7 distinct values) — consider a CHECK constraint in `001_schema.sql`.

### 3.4 `fact_exam_score` ← sheet `score` (500 rows, **SIMULATED**)
- PK `score_id` (`SC2023001`). FK `student_id` → `dim_student` (1:1 with students).
- `exam_year` → **R2** int. `exam_date` → **R5** date.
- `score_math` (26 null), `score_physics` (270 null), `score_chemistry` (235 null), `score_biology` (311 null), `score_literature` (52 null), `score_history` (355 null), `score_geography` (386 null), `score_english` (163 null) → **R3** float or NULL. **Critical:** NULL = "không thi môn đó" (from 2025 students sit Toán, Văn + 2 chosen). Values like `0.25`, `0.75`, `1.0` are real (điểm liệt), **not** nulls — only R1 (empty string) makes NULL.
- `hb_*` (học bạ, 0 null) → **R3** float.
- `registered_subjects`, `absent_subjects` (476 null), `exempt_subjects` (468 null), `failing_subjects` (492 null) → **R8** text, `;`-separated, verbatim.

### 3.5 `fact_cutoff_score` ← sheet `cutoff_score` (2 939 rows, REAL)
- PK `cutoff_id` (`CUT0001`). FK `program_id` → `dim_program` (373 distinct; 7 programs legitimately have no cutoff — reverse direction, not an orphan). FK `university_code` → `dim_university`.
- `admission_year` → **R2** int. `announce_date` → **R5** date. `announce_date_is_approx` → **R4** bool.
- `cutoff_score` (1 null) → **R3** float. `score_scale` (21 null) → **R2** int (30/40/100/110/150/1200/1600). `scale_confirmed` → **R4** bool (**FALSE rows must be flagged**: not used in simulation — keep but mark). `cutoff_score_30` (844 null) → **R3** float or NULL (only for thang 30/40). `is_missing` → **R4** bool.
- `n_sources_agree` → **R2** int (0–7). `confidence, method_group, subject_combination, source_type, source_url, data_version` → **R7** text verbatim. `note` (282 null), `published_code` (136 null) → R7/R1.
- `admission_method` → **R7** text; 13 distinct incl. `OTHER`, `XTTN_CCQT`, `XTTN_HSNL`, `QUY_DOI_CHUNG`, `TUYEN_THANG` is **not** present here (only in simulation).

### 3.6 `fact_quota` ← sheet `quota` (1 366 rows, REAL)
- PK `quota_id` (`QUO001`). FK `program_id` → `dim_program` (**26 null** → `quota_scope = 'Toàn trường'`; FK column must be **nullable**). FK `university_code` → `dim_university`.
- `admission_year` → **R2** int. `plan_date` → **R5** date (quy ước 01/03). `quota` → **R2** int.
- `admission_method` → **R7** text; includes `TOTAL` sentinel = aggregate quota line (not a real method). Keep verbatim.
- `quota_scope` → **R7** text ∈ {`Ngành/nhóm ngành`, `Toàn trường`}. `source_type, source_url, data_version` → R7. `note` (374 null), `published_code` (166 null) → R7/R1.

### 3.7 `fact_tuition` ← sheet `tuition` (63 rows, REAL)
- PK `tuition_id` (`TUI001`). FK `university_code` → `dim_university`.
- **`program_id` sentinel handling (important):** 17 distinct values = `ALL` (toàn trường) + `SU_PHAM` + `NGOAI_SU_PHAM` (HNUE pseudo-groups) + real `YHB_*` / `HVN_*` program_ids. `ALL`/`SU_PHAM`/`NGOAI_SU_PHAM` are **not** rows in `dim_program`. Therefore:
  - Store `program_id` as **text, verbatim** (do not map `ALL` → NULL — the app and `fact_tuition` matching logic rely on the sentinel; `granularity` already carries the human label).
  - **Do NOT define a DB foreign key** from `fact_tuition.program_id` to `dim_program`. Instead enforce with a CHECK-style validation query (Section 6.3): `program_id IN ('ALL','SU_PHAM','NGOAI_SU_PHAM') OR EXISTS in dim_program`.
  - App read rule: tuition for a program = look up its own `program_id`; if none, fall back to the school's `ALL` row (or `SU_PHAM`/`NGOAI_SU_PHAM` for HNUE). Document this join in the API layer.
- `academic_year` → **R7 text** (`2023-2024`), **not** a number/date. `academic_year_start_date` → **R5** date.
- `amount_min, amount_max, tuition_min_vnd_year, tuition_max_vnd_year, tuition_mid_vnd_year` → **R6** bigint.
- `unit` (`VND/năm` | `VND/tín chỉ`), `granularity`, `source_type, source_url` → R7. `is_converted_from_credit` → **R4** bool. `note` (32 null) → R7/R1.

### 3.8 `fact_employment` ← sheet `employment` (37 rows, REAL)
- PK `employment_id` (`EMP001`). FK `program_id` → `dim_program` (**3 null** → granularity `Toàn trường`; nullable FK). FK `university_code` → `dim_university` (6 distinct — SPH/HNUE has no employment row; fine).
- `graduation_year` (4 null), `survey_year` (8 null) → **R2** int or NULL. `n_graduates` (16 null), `n_responses` (29 null) → **R2** int or NULL.
- `employment_rate_pct` → **R3** float. `survey_date` (8 null) → **R5** date.
- `program_label, note (24 null), source_url, source_type, granularity` → R7 verbatim.

### 3.9 `fact_labor_demand` ← sheet `labor_demand` (22 rows, REAL)
- PK `demand_id` (`DEM001`). **Keyed by `industry_group`** (free text, 15 distinct incl. `Toàn thị trường`, `CNTT`, …). **No FK** — `industry_group` is a logical join key to `dim_program.industry_group`, not an enforced relation (labor_demand has groups like `Toàn thị trường` that aren't program industry groups).
- `period_end_year` → **R2** int. `value` → **R3** float. `period_end_date` → **R5** date.
- `metric, unit, source_name, source_url` → R7. `note` (14 null) → R7/R1.

### 3.10 `fact_cutoff_forecast` ← sheet `cutoff_forecast` (1 826 rows, REAL — derived from real cutoffs)
- PK `forecast_id` (`FC0001`). FK `program_id` → `dim_program` (373 distinct). FK `university_code` → `dim_university`.
- `target_year` → **R2** int (2025–2027). `forecast_date` → **R5** date. `method` → R7 (`NAIVE (năm trước)` | `MA2 (TB 2 năm trước)`).
- `forecast_cutoff` → **R3** float. `actual_cutoff` (693 null), `error` (693 null), `abs_error` (693 null) → **R3** float or NULL. **The 693 nulls = `target_year = 2027`** (no actual yet) — expected, keep NULL. K03 (MAE) is computed only on rows where `actual_cutoff IS NOT NULL`.

### 3.11 `fact_application` ← sheet `application` (3 096 rows, **SIMULATED**)
- PK `application_id` (`APP00001`). FK `student_id` → `dim_student`, `program_id` → `dim_program`.
- `nv_order` → **R2** int (1–10). `registration_date`, `result_date` → **R5** date.
- `ref_cutoff_30, holland_match_pct, affordability_index_pct` → **R3** float. `scholarship_eligibility_score` (2 642 null) → **R3** float or NULL (only for admitted NVs).
- `first_year_tuition_vnd, living_support_vnd_year, est_total_cost_vnd` → **R6** bigint.
- `is_eligible, is_admitted, tuition_is_imputed, score_eligible, combo_is_assumed` → **R4** bool.
- `not_admitted_reason` (454 null) → **R7** text or NULL. **NULL = trúng tuyển** (admitted) — semantically load-bearing; preserve exactly, including the verbatim reasons (`Không đủ điểm`, `Đã trúng tuyển NV ưu tiên cao hơn`, `Chưa có điểm chuẩn năm này trong dữ liệu thật`, etc.).

### 3.12 `fact_application_method` ← sheet `application_method` (4 587 rows, **SIMULATED**)
- PK `app_method_id` (`APP00001-M1`). FK `application_id` → `fact_application` (3 063 distinct of 3 096 — see note). FK `cutoff_id` → `fact_cutoff_score` (**8 null**, nullable FK).
- **TUYEN_THANG rule:** the 8 rows with `cutoff_id` NULL are `admission_method = TUYEN_THANG` (tuyển thẳng, no cutoff). `cutoff_id` FK **must be nullable**; the ETL must map empty → NULL, not to a fake cutoff.
- `raw_score, priority_bonus, final_score, cutoff_score, score_margin` (each 8 null) → **R3** float or NULL. `score_margin_30` (0 null) → R3 float. `score_scale` (8 null) → **R2** int or NULL.
- `is_eligible` → **R4** bool. `admission_method, combination_used` → R7 text verbatim (`combination_used` incl. `Giải quốc tế/đội tuyển QG`). `converted_from` (4 111 null) → R7 text or NULL (`TSA`/`HSA`).
- **Expected non-orphan:** `fact_application` has 3 096 rows but only 3 063 appear as `application_id` here → **33 applications have zero method rows**. This matches `best_method` being NULL for 33 NVs in `v_main_dataset` (e.g. `Chưa có điểm chuẩn năm này`). This is an optional child relationship, **not** a load error — do not try to synthesize method rows for them.

---

## 4. Recommended tooling

### 4.1 Primary path — Node one-off ETL script (recommended)

A small Node project (reuse the `_dbcheck` style; it already pins `pg` and runs under Node ESM). Add:

- **`xlsx` (SheetJS)** — read the 19-sheet workbook. (`exceljs` is an equally fine alternative; SheetJS's `sheet_to_json` is terser for this row-wise job.)
- **`@supabase/supabase-js`** — upsert with the **`service_role`** key. The service_role key **bypasses RLS**, so this script is **local/one-off only** and the key must never ship to the browser or be committed. Put it in `.env.local` (same file the introspection script already looks for).

> Why not raw `pg` + `COPY`? You can, and it's the fastest for bulk. But `supabase-js` `upsert({ onConflict: pk })` gives idempotency (Section 5) for free and matches how the rest of the app talks to Supabase. For 15k total rows, performance is a non-issue; pick the idempotent path.

**Module outline** (`etl/` directory, kept separate from the untrusted workbook):

```
etl/
  config.js        // loads .env.local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, XLSX_PATH
  io.js            // readWorkbook(path), readSheet(wb, name) -> array<object> (raw)
  transforms.js    // toInt, toFloat, toBool, toText, toDate, toMoney, keepList, sentinelProgramId
  mappers.js       // one map<Table>(row) per table -> DB-shaped object
  load.js          // genericLoad(table, rows, pk, mapFn, {chunk:500})
  validate.js      // row-count + orphan + coverage assertions (Section 6)
  main.js          // orchestrates: ordered loads (Section 1) then validate()
```

**Transform helpers** (`transforms.js`) implement R1–R8:

```js
export const toText  = v => { const s = v == null ? '' : String(v).trim(); return s === '' ? null : s; };
export const toInt   = v => { const s = toText(v); return s == null ? null : parseInt(parseFloat(s), 10); };
export const toFloat = v => { const s = toText(v); return s == null ? null : parseFloat(s); };
export const toMoney = toInt;                     // stored in bigint columns
export const toBool  = v => { const s = toText(v); if (s == null) return null;
  const l = s.toLowerCase(); if (l === 'true') return true; if (l === 'false') return false;
  throw new Error(`bad boolean: ${v}`); };
export const toDate  = v => { const s = toText(v); if (s == null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = XLSX.SSF ? excelSerialToISO(s) : null;  // handle serial / JS Date fallbacks
  if (!d) throw new Error(`bad date: ${v}`); return d; };
export const keepList = toText;                   // R8: verbatim ';'-separated text
export const sentinelProgramId = v => toText(v);  // keep 'ALL'/'SU_PHAM'/'NGOAI_SU_PHAM' as-is
```

**Generic row-mapper + batched upsert** (`load.js`), batch size **500**:

```js
export async function genericLoad(supabase, table, rows, pk, mapFn, chunk = 500) {
  const mapped = rows.map(mapFn);
  assertUniquePk(mapped, pk, table);              // R: de-dup / PK integrity, fail loudly
  for (let i = 0; i < mapped.length; i += chunk) {
    const slice = mapped.slice(i, i + chunk);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: pk });
    if (error) throw new Error(`${table} [${i}..${i+slice.length}]: ${error.message}`);
  }
  console.log(`${table}: upserted ${mapped.length}`);
}
```

**`main.js`** calls `genericLoad` in the exact order of Section 1's table, each with its mapper and PK (`app_method_id` etc.), then calls `validate()`. Because the order respects FK dependencies and each load finishes before the next starts, in-run FK pre-checks (Section 2) always have their parent set available.

### 4.2 Alternative path — CSV export + Supabase import (simpler, less safe)

Export each data sheet to CSV (one file per canonical table) and use **Supabase Studio → Table editor → Import data from CSV**, or `psql \copy` / `COPY`.

**Tradeoffs:**

| | Node ETL (4.1) | CSV import (4.2) |
|---|---|---|
| Transforms R1–R8 | Centralized, testable, reproducible | Must be baked into the CSV beforehand (Excel/pandas) or done with SQL after a raw text load |
| `True`/`False`, `2023.0`, empty→NULL | Handled in code | Postgres `COPY` needs real `t`/`f`, real ints, and `NULL ''`; otherwise type errors or `'2023.0'` into an int column fails |
| Idempotency | `upsert onConflict` built in | `COPY` appends → re-run duplicates / PK violations unless you `TRUNCATE` first |
| FK ordering | Enforced in script | You must import in the right order manually |
| Sentinels / nullable FK | Explicit per table | Easy to get wrong (empty cutoff_id, `ALL` program_id) |
| Setup cost | Write once (~1 file/table mapper) | Zero code, but manual and error-prone each run |

**Recommendation:** use the **Node ETL** for the real load (idempotent, repeatable, encodes every transform decision). Keep CSV import only as a quick manual fallback for a single table during debugging. If CSV is used, first run the raw sheet through a cleaning pass so `True/False`→`t/f`, `2023.0`→`2023`, and empty→`NULL`, and `TRUNCATE` the target before `COPY` to preserve idempotency.

---

## 5. Idempotency & views

- **Idempotency:** every load uses `upsert` with `onConflict = <PK>`. Re-running `main.js` is safe — existing rows are updated in place, no duplicates, no PK violations. This matters because you will run it more than once while the schema stabilizes.
- **Order still matters on re-run:** upsert of a child with a new FK value still needs the parent present, so always run the full ordered sequence, not a single table in isolation (unless its parents are unchanged).
- **Views come last.** Do **not** create `v_main_dataset`, `v_student_outcome`, `v_coverage_real`, `v_coverage_sim` until all base tables are loaded. Run **`002_kpi_views.sql` after the data load** (Phase 3). Views hold no data; recreating them is cheap and idempotent (`CREATE OR REPLACE VIEW`). If you ever `TRUNCATE ... CASCADE` to reset, re-run the loader then re-run `002_kpi_views.sql`.

---

## 6. Validation after load (this is how we answer "database có ok không")

Run all of these in `validate.js` (via `supabase` or `pg`) and fail the run if any assertion fails. Also optionally re-run `_dbcheck/introspect.mjs` to confirm PKs/FKs/row counts from the catalog.

### 6.1 Row-count assertions (exact)

| Table | Expected | Table | Expected |
|---|---|---|---|
| `dim_university` | 7 | `fact_tuition` | 63 |
| `dim_program` | 380 | `fact_employment` | 37 |
| `dim_student` | 500 | `fact_labor_demand` | 22 |
| `fact_exam_score` | 500 | `fact_cutoff_forecast` | 1 826 |
| `fact_cutoff_score` | 2 939 | `fact_application` | 3 096 |
| `fact_quota` | 1 366 | `fact_application_method` | 4 587 |

```sql
-- one-shot count sanity check
select 'dim_university' t, count(*) n from dim_university
union all select 'dim_program', count(*) from dim_program
union all select 'dim_student', count(*) from dim_student
union all select 'fact_exam_score', count(*) from fact_exam_score
union all select 'fact_cutoff_score', count(*) from fact_cutoff_score
union all select 'fact_quota', count(*) from fact_quota
union all select 'fact_tuition', count(*) from fact_tuition
union all select 'fact_employment', count(*) from fact_employment
union all select 'fact_labor_demand', count(*) from fact_labor_demand
union all select 'fact_cutoff_forecast', count(*) from fact_cutoff_forecast
union all select 'fact_application', count(*) from fact_application
union all select 'fact_application_method', count(*) from fact_application_method;
```

### 6.2 FK orphan checks (each must return 0 rows)

```sql
-- dim_program -> dim_university
select p.program_id from dim_program p
  left join dim_university u on u.university_code = p.university_code
  where u.university_code is null;

-- fact_application -> dim_student / dim_program
select a.application_id from fact_application a
  left join dim_student s on s.student_id = a.student_id where s.student_id is null;
select a.application_id from fact_application a
  left join dim_program p on p.program_id = a.program_id where p.program_id is null;

-- fact_application_method -> fact_application (always) / fact_cutoff_score (when cutoff_id not null)
select m.app_method_id from fact_application_method m
  left join fact_application a on a.application_id = m.application_id where a.application_id is null;
select m.app_method_id from fact_application_method m
  where m.cutoff_id is not null
    and not exists (select 1 from fact_cutoff_score c where c.cutoff_id = m.cutoff_id);

-- fact_cutoff_score / fact_cutoff_forecast -> dim_program (program_id is NOT NULL here)
select c.cutoff_id from fact_cutoff_score c
  left join dim_program p on p.program_id = c.program_id where p.program_id is null;
select f.forecast_id from fact_cutoff_forecast f
  left join dim_program p on p.program_id = f.program_id where p.program_id is null;

-- fact_quota / fact_employment -> dim_program ONLY when program_id is not null (nullable FK)
select q.quota_id from fact_quota q
  where q.program_id is not null
    and not exists (select 1 from dim_program p where p.program_id = q.program_id);
select e.employment_id from fact_employment e
  where e.program_id is not null
    and not exists (select 1 from dim_program p where p.program_id = e.program_id);
```

### 6.3 Sentinel / special-key checks

```sql
-- fact_tuition.program_id must be a sentinel OR a real program
select t.tuition_id, t.program_id from fact_tuition t
  where t.program_id not in ('ALL','SU_PHAM','NGOAI_SU_PHAM')
    and not exists (select 1 from dim_program p where p.program_id = t.program_id);

-- the 8 TUYEN_THANG rows are exactly the null-cutoff rows
select count(*) from fact_application_method
  where admission_method = 'TUYEN_THANG';          -- expect 8, all with cutoff_id null
select count(*) from fact_application_method where cutoff_id is null;  -- expect 8
```

### 6.4 Coverage check vs README

README states: **1 292** ô (program × năm có tuyển sinh), **1 273** (98.5%) have a main cutoff (THPT hoặc QUY_DOI_CHUNG) → **19 missing**, enumerated in the README (e.g. `BKA_MS5 (2024)`, `BKA_MS5 (2025)`, the 15 `DCN_*TA (2026)` English programs, `TLA_TLA129 (2026)`, `TLA_TLA205 (2023)`). Simulation NVs cover **1 291/1 292** cells and **380/380** programs (only `BKA_MS5 (2025)` has no application).

After building `v_coverage_real` (Section 5), assert:

```sql
select count(*)                          as cells_offered,        -- expect 1292
       count(*) filter (where has_main_cutoff) as cells_with_cutoff  -- expect 1273
from v_coverage_real where is_offered;
-- missing list (expect exactly the 19 from README)
select program_id, admission_year
from v_coverage_real
where is_offered and not has_main_cutoff
order by program_id, admission_year;
```

Cross-check the two view sheets as oracles: build `v_main_dataset` / `v_student_outcome`, then assert the DB views reproduce the `main_dataset` (3 096) and `student_outcome` (500) sheet row counts and key aggregates (e.g. admitted count from `Case_Summary`: 454 admitted of 500; 74 "đủ điểm nhưng không tốt nghiệp"). If the views match the shipped sheets, the base-table load is provably correct.

---

## 7. Real vs Simulated provenance (and surfacing it in the app)

Per `Source_Log`:

- **REAL** (collected from sources S01–S07, S13; cite `source_url`/`confidence` per row): `dim_university`, `dim_program`, `fact_cutoff_score`, `fact_quota`, `fact_tuition`, `fact_employment`, `fact_labor_demand`, and `fact_cutoff_forecast` (derived from real cutoffs). Caveat: `industry_group` and Holland codes for the 331 newer programs were **auto-assigned by the group** and should be treated as lower-confidence even within "real" tables (README §4).
- **SIMULATED** (S11, `scripts/simulate_students.py` 200 HS seed 2026 + `scripts/simulate_v4_extra.py` 300 HS seed 2027): `dim_student`, `fact_exam_score`, `fact_application`, `fact_application_method`, and the derived views `v_main_dataset`, `v_student_outcome`, `v_coverage_sim`. These are **not real people**; score distributions, NV-choice behavior, and special-case ratios are assumptions.

**Surface the distinction in the app (required by the task):**

1. Add a lightweight provenance source of truth — a `meta_table_provenance(table_name text pk, is_simulated boolean, source_ids text, note text)` table (or a committed JSON), seeded from the list above.
2. In the UI, badge any screen built on simulated tables with a clear label (e.g. **"Dữ liệu mô phỏng"** / "Simulated") and badge real-data screens with the source + confidence (`confidence` ∈ Cao/Trung bình/Thấp, plus `source_url`). The student-outcome / application-list features (K01, K02, K06, K07 inputs) are simulated; cutoff/quota/tuition/employment/forecast/labor features (K03, K04, K05) are real.
3. KPI notes to carry through (README §6): K01 is computed over all 500 students incl. those who skipped the exam (so it reads lower than v3); K02/K06/K07 only over eligible/admitted NVs. The app's KPI tooltips should state these scopes.

---

## 8. Gaps & open questions (note, don't block)

- **`fact_salary` (S08) and `fact_macro_labor` (S10) have no sheet** in this workbook. They're referenced in `Source_Log` but were dropped from the main package (README §7 moves 4 reference tables out). Treat as **optional/future**: no KPI in the current `KPI_Sheet` (K01–K07) requires them (K04 uses `fact_labor_demand`, which **is** present). If salary/macro features are wanted later, they need their own source files + tables; flag to the team that they're currently absent.
- **Live schema is unverified** (Section 0). Before the first real load, set `DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, apply `001_schema.sql`, and run `_dbcheck/introspect.mjs` to confirm the catalog matches the Data_Dictionary (column names, nullable FKs on `fact_quota.program_id`, `fact_employment.program_id`, `fact_application_method.cutoff_id`, and **no** FK on `fact_tuition.program_id` / `fact_labor_demand.industry_group`).
- **`scale_confirmed = FALSE`** rows in `fact_cutoff_score` (SPT của ĐH Y, HSA/TSA quy đổi HaUI 2024) and `confidence = Thấp` / `OTHER` method rows are real but low-trust; load them but ensure the app can filter them out of simulations/analytics (they were excluded from the package's own simulation).
- **Controlled vocabularies** (`exam_status`, `special_case`, `admission_method`, `program_type`, `confidence`, `quota_scope`) are good candidates for CHECK constraints or lookup tables in `001_schema.sql` — but enumerate values from the data profiles above so a legitimate value isn't rejected (e.g. `admission_method` has 13 distinct in cutoffs vs 9 in application_method; the superset must be allowed).
- **`est_total_cost_vnd` and other VND columns:** store as `bigint` (max ~941M today, but headroom is free and avoids a future migration).
