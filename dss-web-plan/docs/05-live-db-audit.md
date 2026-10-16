# Audit DB Supabase hiện tại (kết nối trực tiếp — số liệu THẬT)

- **Project:** `https://rihxlxjxnbobgwdzwqtp.supabase.co`
- **Cách kết nối:** REST API (PostgREST) bằng **secret key** (bỏ qua RLS → đọc được số dòng thật + toàn schema). Chỉ chạy truy vấn đọc.
- **Ngày kiểm tra:** 2026-10-16
- ⚠️ **Bảo mật:** secret key đã xuất hiện trong chat → nên **rotate (tạo lại) secret key** sau khi xong.

## 0. Kết luận 1 dòng
DB dùng **thiết kế phi chuẩn hoá (denormalized/materialized)**, phần lõi đã nạp tốt (dim + `main_dataset` 3096 dòng đủ sức chạy **Tổng quan + Q1 + Q4**), **nhưng** còn lỗ hổng chặn **Q2** và một phần **Q1 chi tiết**: `fact_cutoff_score` **rỗng**, `fact_cutoff_forecast` và `fact_application_method` **không tồn tại**, `fact_exam_score` chỉ nạp 200/≈500, và **RLS chặn anon** (web dùng anon key sẽ không thấy dữ liệu).

## 1. Số dòng thật mỗi bảng (11 bảng tồn tại)

| Bảng | Số dòng | Kỳ vọng | Trạng thái |
|---|---|---|---|
| dim_university | 7 | 7 | ✅ đủ |
| dim_program | 380 | 380 | ✅ đủ (có cờ `in_simulation`=true cho cả 380) |
| dim_student | 500 | 500 | ✅ đủ — **đã gộp luôn `v_student_outcome`** (các cột admitted_*, admission_status, n_nv...) |
| main_dataset | 3096 | 3096 | ✅ đủ — **bảng phẳng materialize từ `v_main_dataset`** (46 cột, có sẵn best_method, best_margin_30, is_eligible, is_admitted, est_total_cost_vnd, affordability_index_pct). 4 khoá: 2023=778, 2024=760, 2025=758, 2026=800. is_admitted=true: **454** (khớp Case_Summary) |
| fact_employment | 34 | ~34 | ✅ OK (Q3) |
| fact_labor_demand | 22 | ~22 | ✅ OK (Q3) |
| fact_tuition | 63 | ~63 | ✅ OK (Q4) |
| fact_salary | 35 | (Excel không có) | ✅ **bonus** — nhóm tự thêm bảng lương (industry_group × experience_level) |
| fact_quota | 1418 | ~1366 | 🟡 lệch +52 (chấp nhận được, có thể tách dòng theo phương thức) |
| **fact_cutoff_score** | **0** | **~2939** | 🔴 **RỖNG** — bảng + 21 cột đã tạo nhưng **chưa nạp dữ liệu** |
| **fact_exam_score** | **200** | **~500** | 🟠 **nạp thiếu** — chỉ 50 dòng/khoá × 4 = 200 (≈40%) |

## 2. Bảng / view CÒN THIẾU (không tồn tại trong DB)

| Thiếu | Loại | Vai trò | Ảnh hưởng |
|---|---|---|---|
| **fact_cutoff_forecast** | bảng | Dự báo điểm chuẩn + sai số (NAIVE/MA2) | 🔴 **Q2 / K03 không có dữ liệu lẫn bảng** |
| **fact_application_method** | bảng | NV × phương thức (chi tiết đa phương thức) | 🔴 **K02 chi tiết** mất (main_dataset chỉ có best_method + n_methods tổng hợp) |
| fact_application | bảng | NV chi tiết | 🟡 Thực chất đã nằm trong `main_dataset` (3096) nên không chặn, nhưng không có bảng chuẩn hoá riêng |
| v_main_dataset | view | — | 🟡 Đã thay bằng bảng `main_dataset` (materialized) → **không tự cập nhật** khi dữ liệu nguồn đổi |
| v_student_outcome | view | — | 🟡 Đã gộp vào `dim_student` |
| v_coverage_real / v_coverage_sim | view | QA độ phủ | 🟢 Không bắt buộc cho app |

## 3. Khoá ngoại (FK) — đã có khá tốt
PostgREST xác nhận các FK sau **đã được định nghĩa**:
- `dim_program.university_code → dim_university` ✅
- `fact_cutoff_score.program_id → dim_program`, `.university_code → dim_university` ✅
- `fact_employment.program_id → dim_program`, `.university_code → dim_university` ✅
- `fact_quota.university_code → dim_university` ✅ (nhưng `fact_quota.program_id` **chưa có FK** 🟡)
- `fact_tuition.university_code → dim_university` ✅ (`program_id` cố ý không FK vì có giá trị 'ALL' — hợp lý)
- `main_dataset.program_id → dim_program`, `.university_code → dim_university` ✅

**FK còn thiếu nên bổ sung:** `fact_exam_score.student_id → dim_student`, `main_dataset.student_id → dim_student`, `fact_quota.program_id → dim_program`, `fact_salary.industry_group`/`fact_labor_demand.industry_group` (nếu có bảng danh mục industry_group).

## 4. Cột bị lược so với Excel (phần lớn không ảnh hưởng tính toán)
- dim_university: thiếu `tier_rank` (suy ra được từ `tier`).
- dim_student: thiếu `data_batch` (phân biệt v2/v4).
- **fact_exam_score: thiếu `registered_subjects, absent_subjects, exempt_subjects, failing_subjects`** ← cần cho logic case đặc biệt (bỏ thi/điểm liệt/miễn thi) nếu muốn tính lại từ điểm thô; hiện đã có `special_case`/`exam_status` tính sẵn trong `dim_student` nên không chặn.
- fact_tuition: thiếu `amount_min/amount_max/unit/source_url` (đã có bản quy đổi `tuition_min/max/mid_vnd_year`).
- fact_labor_demand: thiếu `source_name/source_url`.

## 5. RLS — ⚠️ điểm cần sửa cho web app
Khi gọi bằng **anon/publishable key**, MỌI bảng trả về **0 dòng**; bằng **secret key** thì ra số thật ⇒ **RLS đang bật nhưng chưa có policy SELECT cho `anon`** (hoặc thiếu GRANT).
→ **Hệ quả:** web Next.js nếu query trực tiếp bằng anon key từ trình duyệt sẽ **không thấy dữ liệu gì**.
→ **Cách xử lý (chọn 1):**
  1. Thêm policy đọc công khai: `create policy "public read" on <table> for select to anon using (true);` cho từng bảng (dữ liệu tham khảo công khai, hợp lý cho đồ án); **hoặc**
  2. Chỉ fetch ở **server** (Server Components / Route Handlers) bằng service_role key (không bao giờ để lộ ra client).

## 6. Khuyến nghị tổng thể
**Giữ nguyên thiết kế denormalized hiện tại và BỔ SUNG** (ít việc hơn, `main_dataset` vốn đã chạy tốt cho DSS), theo thứ tự ưu tiên:
1. 🔴 **Nạp dữ liệu `fact_cutoff_score`** (2939 dòng từ sheet `cutoff_score`) — xương sống điểm chuẩn.
2. 🔴 **Tạo + nạp `fact_cutoff_forecast`** (1826 dòng từ sheet `cutoff_forecast`) — bật lại **Q2**.
3. 🟠 **Nạp đủ `fact_exam_score`** (hiện 200 → ~500) và cân nhắc thêm `fact_application_method` (4587) nếu muốn phân tích K02 chi tiết.
4. 🟡 **Thêm RLS read policy cho anon** (hoặc chuyển sang fetch server-side).
5. 🟡 Bổ sung FK còn thiếu (student_id, quota.program_id); thêm lại cột `tier_rank`, subject-lists nếu cần.
6. 🟢 (Tuỳ chọn) Tạo các VIEW `v_coverage_real/sim`, và quyết định `main_dataset` giữ dạng bảng materialized (nhớ refresh) hay chuyển thành VIEW.

> So với "schema chuẩn phi-materialize" mà workflow kế hoạch đang dựng (`schema/001_schema.sql`): DB của bạn **lệch có chủ đích** (gộp outcome vào dim_student, materialize main_dataset, bỏ các view). Không sai — chỉ cần lấp 3 lỗ hổng dữ liệu ở trên là chạy đủ 4 module.

---

## 7. ✅ TRẠNG THÁI SAU KHI SỬA (2026-10-16) — ĐÃ XONG

Đã chạy `fix/01_ddl_augment.sql` (DDL) + nạp dữ liệu qua REST. Kết quả xác minh cuối (số dòng khi đọc bằng **secret key** và **anon/publishable key** — **khớp nhau** ⇒ RLS policy đọc công khai hoạt động, web app đọc được):

| Bảng | Số dòng | anon đọc được? |
|---|---|---|
| dim_university | 7 | ✅ |
| dim_program | 380 | ✅ |
| dim_student | 500 | ✅ |
| fact_exam_score | **500** (đã đủ, trước 200) | ✅ |
| fact_cutoff_score | **2939** (đã đủ, trước 0) | ✅ |
| fact_quota | 1418 | ✅ |
| fact_tuition | 63 | ✅ |
| fact_employment | 34 | ✅ |
| fact_labor_demand | 22 | ✅ |
| fact_salary | 35 | ✅ |
| main_dataset | 3096 | ✅ |
| **fact_cutoff_forecast** | **1826** (MỚI tạo + nạp) | ✅ |
| **fact_application_method** | **4587** (MỚI tạo + nạp) | ✅ |

**Đã khắc phục:**
- ✅ `fact_cutoff_score` 0 → **2939** (gồm 8 dòng tổ hợp năng khiếu sau khi ALTER `subject_combination` → text).
- ✅ Tạo + nạp `fact_cutoff_forecast` (1826) → **Q2/K03 chạy được**.
- ✅ Tạo + nạp `fact_application_method` (4587) → **K02 chi tiết chạy được**.
- ✅ `fact_exam_score` 200 → **500**.
- ✅ **RLS + policy đọc công khai cho anon** trên cả 13 bảng → web dùng publishable key đọc được.
- ✅ Bổ sung FK: `fact_quota.program_id` (dọn `''`→NULL trước), `fact_exam_score.student_id`, `main_dataset.student_id`.

**Còn lại (tùy chọn, không chặn):** cột provenance bị lược (tier_rank, source_url, 4 cột subject của exam_score…); cân nhắc tạo VIEW `v_coverage_real/sim`; quyết định `main_dataset` giữ materialized (nhớ refresh khi dữ liệu nguồn đổi) hay chuyển thành VIEW.

**→ DB hiện đã đủ để chạy cả 4 module DSS.**
