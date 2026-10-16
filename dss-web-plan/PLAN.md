# PLAN.md — Kế hoạch triển khai Web App: DSS Tư vấn Tuyển sinh & Hướng nghiệp

> **Dự án:** DSS Tư vấn Tuyển sinh & Hướng nghiệp — Nhóm 5, Assignment.
> **Phạm vi dữ liệu:** 7 trường ĐH Hà Nội · 380 ngành/chương trình · 500 học sinh mô phỏng · năm tuyển sinh 2023–2026.
> **Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS · shadcn/ui · Recharts · Supabase (Postgres + `@supabase/ssr`) · Vercel.
> **Người đọc:** nhóm sinh viên dev — tài liệu này là bản kế hoạch tổng để build được, gom mọi quyết định thiết kế từ các tài liệu con.
> **Nguyên tắc bất di bất dịch:** mọi nhãn tiếng Việt giữ **nguyên văn (verbatim)** — không bỏ dấu, không dịch, không đổi chữ (kể cả en-dash `–`, `≤`, `…`).

**Bản đồ tài liệu (đọc kèm):**
- [`docs/01-architecture.md`](docs/01-architecture.md) — Kiến trúc web, bản đồ trang, data access, auth, deploy.
- [`docs/02-etl-data-loading.md`](docs/02-etl-data-loading.md) — Nạp Excel → Supabase + validate.
- [`docs/03-dss-logic-and-flows.md`](docs/03-dss-logic-and-flows.md) — Thuật toán DSS & luồng người dùng.
- [`docs/04-verification.md`](docs/04-verification.md) — Kiểm định schema & KPI (adversarial review).
- [`docs/05-live-db-audit.md`](docs/05-live-db-audit.md) — **Audit DB Supabase THẬT (đã kết nối, đã introspect).** ⭐ nguồn chân lý cho DB live.
- [`schema/001_schema.sql`](schema/001_schema.sql) — DDL 12 bảng + FK + CHECK + RLS (thiết kế **canonical chuẩn**, để tham khảo).
- [`schema/002_kpi_views.sql`](schema/002_kpi_views.sql) — 4 VIEW dẫn xuất + hàm + 7 VIEW KPI.
- [`fix/01_ddl_augment.sql`](fix/01_ddl_augment.sql) — **SQL bổ sung DB live** (hướng đã chọn: giữ + bổ sung).

> ### ⚠️ CẬP NHẬT (2026-10-16) — DB live ĐÃ được introspect
> Tài liệu §6 và §9 bên dưới viết khi *chưa* nối được DB nên ghi "DB live chưa kiểm chứng". **Nay đã kết nối & kiểm tra thật** (xem [`docs/05-live-db-audit.md`](docs/05-live-db-audit.md)). Tóm tắt khác biệt so với giả định canonical:
> - DB live dùng **thiết kế denormalized**: KHÔNG có `fact_application`/`v_main_dataset` riêng — thay bằng **1 bảng phẳng `main_dataset` (3096 dòng, đã materialize)**; `v_student_outcome` **gộp vào `dim_student`**; chưa có các VIEW.
> - **Hướng đã chọn (theo yêu cầu): GIỮ thiết kế denormalized này + BỔ SUNG**, không rebuild theo `001_schema.sql`. Vì vậy `001`/`002` là **bản tham khảo canonical**, còn việc sửa DB thật dùng [`fix/01_ddl_augment.sql`](fix/01_ddl_augment.sql).
> - Đã nạp xong: `fact_exam_score` (500), `fact_cutoff_score` (2931/2939). Còn lại sau khi chạy `fix/01`: tạo `fact_cutoff_forecast`+`fact_application_method` rồi nạp, +8 dòng cutoff năng khiếu, +RLS policy, +FK thiếu.
> - Giữ nguyên các giá trị tham chiếu quan trọng: **H1 (K02 phải dùng `score_eligible`, không phải `is_eligible`)** vẫn áp dụng — `main_dataset` có sẵn cột `score_eligible`.

---

## 1. Tóm tắt dự án

**DSS làm gì:** biến dữ liệu tuyển sinh thật (điểm chuẩn, chỉ tiêu, học phí, việc làm, dự báo) + 500 hồ sơ học sinh mô phỏng thành **lời khuyên hành động** cho việc chọn & xếp nguyện vọng. Mạch 3 lớp xuyên suốt mọi màn hình:

```
DỮ LIỆU THẬT (fact_*)  →  KPI (K01–K07)  →  KHUYẾN NGHỊ HÀNH ĐỘNG
```

**4 câu hỏi quyết định (Decision Questions):**

| Mã | Câu hỏi quyết định | KPI chính | Màn hình |
|----|--------------------|-----------|----------|
| **Q1** | Xếp nguyện vọng thế nào để vừa có cơ hội vào ngành mơ ước, vừa chắc chắn đỗ? | K01, K02 | *Xếp nguyện vọng* |
| **Q2** | Dự báo điểm chuẩn đáng tin đến đâu? | K03 | *Dự báo điểm chuẩn* |
| **Q3** | Học xong ngành này có dễ xin việc? | K04, K05 | *Cơ hội việc làm* |
| **Q4** | Gia đình có đủ sức lo chi phí học không? | K06, K07 | *Chi phí & khả năng chi trả* |
| **Σ** | Nên ưu tiên ngành nào nhất? | tổng hợp 4 trục | *Khuyến nghị tổng hợp* |

**7 KPI (giữ nguyên tên + đơn vị + giá trị mẫu):**

| KPI | Tên | Đơn vị | Giá trị mẫu |
|---|---|---|---|
| **K01** | Tỷ lệ đỗ nhóm nguyện vọng mục tiêu (NV1–NV3) | % (phân số) | 0.648 |
| **K02** | Lợi thế từ phương thức xét tuyển phụ | % (phân số) | 0.3768 |
| **K03** | Biên độ sai số dự báo điểm chuẩn (MAE, MA2) | điểm (thang 30) | 1.3458 |
| **K04** | Tốc độ tăng trưởng nhu cầu ngành | % | -0.2918 (minh họa) |
| **K05** | Tỷ lệ sinh viên có việc làm sau 1 năm | % (phân số) | 0.9448 |
| **K06** | Tổng chi phí ước tính toàn khóa | VND | ~318.000.000 |
| **K07** | Chỉ số áp lực tài chính gia đình | % (phân số HS vượt NS) | 0.3326 |

> ⚠️ **Đơn vị:** các KPI tỷ lệ lưu dưới dạng **phân số** (0.648 = 64,8%). Chuẩn hoá ×100 **ngay trong VIEW/RPC** (trả `value_pct`) để không "quên nhân 100 chỗ này chỗ kia". K03 là điểm (2 chữ số thập phân), K06 là VND.

**Vì sao chọn stack này:** Next.js App Router cho phép đọc dữ liệu thẳng trong Server Component (ít API thủ công), Supabase cho Postgres + PostgREST + RLS sẵn, Recharts + shadcn/ui dựng dashboard nhanh, Vercel deploy 1 click. Dữ liệu assignment **tĩnh** → cache mạnh, không cần backend riêng.

---

## 2. Kiến trúc tổng thể

Client (React, chỉ nhận JSON/HTML đã render, dùng `anon` key) → Next.js trên Vercel (Server Components đọc dữ liệu mặc định; Route Handlers chỉ cho export CSV / RPC Q1 / phân trang Explorer) → Supabase (Postgres 12 bảng + 4 VIEW + RPC, RLS bật, policy *public SELECT*).

Nguyên tắc key: **`anon` key + RLS "public SELECT" đủ cho ~95% nhu cầu** (app chỉ-đọc); `service_role` **chỉ** ở server, dùng cho seed/migrate, không bao giờ vào client bundle. Auth v1: **không đăng nhập per-user** — "chọn hồ sơ học sinh" (1 trong 500 `dim_student`) qua query param `?student=HS2023001` thay cho tài khoản.

Chi tiết đầy đủ (sơ đồ, cấu trúc thư mục, 3 Supabase client, bản đồ 9 trang, data-access pattern, palette biểu đồ, deploy): xem **[`docs/01-architecture.md`](docs/01-architecture.md)**.

---

## 3. Mô hình dữ liệu & schema

Mô hình **sao (star schema)**: `dim_university (7)` → `dim_program (380)` → các fact (cutoff/quota/tuition/employment/forecast); `dim_student (500)` → `fact_exam_score` và `fact_application` → `fact_application_method`; `fact_application_method.cutoff_id → fact_cutoff_score` (**NULL** khi `TUYEN_THANG`); `fact_labor_demand` khóa theo `industry_group` (không nối program).

Ánh xạ **tên sheet Excel → tên bảng chuẩn (canonical)** — Postgres dùng tên chuẩn: `university→dim_university`, `program→dim_program`, `student→dim_student`, `score→fact_exam_score`, `application→fact_application`, `application_method→fact_application_method`, `cutoff_score→fact_cutoff_score`, `quota→fact_quota`, `tuition→fact_tuition`, `employment→fact_employment`, `labor_demand→fact_labor_demand`, `cutoff_forecast→fact_cutoff_forecast`, `main_dataset→v_main_dataset (VIEW)`, `student_outcome→v_student_outcome (VIEW)`.

**Bảng gọn — grain / số dòng / thật-vs-mô phỏng:**

| Bảng / VIEW | Grain (1 dòng =) | Số dòng | Thật/Mô phỏng |
|---|---|---|---|
| `dim_university` | 1 trường | 7 | **THẬT** |
| `dim_program` | 1 ngành/chương trình | 380 | **THẬT** |
| `dim_student` | 1 học sinh | 500 | **MÔ PHỎNG** |
| `fact_exam_score` | 1 HS (điểm thi + học bạ) | 500 | **MÔ PHỎNG** |
| `fact_cutoff_score` | điểm chuẩn (ngành × năm × phương thức) | 2 939 | **THẬT** |
| `fact_quota` | chỉ tiêu (ngành/trường × năm × phương thức) | 1 366 | **THẬT** |
| `fact_tuition` | học phí (trường/ngành × năm học) | 63 | **THẬT** |
| `fact_employment` | tỷ lệ việc làm (ngành/lĩnh vực × khóa TN) | 37 | **THẬT** |
| `fact_labor_demand` | chỉ số nhu cầu (industry_group × metric × năm) | 22 | **THẬT** |
| `fact_cutoff_forecast` | dự báo (ngành × năm × phương pháp) | 1 826 | **THẬT** (suy từ điểm chuẩn thật) |
| `fact_application` | 1 nguyện vọng (HS × ngành) | 3 096 | **MÔ PHỎNG** |
| `fact_application_method` | 1 NV × 1 phương thức | 4 587 | **MÔ PHỎNG** |
| `v_main_dataset` (VIEW) | 1 NV phẳng (join HS+ngành+chi phí) | 3 096 | MÔ PHỎNG |
| `v_student_outcome` (VIEW) | 1 HS / kết quả trúng tuyển | 500 | MÔ PHỎNG |
| `v_coverage_real` (VIEW) | ô ngành × năm (QA độ phủ thật) | 1 520 | THẬT (QA) |
| `v_coverage_sim` (VIEW) | ô ngành × năm (QA độ phủ mô phỏng) | 1 520 | MÔ PHỎNG (QA) |

**Quyết định schema đáng nhớ** (chi tiết: [`001_schema.sql`](schema/001_schema.sql), [`002_kpi_views.sql`](schema/002_kpi_views.sql)):
- **PK là TEXT tự nhiên, giữ nguyên văn** (`HS2023001`, `CUT0001`, `APP00001-M1`, `BKA_IT1`) — không bịa surrogate UUID.
- **15 FK sao** được thêm (DB live trước đó **không có FK nào** kiểm chứng được), `ON UPDATE CASCADE ON DELETE RESTRICT`; `fact_application_method.cutoff_id` **nullable** cho 8 dòng `TUYEN_THANG`.
- **Tiền/VND → `bigint`** (tránh tràn int32).
- **`fact_tuition.program_id` KHÔNG có FK** vì trộn program_id thật với sentinel `ALL`/`SU_PHAM`/`NGOAI_SU_PHAM` → enforce bằng CHECK + validate ở ETL, join `dim_program` chỉ khi không phải sentinel.
- Cột đa giá trị (`subject_combinations`, `years_offered`, …) giữ **text `;`-phân tách** verbatim ở v1.
- CHECK cho domain nhỏ ổn định (gender, tier, program_type, admission_method theo từng bảng, …); RLS bật trên cả 12 bảng, policy *public SELECT* cho `anon`+`authenticated`.
- `fact_salary` (S08) & `fact_macro_labor` (S10): **không có sheet** trong gói v5 → **không tạo**, coi là tùy chọn/tương lai.

**Lớp VIEW/KPI** (trong `002`): 4 VIEW dẫn xuất (`v_main_dataset` 42 cột, `v_student_outcome` 11 cột, `v_coverage_real`/`v_coverage_sim`) + `v_kpi_params` + 5 hàm IMMUTABLE (`fn_tsa_to_30`, `fn_hsa_to_30`, `fn_holland_match_pct`, `fn_est_total_cost`, `fn_affordability_index`) + 7 VIEW KPI (`v_kpi_k01`…`v_kpi_k07`, kèm `*_detail` cho K06/K07).

---

## 4. Lớp KPI & logic DSS

Chi tiết thuật toán + luồng màn hình: **[`docs/03-dss-logic-and-flows.md`](docs/03-dss-logic-and-flows.md)**. Tóm tắt 7 KPI (1 dòng mỗi cái):

- **K01** — Tỷ lệ đỗ NV1–NV3 trên **toàn bộ 500 HS** (gồm HS không tốt nghiệp) = 324/500 = 0.648.
- **K02** — Tỷ lệ NV đỗ **nhờ phương thức ≠ THPT** trên tổng **NV đủ điểm** (`score_eligible`) = 667/1770 = 0.3768.
- **K03** — MAE của dự báo MA2 (thang 30, 2025–2026) = 1.3458 điểm.
- **K04** — Tăng trưởng nhu cầu nhân lực YoY theo `industry_group` (chỉ so cùng metric; mẫu −0.2918 là minh họa).
- **K05** — Tỷ lệ SV có việc làm sau 1 năm, bình quân các dòng `fact_employment` = 0.9448.
- **K06** — Tổng chi phí toàn khóa = Σ(học phí năm đầu × 1,1^k) + (54tr − hỗ trợ NĐ116) × số năm.
- **K07** — `affordability_index` = tổng chi phí / (ngân sách/năm × số năm) × 100; >100% = vượt khả năng; 33,3% HS trúng tuyển vượt ngân sách.

**Ý tưởng cốt lõi Q1 — reach / match / safety:** chấm mỗi (HS, ngành) → `best_margin_30 = điểm HS (thang 30) − điểm chuẩn DỰ BÁO năm mục tiêu`; phân loại theo biên co giãn theo sai số dự báo của chính ngành (`MAE_eff = max(MAE_program, 1.35)`):
- **REACH** (ngành mơ ước): `m < −0.4×MAE_eff` — chưa đủ điểm, "với cao".
- **MATCH** (vừa sức): `−0.4×MAE_eff ≤ m < 1.1×MAE_eff`.
- **SAFETY** (chốt đỗ): `m ≥ 1.1×MAE_eff`.
Xác suất đỗ `P_admit = Φ(m / σ_cutoff)`; đề xuất "ladder" NV1–2 REACH, giữa MATCH, cuối SAFETY, ép P(đỗ ≥1 NV) ≥ 0.95, cảnh báo nếu 3 NV đầu quá mạo hiểm so với baseline K01 = 64,8%. Màn hình Σ gộp 4 trục fit/prob/job/cost với trọng số người dùng chỉnh được.

---

## 5. Nạp dữ liệu Excel → Supabase (ETL)

Chi tiết: **[`docs/02-etl-data-loading.md`](docs/02-etl-data-loading.md)**. Nguyên tắc **3 pha nghiêm ngặt**: (1) apply `001_schema.sql` → (2) nạp dữ liệu (idempotent upsert) → (3) tạo VIEW `002_kpi_views.sql` **rồi** validate.

- **Thứ tự nạp theo phụ thuộc FK:** dims trước (`dim_university` → `dim_program` → `dim_student`), rồi facts, `fact_application_method` **cuối cùng** (phụ thuộc cả `fact_application` lẫn `fact_cutoff_score`).
- **Công cụ khuyến nghị:** script Node một lần (`xlsx` SheetJS + `@supabase/supabase-js` dùng `service_role` key, batch 500, `upsert onConflict=<PK>`). CSV import chỉ là fallback thủ công.
- **8 quy tắc transform R1–R8:** empty→NULL, int (gỡ `.0`), float (giữ 0.25/0.75 là điểm liệt thật), bool `True/False`, date ISO, **money→bigint**, text verbatim (mã số như `7480101` giữ dạng text), list `;`-phân tách verbatim.
- **Bẫy cần nhớ:** `cutoff_id` rỗng của 8 dòng `TUYEN_THANG` → NULL (không bịa cutoff giả); `fact_tuition.program_id` giữ sentinel `ALL`/`SU_PHAM`/`NGOAI_SU_PHAM`; 33 NV không có dòng method (hợp lệ, không bịa); `scale_confirmed=FALSE` + `OTHER` nạp nhưng gắn cờ "độ tin cậy thấp".
- **Validate sau nạp** (chính là cách trả lời "DB có ok không"): assert số dòng từng bảng (bảng §9), orphan FK = 0, sentinel/NULL check, coverage 1 273/1 292 ô có điểm chuẩn chính (19 ô thiếu khớp README), và đối chiếu VIEW với sheet `main_dataset` (3 096) / `student_outcome` (500) + `Case_Summary` (454 trúng tuyển, 74 "đủ điểm nhưng không tốt nghiệp").

---

## 6. Những phát hiện khi kiểm định schema (QUAN TRỌNG — trả lời "DB có ok không")

Nguồn: **[`docs/04-verification.md`](docs/04-verification.md)**. Kết luận kiểm định các **file SQL**: schema gốc **trung thực** — đủ 12 bảng, đủ mọi cột Data_Dictionary, kiểu/nullability/CHECK/FK hợp lý, nhãn tiếng Việt verbatim. Nhưng **DB live trên Supabase CHƯA từng được kiểm chứng** và có một số vấn đề cần xử lý:

| Mức | Vấn đề | Cách sửa |
|---|---|---|
| ⛔ **Chặn (gốc)** | **DB live chưa được introspect** — chưa có `DATABASE_URL`/`.env.local`, `_dbcheck/introspect.mjs` chưa chạy. Theo agent schema, **DB live trước đó không có FK nào** kiểm chứng được. | Đặt `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, chạy `introspect.mjs`, **apply `001_schema.sql`** (thêm 15 FK + RLS), diff với Data_Dictionary. |
| 🔴 **HIGH (H1)** | **K02 dùng sai cờ.** `v_kpi_k02` lọc bằng `is_eligible`, nhưng KPI_Sheet là "NV **đủ điểm**" = `score_eligible`. Chỉ `score_eligible` mới ra đúng mẫu 667/1770 = 0.3768; `is_eligible` ra ≈0.393 (lệch 74 NV đủ điểm nhưng không tốt nghiệp). | Trong `v_kpi_k02` thay cả 2 chỗ `is_eligible` → `score_eligible` (`v_main_dataset` đã có sẵn cột này). |
| 🟠 **MEDIUM (M1)** | `fact_application_method.score_scale` CHECK `IN (30,40,100,150)` sẽ **từ chối** dòng SAT (scale 1600) nếu sau này có. Hiện chưa có SAT nên pass. | Thêm `1600` vào CHECK **hoặc** ghi chú SAT ngoài phạm vi (chọn 1). |
| 🟠 **MEDIUM (M2)** | FK `program_id` mới (`fact_cutoff_score`/`fact_cutoff_forecast`/`fact_quota`/`fact_employment`/`fact_application`) sẽ **fail khi load** nếu có mã lạ (vd combination-group HUST) không có trong `dim_program`. | Trước khi load chạy `SELECT DISTINCT program_id … EXCEPT SELECT program_id FROM dim_program` cho từng bảng, kỳ vọng 0 dòng; nếu không, thêm dòng `dim_program` thiếu trước. |
| 🟡 **LOW (L1–L4)** | L1 `fact_tuition.program_id` không FK (đúng, nên thêm CHECK sentinel). L2 `UNIQUE(student_id, nv_order)` là giả định, không phải luật từ điển. L3 K03/K05 VIEW gộp mất granularity "Ngành × năm" / "Ngành × khóa TN". L4 **K04 không tái tạo được mẫu −0.2918 (cố ý)** vì mẫu chia 2 thước đo TopCV khác nhau — là giới hạn dữ liệu, không phải bug SQL. | L1 thêm CHECK; L2 ghi chú ở ETL; L3 thêm cột group hoặc detail view; L4 **ghi rõ trên UI**, không "fix". |

**Đã xác nhận ĐÚNG, không cần sửa:** đủ 12 bảng/cột; 4 VIEW đúng số cột & số dòng; mọi FK sao đúng (gồm `cutoff_id` nullable cho TUYEN_THANG); nullability khớp `missing_count`; CHECK domain không loại giá trị hợp lệ nào; K01/K03/K05/K06/K07 khớp mẫu; hàm `fn_est_total_cost`/`fn_affordability_index` tái tạo đúng giá trị stored.

---

## 7. Lộ trình triển khai theo mốc (Milestones)

| Mốc | Mục tiêu | Checklist |
|---|---|---|
| **M0 — Setup** | Khung dự án chạy được | ☐ `create-next-app` (TS, Tailwind, App Router) ☐ cài shadcn/ui, Recharts, `@supabase/ssr` ☐ 3 Supabase client (client/server/admin) ☐ `.env.local` + `.env.example` ☐ palette vào `globals.css` ☐ Sidebar + layout 9 trang rỗng |
| **M1 — DB + ETL** | DB "ok" chứng minh được | ☐ đặt `DATABASE_URL`, chạy `introspect.mjs` ☐ apply `001_schema.sql` (FK+RLS) ☐ **sửa H1 (K02 → `score_eligible`)** ☐ chạy ETL Node (12 bảng, đúng thứ tự) ☐ apply `002_kpi_views.sql` ☐ chạy `validate.js` (row-count, orphan, coverage) ☐ `supabase gen types` → `database.types.ts` |
| **M2 — Tổng quan + Explorer** | Dashboard + tra cứu | ☐ RPC/VIEW `kpi_overview` ☐ `KpiRow` 7 card + `FilterBar` (cohort/trường/khối ngành) ☐ funnel kết quả + bar K05 ☐ `ProgramTable` 380 ngành (phân trang server) ☐ `/explorer/[programId]` gom mọi fact |
| **M3 — 4 module quyết định** | Q1–Q4 chạy được | ☐ Q2 `ForecastChart` (NAIVE/MA2/actual + dải MAE) ☐ Q1 `StudentPickerDialog` + `NvRecommendationList` (reach/match/safety) + RPC `q1_recommend` ☐ Q4 `AffordabilityMeter` + `CostBreakdownChart` ☐ Q3 `DemandGrowthChart` + `EmploymentRateChart` (ngưỡng 90%, badge "Chưa đủ dữ liệu") |
| **M4 — Engine khuyến nghị DSS** | Màn hình Σ | ☐ shared engine (quy đổi thang 30, priority_bonus, Holland, forecast band, K06/K07) ☐ hỗ trợ **hồ sơ nhập tay** (tính on-the-fly) ☐ 4 slider trọng số + preset ☐ bảng xếp hạng + Top-3 + lý do tự sinh ☐ "Áp vào Q1" |
| **M5 — Polish + Deploy** | Giao được | ☐ trang `/chat-luong-du-lieu` (`CoverageHeatmap` + `DataQualityBadge` + nhãn THẬT/MÔ PHỎNG) ☐ dark mode ☐ table-view cho mọi chart ☐ export CSV ☐ caching/ISR ☐ deploy Vercel (region Singapore) + env |

---

## 8. Rủi ro & giả định cần xác minh (gộp từ các agent)

1. **DB live chưa introspect** (mối lo gốc của người dùng) — mọi thứ giả định tên/cột khớp Data_Dictionary; bất kỳ lệch nào (cột float thay numeric, bool lưu text, thiếu `score_eligible`, thiếu VIEW) sẽ làm hỏng VIEW/KPI. **Phải chạy introspect + diff trước khi code UI.**
2. **FK `program_id`** có thể có orphan (mã combination-group) → load fail (M2). Chạy EXCEPT check trước.
3. **H1 K02** phải sửa trước khi tin KPI K02.
4. **Domain CHECK brittle:** `admission_method`/`score_scale`/`method_group`/`tier` dùng tập giá trị quan sát được của gói v5; load tương lai có giá trị mới (SAT 1600, XTTN_* mới, tier mới) sẽ bị từ chối. Giả định: domain v5 cố định.
5. **K04 không tái tạo được mẫu** (L4) — `fact_labor_demand` 22 dòng trộn metric/đơn vị khác nhau; chỉ so YoY khi cùng metric; UI phải ghi rõ, kèm số thiếu hụt tuyệt đối để tránh hiểu lầm "ngành bão hòa".
6. **Độ phủ mỏng:** `fact_employment` 26/380 ngành, `fact_labor_demand` 15/23 nhóm → nhiều ngành fallback theo lĩnh vực/toàn trường; badge "Chưa đủ dữ liệu" phải thật, không ngụy tạo.
7. **Quy đổi thang ngoài 30/40** (TSA/HSA/SAT/110/1200) là **giả định tuyến tính của nhóm** → `margin_30` gần đúng; `scale_confirmed=FALSE` & `OTHER` không dùng để tính đủ điểm.
8. **`fn_holland_match_pct`** reverse-engineer từ 11 giá trị quan sát → cặp RIASEC chưa test lý thuyết có thể lệch; đã COALESCE cột stored trước nên chỉ what-if mới phụ thuộc hàm.
9. **Mã Holland 331 ngành mới** gán tự động → `holland_match_pct` chỉ là trục "mềm" trong Σ.
10. **Dự báo 2027** (693 dòng) chưa có actual → chỉ hiển thị dự báo + dải MAE, không khẳng định chính xác.
11. **`is_admitted` pass-through** từ simulator (không recompute live) để giữ đúng edge case TUYEN_THANG/ưu tiên.
12. **`fact_salary`/`fact_macro_labor` không có** → Q3 ẩn phần lương êm, không lỗi.
13. **VIEW nặng** (`v_main_dataset`, `v_coverage_*`) có thể cần MATERIALIZED VIEW nếu dashboard chậm.
14. **`UNIQUE(student_id, nv_order)`** là giả định — reload trùng nv_order sẽ fail (L2).
15. **SQL chưa chạy trên Postgres thật** — mới validate cấu trúc (đếm bảng/FK/index, cân ngoặc, UTF-8); cần chạy thật lần đầu trên Supabase.

---

## 9. Checklist đối chiếu DB Supabase hiện tại (chạy trực tiếp trên DB live)

> Đây là bước **biến "không chắc" thành "chắc chắn"**. Dùng `_dbcheck/introspect.mjs` (chỉ-đọc catalog) + các query dưới.

**9.1. Bảng có mặt?** đủ **12 bảng base** + **4 VIEW** (`v_*` phải là VIEW, không phải bảng nhân bản); tên là **canonical** (`dim_*`/`fact_*`), không phải tên sheet. `fact_salary`/`fact_macro_labor` **không tồn tại** = đúng kỳ vọng.

**9.2. Cột/kiểu khớp `001_schema.sql`?** mọi cột Data_Dictionary có mặt, không thừa cột; VND = `bigint`, điểm/tỷ lệ = `numeric`, ngày = `date`, bool = `boolean` (không phải text); mã số (`major_code`, `published_code`) = `text`.

**9.3. FK có mặt?** 15 FK sao (đặc biệt `fact_application_method.cutoff_id → fact_cutoff_score`, **NULL** ở 8 dòng TUYEN_THANG; `fact_quota.program_id`/`fact_employment.program_id` **nullable**; `fact_tuition.program_id` & `fact_labor_demand.industry_group` **KHÔNG** có FK).

**9.4. VIEW có mặt?** `v_main_dataset` (42 cột), `v_student_outcome` (11 cột), `v_coverage_real`, `v_coverage_sim` + `v_kpi_k01…k07` + 5 hàm `fn_*` + `v_kpi_params`.

**9.5. Số dòng khớp?** (assert chính xác)

| Bảng | Kỳ vọng | Bảng | Kỳ vọng |
|---|---|---|---|
| `dim_university` | 7 | `fact_tuition` | 63 |
| `dim_program` | 380 | `fact_employment` | 37 |
| `dim_student` | 500 | `fact_labor_demand` | 22 |
| `fact_exam_score` | 500 | `fact_cutoff_forecast` | 1 826 |
| `fact_cutoff_score` | 2 939 | `fact_application` | 3 096 |
| `fact_quota` | 1 366 | `fact_application_method` | 4 587 |
| `v_main_dataset` | 3 096 | `v_student_outcome` | 500 |
| `v_coverage_real` | 1 520 | `v_coverage_sim` | 1 520 |

**9.6. Orphan FK = 0?** chạy mọi query orphan ở `docs/02` §6.2 (mỗi query phải trả 0 dòng); EXCEPT check `program_id` (M2).

**9.7. Sentinel & NULL đúng?** `fact_tuition.program_id` chỉ gồm sentinel hoặc program thật; `fact_application_method` có đúng 8 dòng `cutoff_id IS NULL` = 8 dòng `TUYEN_THANG`.

**9.8. RLS policy?** RLS **bật** trên cả 12 bảng; mỗi bảng + VIEW có policy *SELECT* cho `anon` (+ `authenticated`); **không** mở INSERT/UPDATE/DELETE cho `anon`.

**9.9. Coverage oracle:** `v_coverage_real`: 1 273/1 292 ô có điểm chuẩn chính (98,5%), đúng 19 ô thiếu khớp README; `Case_Summary`: 454 trúng tuyển / 500, 74 "đủ điểm nhưng không tốt nghiệp".

---

*Hết PLAN.md — mọi công thức & nhãn tiếng Việt đã kiểm chứng khớp gói dữ liệu v5. Bắt đầu từ Mốc M1 §7: chạy introspect, apply `001`, sửa H1, nạp dữ liệu, validate.*
