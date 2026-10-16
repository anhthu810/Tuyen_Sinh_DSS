# 03 — DSS Logic & User Flows (Bộ não của hệ thống)

**Dự án:** DSS Tư vấn Tuyển sinh & Hướng nghiệp — Nhóm 5
**Phạm vi dữ liệu:** 7 trường ĐH Hà Nội · 380 ngành/chương trình · 500 HS mô phỏng · khóa 2023–2026
**Tài liệu này mô tả:** các *thuật toán ra quyết định* và *luồng người dùng* biến dữ liệu + KPI (K01–K07) thành lời khuyên hành động được — không chỉ là dashboard số liệu thô.

> Quan hệ với các tài liệu khác trong `docs/`:
> - `01-data-audit...` (kiểm toán dữ liệu / Supabase — *sibling, có thể làm song song*): xác thực dữ liệu đã nạp vào Supabase có khớp data package v5 không.
> - `02-schema-and-architecture...` (schema SQL + kiến trúc web): định nghĩa bảng/VIEW, API, stack.
> - **`03` (tài liệu này):** logic nghiệp vụ DSS + màn hình. Tài liệu này **giả định** schema chuẩn mô tả trong Data_Dictionary (tên bảng canonical `dim_*`, `fact_*`, `v_*`). Nếu kiểm toán ở `01` phát hiện DB lệch schema, các truy vấn trong tài liệu này cần ánh xạ lại cột — xem mục [13. Rủi ro & khoảng trống](#13-rủi-ro--khoảng-trống-gaps).

---

## Mục lục

1. [Triết lý thiết kế DSS](#1-triết-lý-thiết-kế-dss)
2. [Ánh xạ sheet → bảng canonical](#2-ánh-xạ-sheet--bảng-canonical)
3. [Khối tính toán dùng chung (shared engine)](#3-khối-tính-toán-dùng-chung-shared-engine)
4. [Form hồ sơ học sinh (student profile input)](#4-form-hồ-sơ-học-sinh-student-profile-input)
5. [Q1 — Xếp nguyện vọng (NV ordering)](#5-q1--xếp-nguyện-vọng-nv-ordering)
6. [Q2 — Dự báo điểm chuẩn & độ tin cậy](#6-q2--dự-báo-điểm-chuẩn--độ-tin-cậy)
7. [Q3 — Cơ hội việc làm (employability)](#7-q3--cơ-hội-việc-làm-employability)
8. [Q4 — Chi phí & khả năng chi trả](#8-q4--chi-phí--khả-năng-chi-trả)
9. [Khuyến nghị tổng hợp (weighted recommendation)](#9-khuyến-nghị-tổng-hợp-weighted-recommendation)
10. [Case đặc biệt & cách app xử lý](#10-case-đặc-biệt--cách-app-xử-lý)
11. [Dùng HS mô phỏng làm demo profile](#11-dùng-hs-mô-phỏng-làm-demo-profile)
12. [Ma trận truy vết Dữ liệu/KPI → tính năng](#12-ma-trận-truy-vết-dữ-liệukpi--tính-năng)
13. [Rủi ro & khoảng trống (gaps)](#13-rủi-ro--khoảng-trống-gaps)

---

## 1. Triết lý thiết kế DSS

Mô hình 3 lớp, mọi màn hình đều đi theo cùng một mạch:

```
DỮ LIỆU THẬT (fact_*)  →  KPI (K01–K07)  →  KHUYẾN NGHỊ HÀNH ĐỘNG
  điểm chuẩn, chỉ tiêu,    các chỉ số đã      "Đặt ngành X ở NV2",
  học phí, việc làm,       chuẩn hoá quyết     "Thêm 1 NV an toàn",
  dự báo, nhu cầu          định                "Vượt ngân sách 18% → xét học bổng"
```

4 câu hỏi quyết định (decision questions) là xương sống của app:

| Mã | Câu hỏi quyết định | KPI chính | Màn hình |
|----|--------------------|-----------|----------|
| **Q1** | Xếp nguyện vọng thế nào để vừa có cơ hội vào ngành mơ ước, vừa chắc chắn đỗ? | K01, K02 | *Xếp nguyện vọng* |
| **Q2** | Dự báo điểm chuẩn đáng tin đến đâu? | K03 | *Độ tin cậy dự báo* |
| **Q3** | Học xong ngành này có dễ xin việc? | K04, K05 | *Cơ hội nghề nghiệp* |
| **Q4** | Gia đình có đủ sức lo chi phí học không? | K06, K07 | *Chi phí & tài chính* |
| **Σ** | Nên ưu tiên ngành nào nhất? | tổng hợp | *Khuyến nghị tổng hợp* |

**Nguyên tắc UX:** mỗi con số luôn đi kèm (a) *diễn giải* (decision_meaning từ KPI_Sheet), (b) *độ tin cậy* (confidence / scale_confirmed / is_imputed), (c) *hành động gợi ý*. Không để học sinh tự suy diễn từ bảng số.

---

## 2. Ánh xạ sheet → bảng canonical

Toàn bộ logic dưới đây tham chiếu **tên canonical** (như Data_Dictionary), không dùng tên sheet Excel.

| Sheet Excel | Bảng/VIEW canonical | Vai trò trong DSS |
|-------------|---------------------|-------------------|
| university | `dim_university` | 7 trường, `tier` / `tier_rank` (dùng xếp độ an toàn theo mặt bằng trường) |
| program | `dim_program` | 380 ngành: `holland_code`, `industry_group`, `duration_years`, `subject_combinations`, `program_type` |
| student | `dim_student` | hồ sơ HS mô phỏng (demo profile) |
| score | `fact_exam_score` | điểm thi + học bạ từng môn (chấm phương thức) |
| application | `fact_application` | 1 NV = 1 dòng (đã precompute margin/cost) |
| application_method | `fact_application_method` | 1 NV × 1 phương thức (độ bội phương thức) |
| cutoff_score | `fact_cutoff_score` | điểm chuẩn thật đa phương thức |
| quota | `fact_quota` | chỉ tiêu |
| tuition | `fact_tuition` | học phí (ALL = toàn trường hoặc theo ngành) |
| employment | `fact_employment` | tỷ lệ việc làm (K05) |
| labor_demand | `fact_labor_demand` | nhu cầu / thiếu hụt / tăng trưởng (K04) |
| cutoff_forecast | `fact_cutoff_forecast` | dự báo NAIVE & MA2 + actual + abs_error (K03) |
| main_dataset | `v_main_dataset` (VIEW) | bảng phẳng đã join sẵn — nguồn chính cho Q1/Q4 trên HS mô phỏng |
| student_outcome | `v_student_outcome` (VIEW) | kết quả cuối mỗi HS (K01) |
| — (không có sheet) | `v_coverage_real`, `v_coverage_sim` (VIEW) | kiểm tra độ phủ dữ liệu |

> **Thiếu bảng (ghi nhận gap, coi là tuỳ chọn / tương lai):** Source_Log tham chiếu `fact_salary` (S08 — lương khởi điểm) và `fact_macro_labor` (S10 — vĩ mô) nhưng **không có sheet dữ liệu**. ⇒ Q3 **không** hiển thị con số lương tuyệt đối; chỉ dùng K04/K05/thiếu hụt. Nếu sau này nạp `fact_salary`, thêm 1 widget "lương khởi điểm" vào màn hình Q3 (xem mục 13).

---

## 3. Khối tính toán dùng chung (shared engine)

Tất cả 4 câu hỏi dùng chung các hàm sau. Trên HS mô phỏng, phần lớn đã được **precompute** trong `v_main_dataset` / `fact_application_method` (đọc trực tiếp, nhanh). Với **hồ sơ mới do người dùng nhập** (ad-hoc, không có trong DB), app phải tính on-the-fly bằng chính các công thức này ⇒ phải cài đặt lại chúng ở tầng service.

### 3.1. Quy đổi điểm về thang 30 (`score_30`)

Dùng tham số từ KPI_Sheet (THAM SỐ / GIẢ ĐỊNH):

| Thang gốc | Công thức → thang 30 | Ghi chú |
|-----------|----------------------|---------|
| 30 | giữ nguyên | tổ hợp THPT / học bạ thường |
| 40 | `score_30 = score × 30/40` | vài CT NEU 2023–2024 (HTTTQL) |
| 100 (TSA) | `score_30 = 9.6 + 0.248 × TSA` | ước lượng từ cặp tương đương HUST 2026 |
| 150 (HSA) | `score_30 = 14.6 + 0.117 × HSA` | ước lượng từ cặp tương đương NEU 2026 |
| 1600 (SAT), 110, 1200 | *không có công thức chính thức* | so sánh trên thang gốc (raw vs cutoff), chỉ hiển thị "đủ/không đủ", KHÔNG vẽ margin_30 |

**Nguyên tắc so khớp đủ điểm:** xét đủ điểm **trên thang gốc của phương thức đó** (`final_score ≥ cutoff_score`), rồi quy `score_margin_30 = score_30(final) − score_30(cutoff)` **chỉ để hiển thị thống nhất & xếp REACH/MATCH/SAFETY**. Cột `score_margin_30` (nulls=0) trong `fact_application_method` đã làm sẵn cho HS mô phỏng; đánh dấu `converted_from ∈ {TSA,HSA}` khi là giá trị nhóm tự quy đổi (độ tin cậy thấp hơn → hiển thị icon ~).

> ⚠️ Dòng `scale_confirmed = FALSE` (SPT của ĐH Y, HSA/TSA quy đổi HaUI 2024) và phương thức `OTHER` (V-ACT, XTTN gộp, ĐGNL quy đổi NEU 2024) **không** dùng để tính đủ điểm/mô phỏng — chỉ hiển thị tham khảo và gắn nhãn "độ tin cậy thấp".

### 3.2. Điểm ưu tiên khu vực (`priority_bonus`)

`priority_bonus_base` theo khu vực (từ `dim_student`): **KV1 = 0.75 · KV2-NT = 0.5 · KV2 = 0.25 · KV3 = 0.0**.

Quy tắc giảm dần (Quy chế từ 2023, ngưỡng **22.5** trên thang 30):

```
if total_30 <= 22.5:   bonus = base
else:                  bonus = base × (30 − total_30) / (30 − 22.5)   # = base × (30−total)/7.5
# total_30 = tổng điểm xét (chưa cộng ưu tiên). bonus chặn >= 0.
```

*Kiểm chứng với dữ liệu:* HS2023001 raw 23.5, base 0.5 → `0.5 × (30−23.5)/7.5 = 0.433 ≈ 0.43` ✓ (khớp `fact_application_method`). Ưu tiên **chỉ áp dụng cho thang 30/40**; không áp cho TSA/HSA/SAT.

> **Thí sinh tự do** (`candidate_type = "Thí sinh tự do"`) đã tốt nghiệp **quá 1 năm** → `priority_bonus_base = 0` (mất ưu tiên KV), case_note ghi "hết thời hạn hưởng ưu tiên KV".

### 3.3. Cổng điều kiện tốt nghiệp (eligibility gate)

Mọi NV đi qua 2 cổng (precompute: `score_eligible`, `is_thpt_graduated`, `is_eligible`):

```
score_eligible   = ∃ phương thức có final_score >= cutoff_score (đủ điểm ít nhất 1 phương thức)
is_thpt_graduated= HS được công nhận tốt nghiệp THPT
is_eligible      = score_eligible AND is_thpt_graduated
is_admitted (của 1 HS) = NV đủ điều kiện có nv_order NHỎ NHẤT
```

⇒ **Một HS có thể "đủ điểm mà vẫn trượt tất cả"** nếu `is_thpt_graduated = FALSE` (xem [mục 10](#10-case-đặc-biệt--cách-app-xử-lý)). Đây là điểm DSS phải cảnh báo rõ, không được để học sinh hiểu nhầm "đủ điểm = đỗ".

### 3.4. Chấm một cặp (HS, ngành) → `best_method`, `best_margin_30`

Với mỗi ngành ứng viên và mỗi phương thức ngành đó công bố điểm chuẩn (`fact_cutoff_score` theo `program_id` + năm mục tiêu):

```
for method in methods_of(program, target_year):
    combo  = tổ hợp khả dụng của HS cho method (từ subject_combinations ∩ môn HS có)
    raw    = tính điểm HS theo method+combo (THPT: tổng 3 môn thi; HOC_BA/XTTH: học bạ;
             TSA/HSA/SPT/SAT: điểm bài thi tương ứng; KET_HOP_CCNN: quy đổi IELTS)
    final  = raw + priority_bonus(raw_30)          # chỉ thang 30/40
    margin30 = score_30(final) − score_30(cutoff_score_of_method)
best_margin_30 = max(margin30 across methods)
best_method    = argmax
n_methods_eligible = #methods có margin >= 0
```

- **IELTS → điểm NN (phương thức kết hợp CCNN):** quy đổi giả định của nhóm `5.0→8 · 5.5→8.5 · 6.0→9 · 6.5→9.5 · ≥7.0→10` (tuyến tính, cột `case_note` ghi rõ). IELTS **chỉ** dùng cho phương thức kết hợp/điều kiện; **không** thay môn Tiếng Anh trong tổ hợp THPT nếu HS `Miễn thi Ngoại ngữ`.
- Nếu HS **không có** bài thi mà phương thức yêu cầu (vd chưa thi TSA) → bỏ phương thức đó.

### 3.5. Holland match (`holland_match_pct`) — công thức chính xác

Cả `dim_student.holland_code` và `dim_program.holland_code` là mã RIASEC **3 ký tự** (vd `RIC`, `IRC`). Công thức (đã reverse-engineer & kiểm chứng khớp 100% với các dòng `v_main_dataset`):

```
Trọng số theo vị trí W = { vị trí 1: 3, vị trí 2: 2, vị trí 3: 1 }   (tổng 6)

holland_match_pct =
    ( Σ over L ∈ (letters_student ∩ letters_program)
        [ W(pos_của_L_trong_mã_HS) + W(pos_của_L_trong_mã_ngành) ] )
    / 12 × 100          # mẫu số 12 = 6 (HS) + 6 (ngành) khi trùng hoàn toàn
→ làm tròn 1 chữ số thập phân.
```

Tính chất (giải thích cho người dùng + là test oracle khi cài đặt):
- **Cùng tập 3 ký tự, mọi hoán vị → 100%** (vd HS `RIC` vs ngành `IRC` = 100%).
- Chung 2 ký tự → 58.3% … 83.3% tuỳ vị trí; chung 1 ký tự → 16.7% … 50%; không chung → 0%.
- Tập giá trị hợp lệ: `{0, 16.7, 25, 33.3, 41.7, 50, 58.3, 66.7, 75, 83.3, 100}` (8.3% và 91.7% **không** xuất hiện — dùng để viết unit test).

*Kiểm chứng:* HS `RIC` vs ngành `SIR`: chung {I,R}. I: W(HS pos2=2)+W(ngành pos2=2)=4; R: W(HS pos1=3)+W(ngành pos3=1)=4 → 8/12 = **66.7%** ✓. vs `IRS`: I:2+3, R:3+2 =10/12=**83.3%** ✓. vs `ISC`: I:2+3, C:1+1 =7/12=**58.3%** ✓.

> Trên HS mô phỏng đọc thẳng cột `holland_match_pct`. Với hồ sơ mới / khi HS kéo thả ngành bất kỳ, tính on-the-fly bằng công thức trên.
> **Lưu ý chất lượng:** mã Holland của 331 ngành mới là nhóm **gán tự động theo tên ngành** ⇒ hiển thị kèm ghi chú "gợi ý, cần rà soát" và cho phép coi fit là "mềm".

### 3.6. Dự báo điểm chuẩn + dải sai số (forecast engine) — nền của Q1 & Q2

Từ `fact_cutoff_forecast` (`method ∈ {NAIVE (năm trước), MA2 (TB 2 năm trước)}`, có `forecast_cutoff`, `actual_cutoff`, `abs_error`):

```
predicted_cutoff_30(program, target_year):
    ưu tiên MA2 → nếu thiếu dùng NAIVE → nếu thiếu dùng cutoff_score_30 năm gần nhất (fallback)

MAE_program = mean(abs_error của MA2, các năm đã có actual) cho program đó
MAE_global  = 1.35   # K03, thang 30, 2025–2026 (dữ liệu thật)
σ_cutoff    = 1.25 × max(MAE_program, MAE_sàn)   # MAE→std: std ≈ MAE / 0.8
             (MAE_sàn = 0.5 để không bao giờ coi dự báo là tuyệt đối chính xác)
```

`σ_cutoff` là độ lệch chuẩn dùng cho mô hình xác suất đỗ ở Q1 và cho "khoảng an toàn" ở Q2.

### 3.7. Chi phí & khả năng chi trả (K06, K07)

```
K06  est_total_cost =
     Σ_{k=0}^{duration_years-1} ( first_year_tuition × 1.1^k )           # học phí +10%/năm
   + ( 54_000_000 − living_support_vnd_year ) × duration_years          # sinh hoạt − hỗ trợ NĐ116

K07  affordability_index_pct = est_total_cost / ( family_budget_vnd_year × duration_years ) × 100
     > 100%  ⇒ vượt khả năng
```

*Kiểm chứng:* DCN_7480103 (HP năm 1 = 20tr, 4 năm, hỗ trợ 0): HP = 20×(1+1.1+1.21+1.331)=92.82tr; sinh hoạt = 54×4=216tr → **308.82tr** ✓; K07 = 308.82 / (65×4) = **118.8%** ✓.

- `first_year_tuition_vnd`: lấy từ `fact_tuition` theo `program_id` (nếu có dòng theo ngành) **hoặc** `program_id='ALL'` (toàn trường) theo `university_code`+năm; dùng `tuition_mid_vnd_year`. Nếu năm đó thiếu → nội suy ±10%/năm từ năm gần nhất (`tuition_is_imputed=TRUE` → gắn nhãn "ước tính").
- SV **Sư phạm** (NĐ 116/2020): `living_support_vnd_year = 36.3tr` và nhiều CT **miễn học phí** (`note` của dim_program: "Miễn học phí theo NĐ 116/2020") → `first_year_tuition = 0`. Đây là đòn bẩy affordability mạnh, Q4 phải nêu bật.

### 3.8. Việc làm & nhu cầu (K04, K05) — nền của Q3

```
K05  employment_rate = fact_employment.employment_rate_pct
     khớp theo program_id → nếu thiếu, fallback theo granularity "Lĩnh vực"/"Toàn trường"
     cùng university_code (vd HaUI theo lĩnh vực, VNUA toàn trường).

K04  demand_growth = fact_labor_demand: metric "Tăng số việc làm…"/"Tăng trưởng ngành…"
     theo industry_group (khóa nối). Nếu industry_group không có dòng tăng trưởng →
     dùng tín hiệu thiếu hụt (metric "Thiếu hụt nhân lực…", "Nhu cầu…") làm proxy dương.
```

`fact_employment` chỉ phủ **26 program_id** (37 dòng) → đa số 380 ngành **không có** tỷ lệ việc làm theo ngành ⇒ fallback theo lĩnh vực/toàn trường + **gắn nhãn rõ "số liệu theo lĩnh vực/toàn trường"**. `fact_labor_demand` chỉ có **15 industry_group** (trong 23) ⇒ ngành thuộc nhóm thiếu dữ liệu hiển thị "chưa đủ dữ liệu nhu cầu".

---

## 4. Form hồ sơ học sinh (student profile input)

Màn hình đầu tiên. Có 3 đường vào: **(a)** nhập tay, **(b)** chọn 1 HS mô phỏng làm demo (mục 11), **(c)** "chế độ nhanh" chỉ nhập điểm + sở thích.

### 4.1. Trường nhập & nguồn

| Nhóm | Trường (cột DB) | Kiểu / lựa chọn | Bắt buộc | Dùng cho |
|------|------------------|------------------|----------|----------|
| Định danh | `cohort_year` (năm xét tuyển mục tiêu) | 2023–2026 (mặc định 2026) | ✓ | chọn năm dự báo/điểm chuẩn |
| Loại thí sinh | `candidate_type` | Học sinh lớp 12 (đương niên) / Thí sinh tự do | ✓ | ưu tiên KV, XTTH |
| Ưu tiên | `priority_area` | KV1 / KV2-NT / KV2 / KV3 | ✓ | `priority_bonus` (3.2) |
| Môn/định hướng | `subject_track` | A (tự nhiên–kỹ thuật) / B (y–sinh) / C (xã hội) / D (kinh tế–ngôn ngữ) | ✓ | lọc tổ hợp mặc định |
| Điểm thi THPT | `score_math … score_english` (8 môn) | 0–10, để trống nếu không thi | ⚑ ít nhất 1 tổ hợp đủ | chấm phương thức THPT |
| Học bạ | `hb_math … hb_english` (8 môn) | 0–10 | — | HOC_BA / XTTH |
| Bài thi riêng | `tsa_score` (0–100), `hsa_score` (0–150), `spt_score`, `ielts_score` (0–9) | số, optional | — | phương thức phụ (K02) |
| Hướng nghiệp | `holland_code` | 3 ký tự RIASEC (có mini-quiz 6 trục nếu HS chưa biết) | ✓ | `holland_match_pct` (3.5) |
| Sở thích | `interest_industry` | 23 nhóm nghề (enum từ `dim_program.industry_group`) | ✓ | lọc/boost ngành |
| Tài chính | `family_budget_vnd_year` | VND/năm | ✓ (Q4) | K07 |
| Tình trạng thi | `exam_status` | 6 trạng thái (xem mục 10) | ✓ | cổng tốt nghiệp (3.3) |

⚑ = "mềm": nếu HS chưa thi (năm 2026 chưa diễn ra) → cho nhập **điểm dự kiến** (self-estimate) và đánh dấu `is_predicted=TRUE`; toàn bộ kết quả Q1 hiển thị "dựa trên điểm dự kiến".

### 4.2. Validate & suy luận tổ hợp

- Từ các môn HS có điểm → sinh **tập tổ hợp khả dụng** (A00, A01, B00, C00, D01, …) để đối chiếu `dim_program.subject_combinations`.
- `n_test_types` = số loại bài thi/chứng chỉ HS có (THPT + TSA/HSA/IELTS/SPT) → hiển thị "bạn đang có N cửa xét tuyển".
- Mini-quiz Holland: 6 câu cho 6 trục R-I-A-S-E-C → lấy 3 trục điểm cao nhất theo thứ tự thành mã.

### 4.3. Lưu hồ sơ

Hồ sơ mới ghi vào `dim_student` (+ `fact_exam_score`) với `student_id` sinh mới (prefix người dùng), `data_batch='user'`, hoặc giữ trong session nếu chỉ dùng thử. Không ghi đè HS mô phỏng.

---

## 5. Q1 — Xếp nguyện vọng (NV ordering)

> *"Xếp nguyện vọng thế nào để vừa có cơ hội vào ngành mơ ước, vừa chắc chắn đỗ?"* — KPI **K01** (tỷ lệ đỗ NV1–NV3 = 64.8% baseline), **K02** (lợi thế phương thức phụ = 37.7%).

### 5.1. Inputs

- Hồ sơ HS (mục 4): điểm theo từng phương thức (đã/dự kiến), `subject_track`, `holland_code`, `interest_industry`, `priority_area`, `cohort_year` (= năm mục tiêu).
- Tập ngành ứng viên: mặc định = các ngành **đang tuyển năm mục tiêu** (`dim_program.years_offered` chứa năm) mà HS **có ít nhất 1 tổ hợp khả dụng**; HS có thể lọc theo trường/nhóm nghề/khối ngành, hoặc tự thêm ngành "mơ ước".

### 5.2. Thuật toán

**Bước 1 — Chấm & tính margin** cho từng ngành ứng viên: dùng 3.4 → `best_margin_30`, `best_method`, `n_methods_eligible`; dùng 3.6 → `predicted_cutoff_30`, `σ_cutoff`.
Margin so với **điểm chuẩn DỰ BÁO năm mục tiêu** (không phải năm trước):

```
m = score_30(best final của HS) − predicted_cutoff_30(program, target_year)
```

**Bước 2 — Phân loại REACH / MATCH / SAFETY** (ngưỡng co giãn theo sai số dự báo của chính ngành đó):

```
B_safe  = 1.1 × MAE_eff           # MAE_eff = max(MAE_program, 1.35)
B_match = −0.4 × MAE_eff

SAFETY  nếu  m ≥ B_safe
MATCH   nếu  B_match ≤ m < B_safe
REACH   nếu  m < B_match
```

Với MAE mặc định 1.35 → **SAFETY ≥ +1.5 · MATCH −0.5..+1.5 · REACH < −0.5** (đúng các ngưỡng đề bài). Ngành có dự báo "nhiễu" (MAE lớn, vd ngành biến động mạnh) tự động cần biên rộng hơn ⇒ khó vào SAFETY hơn — đây chính là cách "điều chỉnh theo error band".

**Bước 3 — Xác suất đỗ kỳ vọng** (mô hình chuẩn hoá, coi điểm chuẩn thực tế ~ Normal quanh dự báo):

```
P_admit(program) = Φ( m / σ_cutoff )        # Φ = CDF chuẩn tắc
# nếu HS chưa thi & nhập điểm dự kiến: cộng thêm phương sai điểm HS σ_score (mặc định 0.75)
#   → P = Φ( m / sqrt(σ_cutoff² + σ_score²) )
```

Diễn giải badge: P≥0.85 "rất chắc", 0.6–0.85 "khá chắc", 0.35–0.6 "50/50", <0.35 "mạo hiểm".

**Bước 4 — Đề xuất danh sách NV đã xếp thứ tự** (cân bằng tham vọng ↔ an toàn). Heuristic "reach–match–safety ladder":

```
Chọn tối đa 8–10 NV, sắp theo nv_order tăng dần:
  • NV đầu (1–2): REACH — ngành mơ ước fit cao (ưu tiên holland_match & interest_industry),
                   kể cả P thấp (cho phép "với cao").
  • NV giữa (3–6): MATCH — P trong 0.4–0.85, fit tốt.
  • NV cuối (2–3): SAFETY — P ≥ 0.85, đảm bảo "chốt đỗ".
Ràng buộc: P(đỗ ít nhất 1 NV) = 1 − Π(1 − P_i) ≥ 0.95 (nếu chưa đạt → ép thêm 1 SAFETY).
Ràng buộc K01: ước P(đỗ trong NV1–NV3) và so với baseline 64.8%;
   nếu < 64.8% → cảnh báo "3 NV đầu đang quá mạo hiểm, cân nhắc đưa 1 ngành MATCH/SAFETY lên trên".
```

Vì ở VN **chỉ cần đỗ NV có thứ tự cao nhất đủ điều kiện** (xét 1 lần, ưu tiên nv_order nhỏ), thứ tự tối ưu là: xếp theo **mức độ mong muốn**, nhưng đảm bảo có SAFETY phía dưới để không trượt sạch. App minh hoạ bằng mô phỏng: "với danh sách này, mô hình ước bạn đỗ **NV k** (ngành …)".

**Bước 5 — Khai thác K02 (phương thức phụ):** với mỗi ngành, nếu `best_method ≠ THPT` hoặc tồn tại phương thức phụ cho margin tốt hơn THPT → hiển thị huy hiệu *"Dùng {TSA/HSA/HỌC_BẠ/CCNN} lợi hơn +X.X điểm"*. Tổng hợp cả danh sách: "Có {n} NV bạn nên nộp bằng phương thức phụ" (liên hệ K02 = 37.7% NV đỗ nhờ phương thức ≠ THPT).

### 5.3. Outputs / khuyến nghị

- **Bảng NV đề xuất**: nv_order · ngành · trường (`tier`) · best_method · margin_30 · P_admit · badge REACH/MATCH/SAFETY · holland_match_pct.
- **Thanh cân bằng danh mục**: #REACH / #MATCH / #SAFETY (gauge) + P(đỗ ≥1 NV) + P(đỗ NV1–3) so K01.
- **Nút hành động**: "Thêm NV an toàn", "Kéo ngành mơ ước lên NV1", "Đổi sang phương thức phụ".

### 5.4. Screen flow

```
[Form hồ sơ] → [Chọn ngành ứng viên / bộ lọc]
     → [Bảng NV đề xuất + badge + P_admit]   ──(kéo-thả đổi thứ tự)──┐
     → [Thanh cân bằng REACH/MATCH/SAFETY, cảnh báo K01]             │ real-time tính lại
     → [Chi tiết 1 NV: phương thức phụ (K02), dải dự báo (→Q2)]  ←───┘
     → [Nút: xem Chi phí (→Q4) · Việc làm (→Q3) · Khuyến nghị tổng hợp (→Σ)]
```

---

## 6. Q2 — Dự báo điểm chuẩn & độ tin cậy

> *"Dự báo điểm chuẩn đáng tin đến đâu?"* — KPI **K03** (MAE theo MA2 = 1.346 điểm, thang 30, 2025–2026).

### 6.1. Inputs

- 1 ngành (hoặc nhiều ngành để so sánh) + năm mục tiêu.
- `fact_cutoff_forecast` (NAIVE & MA2), `fact_cutoff_score` (actual các năm có), `target_year` (2025/2026 có actual; **2027 chưa có actual**).

### 6.2. Logic

**(a) Biểu đồ dự báo vs thực tế**: theo năm, 3 đường — `actual_cutoff` (điểm thật), `NAIVE`, `MA2`. Năm chưa có thật (2027) chỉ vẽ dự báo + dải.

**(b) MAE theo ngành (K03 cục bộ)**:
```
MAE_program(method) = mean( abs_error ) trên các target_year có actual, theo method
Hiển thị MAE_MA2 và MAE_NAIVE; chọn phương pháp MAE nhỏ hơn làm "dự báo khuyến dùng".
So với MAE_global = 1.35 → badge "ổn định hơn/kém hơn mặt bằng".
```
Nếu ngành có quá ít năm actual (≤1) → "chưa đủ dữ liệu, dùng MAE mặt bằng 1.35".

**(c) Dịch MAE → KHOẢNG AN TOÀN (buffer rule)** — đây là output hành động chính:

```
Buffer khuyến nghị (điểm cần cộng thêm vào điểm chuẩn dự báo khi chốt NV):

  buffer_safe   = ceil1( 1.5 × MAE_eff )   ≈ phủ ~1.2σ  (~88% một phía)  → "muốn chắc ăn"
  buffer_match  = ceil1( 1.0 × MAE_eff )   ≈ phủ ~0.8σ  (~79%)           → "cân bằng"
  MAE_eff = max(MAE_program_MA2, 1.35)
  ceil1 = làm tròn lên 0.1.

Thông điệp: "Điểm chuẩn {ngành} {năm} dự báo ~{p} (± {MAE_eff}). Để tương đối chắc chắn,
             hãy coi điểm chuẩn hiệu dụng = {p + buffer_safe} khi xếp NV."
```

Buffer này **feed thẳng** vào ngưỡng REACH/MATCH/SAFETY ở Q1 (B_safe = 1.1×MAE_eff cùng gốc) ⇒ Q1 và Q2 nhất quán: ngành MAE lớn → buffer lớn → khó vào SAFETY.

### 6.3. Outputs

- Line chart NAIVE/MA2/actual + vùng ±MAE (confidence band).
- Thẻ "Độ tin cậy": MAE_MA2, MAE_NAIVE, phương pháp khuyến dùng, buffer_safe/buffer_match.
- Chú thích chất lượng: nếu điểm chuẩn các năm dựa trên `confidence = Thấp` / `scale_confirmed=FALSE` → cảnh báo "dự báo dựa trên dữ liệu độ tin cậy thấp".

### 6.4. Screen flow

```
[Chọn ngành] → [Chart dự báo vs thực tế + dải ±MAE]
     → [Thẻ MAE & phương pháp khuyến dùng]
     → [Khối "Khoảng an toàn nên cộng" = buffer]  →  [Nút: Áp dụng buffer vào Q1]
```

---

## 7. Q3 — Cơ hội việc làm (employability)

> *"Học xong ngành này có dễ xin việc?"* — KPI **K05** (tỷ lệ việc làm sau 1 năm, TB 94.5%), **K04** (tăng trưởng nhu cầu nhóm nghề).

### 7.1. Inputs

- 1 ngành / 1 nhóm nghề (`industry_group`).
- `fact_employment` (K05 theo program_id / lĩnh vực / toàn trường), `fact_labor_demand` (K04 + thiếu hụt theo `industry_group`).

### 7.2. Thuật toán chấm điểm employability (0–100) + badge

```
e = employment_rate_pct  (K05; fallback lĩnh vực/toàn trường nếu thiếu theo ngành)
g = demand_growth_pct    (K04; nếu thiếu, dùng tín hiệu thiếu hụt làm proxy: shortage>0 ⇒ g_proxy=+ )
s = shortage_signal      (có dòng "Thiếu hụt nhân lực…" / "Nhu cầu … 2021–2030" cho industry_group ⇒ TRUE)

# Thành phần (mỗi phần 0..1):
emp_component    = clamp( (e − 80) / (100 − 80), 0, 1 )      # 80%→0, 100%→1
growth_component = clamp( (g + 5) / 15 , 0, 1 )             # −5%→0, +10%→1
shortage_bonus   = 0.15 nếu s else 0

employability_score = round( 100 × ( 0.55×emp_component + 0.35×growth_component + shortage_bonus ) )
# chặn [0,100].
```

**Badge (ngưỡng theo decision_meaning của K04/K05):**

| Điều kiện | Badge | Màu |
|-----------|-------|-----|
| `g > 0` **AND** `e ≥ 90%` | **Khuyến nghị** (đầu ra ổn + nhu cầu tăng) | xanh |
| `e ≥ 90%` nhưng `g ≤ 0` | **Ổn định** (việc làm tốt, nhu cầu chững) | lục nhạt |
| `e < 90%` **AND** `g > 0` | **Theo dõi** (nhu cầu tăng nhưng tỷ lệ việc làm chưa cao) | vàng |
| `e < 90%` **AND** `g < 0` | **Cảnh báo bão hoà** | đỏ |
| thiếu K04 **và** K05 theo ngành | **Chưa đủ dữ liệu** (chỉ hiển thị fallback) | xám |

> Lưu ý nhãn trung thực: K04 ví dụ CNTT 2025→2026 = −0.29% là do **hai chỉ số TopCV đo khác cách** — khi growth âm vì lý do đo lường, hiển thị cả **thiếu hụt tuyệt đối** (vd CNTT thiếu ~175.000 người/năm) để không gây hiểu lầm "CNTT bão hoà".

### 7.3. Outputs

- Thẻ ngành: employability_score + badge + 2 số gốc (K05 %, K04 %) + câu thiếu hụt (nếu có).
- So sánh ngang các ngành trong danh sách NV của HS (bar chart) → gắn vào trọng số Σ (mục 9).
- Dòng nguồn + năm khảo sát + `granularity` (Ngành/Lĩnh vực/Toàn trường) để minh bạch.

### 7.4. Screen flow

```
[Chọn ngành/nhóm nghề] → [Thẻ employability (score+badge)]
     → [2 KPI gốc K05/K04 + thiếu hụt + nguồn]
     → [Bar so sánh các NV đang chọn]  → [đẩy vào Khuyến nghị tổng hợp]
```

---

## 8. Q4 — Chi phí & khả năng chi trả

> *"Gia đình có đủ sức lo chi phí học không?"* — KPI **K06** (tổng chi phí toàn khóa, TB ~318tr), **K07** (chỉ số áp lực tài chính; 33% HS trúng tuyển vượt ngân sách).

### 8.1. Inputs

- Hồ sơ HS: `family_budget_vnd_year`.
- Ngành: `duration_years`, học phí từ `fact_tuition`, `living_support_vnd_year` (NĐ116).

### 8.2. Logic

Dùng 3.7: `est_total_cost` (K06) và `affordability_index_pct` (K07). Hiển thị **bóc tách**:

```
Toàn khóa = Σ học phí (có đánh dấu năm nào là ước tính ±10%)
          + sinh hoạt 54tr/năm × số năm
          − hỗ trợ NĐ116 (nếu Sư phạm)
K07 = toàn khóa / (ngân sách/năm × số năm)
```

**Phân loại áp lực:** `≤80%` *thoải mái* · `80–100%` *vừa sức* · `100–130%` *căng* · `>130%` *vượt khả năng*.

**Khi K07 > 100% → gợi ý giảm tải (mitigations), xếp theo mức tác động:**

1. **Học bổng** — nếu `scholarship_eligibility_score` cao (precompute cho NV trúng tuyển; với hồ sơ mới ước proxy từ `best_margin_30` dương lớn + GPA). Ước mức giảm nếu đạt học bổng toàn phần/bán phần.
2. **Ngành thay thế học phí thấp hơn, cùng `industry_group`/`khoi_nganh`**: truy vấn các ngành gần nhu cầu/sở thích nhưng `tuition_mid` thấp hơn (đặc biệt **CT Sư phạm miễn học phí + hỗ trợ NĐ116** nếu `subject_track` phù hợp — có thể đưa K07 xuống rất mạnh, kể cả <0 chi phí ròng học phí).
3. **Trường mặt bằng thấp hơn** (`tier_rank` lớn hơn) cùng ngành → học phí thường thấp hơn.
4. **Tín dụng sinh viên** (vay ưu đãi) — nêu như phương án cuối, kèm lưu ý nghĩa vụ trả nợ.

### 8.3. Outputs

- Thẻ chi phí: tổng toàn khóa, bình quân/năm, K07 % + thanh gauge (ngưỡng 100%/130%).
- Waterfall: học phí từng năm (tăng dần) + sinh hoạt − hỗ trợ.
- Danh sách mitigation (nếu vượt) với ước tính K07 sau khi áp dụng.

### 8.4. Screen flow

```
[Hồ sơ + ngành] → [Thẻ K06/K07 + gauge]
     → [Waterfall bóc tách chi phí]
     → nếu K07>100%: [Khối "Cách giảm tải" (học bổng / ngành rẻ hơn / trường khác / tín dụng)]
     → [So sánh affordability các NV đang chọn]  → [đẩy vào Khuyến nghị tổng hợp]
```

---

## 9. Khuyến nghị tổng hợp (weighted recommendation)

Màn hình "**Khuyến nghị tổng hợp**": xếp hạng các ngành ứng viên của HS bằng **điểm tổng có trọng số** trên 4 trục, trọng số **người dùng chỉnh được**.

### 9.1. Chuẩn hoá 4 trục về [0,1]

```
fit   = holland_match_pct / 100
        (+ boost 0.1 nếu industry_group ngành == interest_industry, chặn ≤ 1)
prob  = P_admit (Q1, mục 5.3)                       # đã ∈ [0,1]
job   = employability_score / 100 (Q3)              # ngành thiếu dữ liệu → 0.5 (trung tính) + cờ xám
cost  = clamp( (150 − affordability_index_pct) / (150 − 50), 0, 1 )
        # K07 50%→1.0 (rất dễ lo) ; 150%→0.0 (quá sức)
```

### 9.2. Điểm tổng & trọng số

```
score_total = w_fit·fit + w_prob·prob + w_job·job + w_cost·cost      ( Σw = 1 )

Mặc định (preset "Cân bằng"):  w_fit=0.25 · w_prob=0.30 · w_job=0.25 · w_cost=0.20
Preset "Chắc đỗ":              w_prob=0.45 · w_cost=0.25 · w_fit=0.15 · w_job=0.15
Preset "Đam mê":               w_fit=0.45 · w_job=0.25 · w_prob=0.20 · w_cost=0.10
Preset "Thực dụng việc làm":   w_job=0.40 · w_prob=0.25 · w_cost=0.25 · w_fit=0.10
```

4 slider (tự chuẩn hoá lại tổng = 1). Thay đổi slider → **xếp hạng tính lại ngay** (client-side).

### 9.3. Outputs

- **Bảng xếp hạng ngành**: score_total + 4 thanh con (fit/prob/job/cost) để thấy "được điểm nhờ đâu".
- **Top-3 "nên cân nhắc nhất"** kèm 1 câu lý do tự sinh: vd *"Fit 100%, khá chắc đỗ (P=0.78), việc làm tốt (94%), vừa ngân sách (K07=88%)."*
- Nút "Dùng thứ hạng này để xếp NV" → đẩy ngược về Q1 làm gợi ý nv_order.
- Cảnh báo khi một trục bị thiếu dữ liệu (job=0.5 trung tính) → "xếp hạng có thể đổi khi bổ sung dữ liệu việc làm".

### 9.4. Screen flow

```
[Danh sách ngành của HS] → [4 slider trọng số + preset]
     → [Bảng xếp hạng score_total + 4 thanh con]  (realtime)
     → [Top-3 + lý do]  → [Áp vào Q1 NV ordering]
```

---

## 10. Case đặc biệt & cách app xử lý

Nguồn: README mục 6 + Case_Summary + `dim_student.special_case` / `exam_status` / `not_admitted_reason`. **Bắt buộc preserve nhãn verbatim.**

| special_case | exam_status | Quy tắc nghiệp vụ | Cách app xử lý (UI + logic) |
|--------------|-------------|-------------------|------------------------------|
| `NORMAL` | Dự thi đầy đủ | HS đương niên bình thường | luồng chuẩn Q1–Q4 |
| `TU_DO` | Dự thi đầy đủ – Thí sinh tự do | thi lại 3 môn 1 tổ hợp; **không XTTH**; TN quá 1 năm → **mất ưu tiên KV** | ẩn phương thức XTTH; set `priority_bonus_base=0` nếu quá hạn; banner "Thí sinh tự do: không xét tuyển thẳng học bạ ưu tiên, kiểm tra điểm ưu tiên KV" |
| `BO_THI_TOAN_BO` | Bỏ thi toàn bộ | không điểm thi → **không TN** → `is_thpt_graduated=FALSE` | Q1 vẫn **chấm điểm** NV (`score_eligible` có thể TRUE) nhưng mọi NV `is_eligible=FALSE`; banner đỏ "Không đủ điều kiện công nhận tốt nghiệp → không thể trúng tuyển dù đủ điểm"; `not_admitted_reason`="Không tốt nghiệp THPT (bỏ thi toàn bộ)" |
| `BO_THI_1_MON` | Bỏ thi 1 bài thi | vắng 1 bài → không TN | như trên; nêu rõ môn vắng (từ `absent_subjects`); reason="…(bỏ thi 1 bài thi)" |
| `DIEM_LIET` | Có điểm liệt (≤ 1,0) | 1 môn ≤1.0 → không TN | như trên; nêu môn liệt (`failing_subjects`); reason="…(có điểm liệt (≤ 1,0))" |
| `MIEN_THI_NN` | Miễn thi Ngoại ngữ (chứng chỉ) | điểm NN trống; **không dùng tổ hợp có Tiếng Anh ở phương thức THPT**; CCNN dùng IELTS quy đổi (NN tính 10 khi xét TN) | loại tổ hợp D (có Anh) khỏi phương thức THPT; cho phép phương thức KET_HOP_CCNN dùng IELTS (3.4); badge "Miễn thi NN: dùng chứng chỉ ở phương thức kết hợp" |
| `MIEN_THI_TOAN_BO` | Miễn thi toàn bộ – tuyển thẳng | đội tuyển QG/giải quốc tế: được công nhận TN; **NV1 tuyển thẳng** bằng `TUYEN_THANG` (dòng **không có** `cutoff_id`) | Q1 đặt sẵn NV1 = ngành tuyển thẳng, badge "Trúng tuyển thẳng NV1 (TUYEN_THANG)"; P_admit=100%; các NV sau chỉ để tham khảo; không cần tính margin cho NV tuyển thẳng |

**Quy tắc chung UI:** khi `is_thpt_graduated=FALSE`, toàn bộ màn hình Q1 chuyển "chế độ cảnh báo": vẫn hiện margin để HS học hỏi, nhưng kết luận luôn là *"Chưa đủ điều kiện tốt nghiệp — ưu tiên xử lý điều kiện TN trước khi bàn xếp NV"*. Q4 vẫn tính được (chi phí giả định nếu đỗ) nhưng kèm lưu ý.

**Lưu ý KPI (README mục 6):** K01 tính trên **toàn bộ 500 HS** (gồm HS bỏ thi) nên thấp hơn; K02/K06/K07 chỉ tính trên NV **đủ điều kiện/trúng tuyển**. App phải nêu scope này khi hiển thị baseline để so sánh công bằng.

---

## 11. Dùng HS mô phỏng làm demo profile

- 500 HS mô phỏng (`dim_student`, `data_batch ∈ {v2 (200 HS gốc), v4 (bổ sung 300 HS)}`) dùng làm **hồ sơ mẫu** để demo nhanh mọi luồng mà không cần nhập tay.
- **Picker demo** lọc theo: `cohort_year`, `special_case` (để trình diễn từng case ở mục 10), `subject_track`, dải `family_budget`, có/không `tsa_score`/`hsa_score`/`ielts_score`.
- Chọn 1 HS → app nạp hồ sơ + điểm (`fact_exam_score`) + có thể hiển thị **kết quả thực tế mô phỏng** từ `v_student_outcome` (`admitted_program_id`, `admitted_nv_order`, `admitted_by_method`, `admission_status`) để đối chiếu "DSS khuyên gì vs HS này thực tế đỗ gì" → tăng tính thuyết phục.
- Bộ demo gợi ý sẵn (mỗi case 1 HS tiêu biểu): 1 NORMAL đỗ nhờ phương thức phụ (vd HS2023001 đỗ `BKA_BF1` bằng `TSA` ở NV5), 1 `MIEN_THI_TOAN_BO` (tuyển thẳng), 1 `DIEM_LIET` (đủ điểm nhưng trượt vì không TN), 1 `MIEN_THI_NN`, 1 `TU_DO`.
- **Không** cho sửa trực tiếp HS mô phỏng; "Chỉnh để thử" sẽ **clone** sang hồ sơ người dùng.

---

## 12. Ma trận truy vết Dữ liệu/KPI → tính năng

| Màn hình | KPI | Bảng/VIEW đọc | Hàm shared engine |
|----------|-----|----------------|-------------------|
| Form hồ sơ | — | `dim_student`, `fact_exam_score`, `dim_program` (enum) | 3.1, 3.5 (mini-quiz) |
| Q1 Xếp NV | K01, K02 | `v_main_dataset`, `fact_application_method`, `fact_cutoff_score`, `fact_cutoff_forecast`, `dim_program`, `dim_university` | 3.1–3.6 |
| Q2 Dự báo | K03 | `fact_cutoff_forecast`, `fact_cutoff_score` | 3.6 |
| Q3 Việc làm | K04, K05 | `fact_employment`, `fact_labor_demand`, `dim_program` | 3.8 |
| Q4 Chi phí | K06, K07 | `fact_tuition`, `dim_program`, `dim_student`, `v_main_dataset` | 3.7 |
| Σ Tổng hợp | tất cả | như trên | 3.5–3.8 + 9 |
| Case đặc biệt | K01 scope | `dim_student`, `fact_application`, `v_student_outcome` | 3.3 |
| Demo profile | — | `dim_student`, `v_student_outcome` | — |

---

## 13. Rủi ro & khoảng trống (gaps)

1. **DB Supabase chưa chắc khớp schema** (mối lo trực tiếp của người dùng): tài liệu này giả định tên/cột canonical của Data_Dictionary. **Trước khi code**, chạy kiểm toán ở `01` (so số dòng: `dim_program`=380, `fact_application`=3096, `fact_application_method`=4587, `fact_cutoff_score`=2939, `fact_cutoff_forecast`=1826, `dim_student`=500, …; và kiểm tra VIEW `v_main_dataset`/`v_student_outcome` đã tạo chưa). Nếu DB khác → chỉ cần sửa lớp mapping, logic DSS giữ nguyên.
2. **`fact_salary` (S08) & `fact_macro_labor` (S10) không có sheet** → Q3 không có lương tuyệt đối & bối cảnh vĩ mô. Thiết kế Q3 đã tránh phụ thuộc 2 bảng này; để ngỏ widget khi bổ sung.
3. **Độ phủ việc làm mỏng**: `fact_employment` chỉ 26/380 ngành; `fact_labor_demand` chỉ 15/23 nhóm nghề → nhiều ngành phải fallback + nhãn "theo lĩnh vực/toàn trường/chưa đủ dữ liệu". Badge "Chưa đủ dữ liệu" phải thật hiển thị, không ngụy tạo.
4. **Điểm chuẩn thang ngoài 30/40** (TSA/HSA/SAT/110/1200): quy đổi là **giả định tuyến tính của nhóm** → margin_30 chỉ gần đúng; gắn icon ~ và tránh so sánh cứng. Dòng `scale_confirmed=FALSE` & phương thức `OTHER` không dùng để tính đủ điểm.
5. **Mã Holland của 331 ngành là gán tự động** → `holland_match_pct` chỉ nên là 1 trục "mềm" trong Σ, không phải yếu tố loại trừ; cho người dùng chỉnh trọng số xuống.
6. **Dự báo 2027 chưa có actual** → chỉ hiển thị dự báo + dải MAE lịch sử; không khẳng định độ chính xác.
7. **Ô thiếu điểm chuẩn chính** (19 ô, vd BKA_MS5 2024/2025, nhiều CT tiếng Anh HaUI 2026, TLA_TLA205 2023): các ngành/năm này ở Q1 dùng fallback dự báo hoặc đánh dấu "Chưa có điểm chuẩn năm này trong dữ liệu thật" (đúng như `not_admitted_reason`).
8. **`scholarship_eligibility_score` chỉ có cho NV trúng tuyển** (proxy) → với hồ sơ mới phải ước lại; nêu rõ là ước lượng.
9. **Chỉ tiêu (`fact_quota`) chưa dùng trong xác suất đỗ**: mô hình P_admit hiện dựa vào margin+dải dự báo, chưa mô hình hoá cạnh tranh theo tỉ lệ chỉ tiêu/số hồ sơ. Hướng nâng cấp: hiệu chỉnh P theo xu hướng chỉ tiêu (tăng chỉ tiêu → nới điểm chuẩn). Ghi nhận là cải tiến tương lai.

---

*Hết tài liệu 03. Các công thức (3.2 priority, 3.5 Holland, 3.6 forecast band, 3.7 K06/K07) đều đã kiểm chứng khớp dữ liệu v5 và có thể cài đặt trực tiếp ở tầng service + viết unit test theo các giá trị oracle nêu trong từng mục.*
