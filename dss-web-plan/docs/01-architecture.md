# 01 — Kiến trúc Web App: DSS Tư vấn Tuyển sinh & Hướng nghiệp

> **Dự án:** DSS Tư vấn Tuyển sinh & Hướng nghiệp — Nhóm 5, Assignment.
> **Phạm vi dữ liệu:** 7 trường ĐH tại Hà Nội, 380 ngành/chương trình, 500 học sinh mô phỏng, năm tuyển sinh 2023–2026.
> **Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS · shadcn/ui · Recharts · Supabase (Postgres + `@supabase/ssr`) · Vercel.
> **Nguyên tắc:** tất cả nhãn tiếng Việt giữ nguyên văn (verbatim). Đây là bản thiết kế để một nhóm sinh viên build được, không phải tài liệu lý thuyết.

---

## 0. Tóm tắt & bối cảnh dữ liệu

### 0.1. 4 câu hỏi quyết định (Decision Questions) và KPI

| Câu hỏi | Nội dung | KPI liên quan |
|---|---|---|
| **Q1 — Xếp nguyện vọng** | Xếp NV thế nào để vừa có cơ hội vào ngành mơ ước, vừa chắc chắn đỗ? | K01, K02 |
| **Q2 — Dự báo điểm chuẩn** | Dự báo điểm chuẩn đáng tin đến đâu? | K03 |
| **Q3 — Cơ hội việc làm** | Học xong ngành này có dễ xin việc? | K04, K05 |
| **Q4 — Chi phí & khả năng chi trả** | Gia đình có đủ sức lo chi phí học không? | K06, K07 |

| KPI | Tên | Đơn vị | Bảng/VIEW nguồn | Giá trị mẫu |
|---|---|---|---|---|
| **K01** | Tỷ lệ đỗ nhóm nguyện vọng mục tiêu (NV1–NV3) | % | `v_student_outcome`, `fact_application`, `fact_application_method` | 0.648 (64,8%) |
| **K02** | Lợi thế từ phương thức xét tuyển phụ | % | `fact_application_method`, `v_main_dataset` | 0.3768 (37,7%) |
| **K03** | Biên độ sai số dự báo điểm chuẩn (MAE, MA2) | điểm | `fact_cutoff_forecast`, `fact_cutoff_score` | 1.3458 |
| **K04** | Tốc độ tăng trưởng nhu cầu ngành | % | `fact_labor_demand` | -0.2918 |
| **K05** | Tỷ lệ sinh viên có việc làm sau 1 năm | % | `fact_employment` | 0.9448 (94,5%) |
| **K06** | Tổng chi phí ước tính toàn khóa | VND | `fact_tuition`, `dim_program`, `v_main_dataset` | 317.910.595 |
| **K07** | Chỉ số áp lực tài chính gia đình | % | `v_main_dataset`, `dim_student` | 0.3326 (33,3% HS vượt ngân sách) |

> Lưu ý về đơn vị: nhiều KPI tỷ lệ được lưu dưới dạng **phân số** (0.648 = 64,8%). Web app phải nhân 100 khi hiển thị, hoặc chuẩn hoá ngay trong VIEW/RPC (xem §4.4). K03 là **điểm** (thang 30), K06 là **VND**.

### 0.2. Danh mục 7 trường (giữ nguyên nhãn tiếng Việt)

| `university_code` | `short_name` | `university_name` | `tier` | `tier_rank` | Số ngành |
|---|---|---|---|---|---|
| BKA | HUST | Đại học Bách khoa Hà Nội | Top 1 | 1 | 71 |
| KHA | NEU | Đại học Kinh tế Quốc dân | Top 1 | 2 | 88 |
| YHB | HMU | Trường Đại học Y Hà Nội | Top 1 | 3 | 20 |
| SPH | HNUE | Trường Đại học Sư phạm Hà Nội | Nhóm khá | 4 | 57 |
| DCN | HaUI | Trường Đại học Công nghiệp Hà Nội | Nhóm trung bình | 5 | 72 |
| TLA | TLU | Trường Đại học Thủy lợi | Nhóm trung bình – thấp | 6 | 48 |
| HVN | VNUA | Học viện Nông nghiệp Việt Nam | Nhóm thấp | 7 | 24 |

### 0.3. Mô hình sao (tên bảng chuẩn — canonical)

```
                         dim_university (7)
                               │ 1
                               │
                               ▼ N
                         dim_program (380) ──────────────┐
                               │ 1                        │ 1
          ┌──────────┬─────────┼──────────┬──────────────┤
          ▼ N        ▼ N       ▼ N        ▼ N             ▼ N
 fact_cutoff_score  fact_quota fact_tuition fact_employment fact_cutoff_forecast
     (2939)          (1366)     (63)*        (37)            (1826)
          ▲ N
          │  cutoff_id  (NULL khi TUYEN_THANG)
          │ 1
 fact_application_method (4587)
          ▲ N
          │ 1
    fact_application (3096) ──N──1── dim_student (500) ──1──N── fact_exam_score (500)
                                           │
   * fact_tuition: khóa theo university_code + năm (program_id='ALL' = toàn trường) HOẶC theo program_id.
     fact_labor_demand (22): KHÔNG nối program, khóa theo industry_group.

 VIEW dẫn xuất (không lưu dữ liệu riêng):
   v_main_dataset (3096)   = application ⋈ student ⋈ program ⋈ chi phí/affordability  → Q1,Q4,Explorer
   v_student_outcome (500) = 1 dòng / học sinh, kết quả trúng tuyển                    → Q1, Tổng quan
   v_coverage_real (1520)  = độ phủ dữ liệu thật theo ngành×năm                         → trang Chất lượng dữ liệu
   v_coverage_sim (1520)   = độ phủ dữ liệu mô phỏng                                    → trang Chất lượng dữ liệu
```

Ánh xạ **tên sheet Excel → tên bảng chuẩn** (Postgres dùng tên chuẩn):

```
university→dim_university   program→dim_program        student→dim_student
score→fact_exam_score       application→fact_application
application_method→fact_application_method             cutoff_score→fact_cutoff_score
quota→fact_quota            tuition→fact_tuition        employment→fact_employment
labor_demand→fact_labor_demand    cutoff_forecast→fact_cutoff_forecast
main_dataset→v_main_dataset (VIEW)    student_outcome→v_student_outcome (VIEW)
```

> **Khoảng trống dữ liệu (ghi nhận):** `fact_salary` (S08) và `fact_macro_labor` (S10) được tham chiếu trong Source_Log nhưng **không có sheet** → coi là **tùy chọn/tương lai**. Màn hình Q3 phải chạy được mà không có 2 bảng này (lương chỉ hiển thị khi bảng tồn tại). Xem §10.

---

## 1. Kiến trúc tổng thể

### 1.1. Sơ đồ (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TRÌNH DUYỆT (Client)                                                      │
│  • React Client Components: filter, chart (Recharts), bảng tương tác       │
│  • Chỉ nhận JSON/HTML đã render — KHÔNG giữ service_role key               │
│  • Dùng NEXT_PUBLIC_SUPABASE_ANON_KEY nếu cần realtime/insert phía client  │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ HTTPS (RSC payload / fetch tới Route Handlers)
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS (App Router) — chạy trên Vercel                                   │
│                                                                            │
│  ┌─────────────────────────┐        ┌────────────────────────────────┐    │
│  │ Server Components (RSC)  │        │ Route Handlers  app/api/**      │    │
│  │ • Đọc dữ liệu mặc định   │        │ • Chỉ dùng cho: export CSV,     │    │
│  │ • Gọi Supabase server    │        │   RPC tính toán Q1, tìm kiếm    │    │
│  │   client (cookie-based)  │        │   phân trang JSON cho client    │    │
│  │ • Trả HTML + data đã fetch│       │ • Có thể dùng service_role      │    │
│  └────────────┬────────────┘        └───────────────┬────────────────┘    │
│               │                                     │                       │
│               └──────────────┬──────────────────────┘                       │
│                              ▼                                              │
│            lib/supabase/server.ts  +  @supabase/ssr                        │
│            (tạo client đọc cookie, cache/revalidate)                        │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ Postgres wire (SSL) / PostgREST
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                                  │
│  • Postgres: 12 bảng (dim_* , fact_*) + 4 VIEW (v_*)                        │
│  • RPC (SQL functions): kpi_overview(), q1_recommend(), q2_forecast(), …    │
│  • RLS bật, policy "public read" (SELECT) cho app v1 (xem §6)              │
│  • service_role key: CHỈ dùng phía server, bỏ qua RLS khi cần              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.2. Khi nào dùng `anon` vs `service_role`

| Loại key | Nơi chạy | Dùng cho | Tuyệt đối KHÔNG |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client **và** Server | Mọi truy vấn đọc công khai (SELECT qua RLS policy "public read"). Đây là key mặc định của gần như toàn bộ app. | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **Chỉ** Server (RSC, Route Handler, Server Action) | Chạy RPC nặng, bỏ qua RLS khi cần seed/ghi dữ liệu, tác vụ admin. | Không bao giờ import vào Client Component, không prefix `NEXT_PUBLIC_`, không log ra response. |

> Với DSS học thuật chỉ-đọc, **anon key + RLS "public SELECT" là đủ 95% nhu cầu**. `service_role` chỉ cần khi chạy script seed/migrate hoặc nếu sau này thêm ghi dữ liệu. Nguyên tắc: nếu truy vấn chỉ SELECT dữ liệu công khai → dùng anon (kể cả ở server).

### 1.3. Mô hình render

- **Mặc định: React Server Components** đọc dữ liệu trực tiếp trong `page.tsx` (async component) → không cần tự viết API cho phần lớn màn hình.
- **Route Handlers (`app/api/**`)** chỉ dành cho: (a) export CSV/JSON, (b) endpoint RPC cho Q1 cần nhận input động từ client, (c) phân trang/tìm kiếm cho bảng Explorer gọi từ Client Component.
- **Server Actions** dùng cho form "chọn hồ sơ học sinh" (Q1/Q4) nếu muốn — hoặc đơn giản hơn là query param.

---

## 2. Cấu trúc thư mục dự án

```
dss-web-plan/                      # (repo gốc; app code đặt tại root hoặc apps/web)
├─ docs/
│  └─ 01-architecture.md           # ← tài liệu này
├─ app/
│  ├─ layout.tsx                   # layout gốc: <Sidebar> + <ThemeProvider> + font
│  ├─ globals.css                  # Tailwind + CSS vars palette (sáng/tối, §5.1)
│  ├─ page.tsx                     # "/"  Tổng quan (KPI K01–K07)
│  ├─ q1-nguyen-vong/
│  │  └─ page.tsx                  # Q1 Xếp nguyện vọng
│  ├─ q2-diem-chuan/
│  │  ├─ page.tsx                  # Q2 Dự báo điểm chuẩn (danh sách/filter)
│  │  └─ [programId]/page.tsx      # Q2 chi tiết 1 ngành (trend + error band)
│  ├─ q3-viec-lam/
│  │  └─ page.tsx                  # Q3 Cơ hội việc làm
│  ├─ q4-chi-phi/
│  │  └─ page.tsx                  # Q4 Chi phí & khả năng chi trả
│  ├─ explorer/
│  │  ├─ page.tsx                  # Bảng tra cứu toàn bộ ngành
│  │  └─ [programId]/page.tsx      # Trang chi tiết 1 chương trình
│  ├─ chat-luong-du-lieu/
│  │  └─ page.tsx                  # Độ phủ dữ liệu (v_coverage_*) — xử lý nỗi lo "DB có ok không"
│  └─ api/
│     ├─ programs/route.ts         # GET: tìm kiếm + phân trang danh mục ngành
│     ├─ q1/recommend/route.ts     # POST: gọi RPC q1_recommend(student_id|profile)
│     └─ export/route.ts           # GET: xuất CSV theo filter hiện tại
├─ components/
│  ├─ ui/                          # shadcn/ui (button, card, table, select, …)
│  ├─ charts/                      # ForecastChart, DemandGrowthChart, … (§7)
│  ├─ kpi/                         # KpiCard, KpiRow
│  ├─ filters/                     # FilterBar, CohortSelect, UniversitySelect, KhoiNganhSelect
│  ├─ student/                     # StudentPickerDialog ("chọn hồ sơ học sinh")
│  └─ layout/                      # Sidebar, PageHeader, EmptyState, DataQualityBadge
├─ lib/
│  ├─ supabase/
│  │  ├─ client.ts                 # createBrowserClient (anon)  — "use client"
│  │  ├─ server.ts                 # createServerClient (anon, cookie)  — server only
│  │  └─ admin.ts                  # createClient(service_role) — server only, ít dùng
│  ├─ queries/                     # hàm fetch tái dùng: getKpiOverview(), getForecast(), …
│  ├─ kpi.ts                       # công thức/format K01–K07 (nhân 100, format VND…)
│  ├─ format.ts                    # formatVnd(), formatPct(), formatDiem()
│  └─ constants.ts                 # nhãn tiếng Việt, enum khoi_nganh, màu trường
├─ types/
│  ├─ database.types.ts            # GENERATED từ Supabase (supabase gen types)
│  └─ app.ts                       # type nghiệp vụ (Kpi, ProgramRow, ForecastPoint…)
├─ supabase/
│  ├─ migrations/                  # SQL tạo bảng, VIEW, RPC, RLS policy
│  └─ seed.sql                     # (tùy chọn) nạp dữ liệu từ Excel
├─ .env.local                      # KHÔNG commit (xem §8)
├─ .env.example                    # commit — liệt kê key rỗng
├─ tailwind.config.ts
├─ components.json                 # cấu hình shadcn/ui
└─ package.json
```

### 2.1. Ba Supabase client (quan trọng, hay sai)

```ts
// lib/supabase/client.ts   — Client Component ("use client")
import { createBrowserClient } from "@supabase/ssr";
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// lib/supabase/server.ts   — Server Component / Route Handler (đọc cookie)
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,   // anon — vẫn qua RLS
    { cookies: { getAll: () => cookieStore.getAll(),
                 setAll: (c) => c.forEach(({ name, value, options }) =>
                   cookieStore.set(name, value, options)) } }
  );
}

// lib/supabase/admin.ts    — CHỈ server, bỏ qua RLS, rất hạn chế dùng
import { createClient as createAdmin } from "@supabase/supabase-js";
export const createAdminClient = () =>
  createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,   // server-only env
              { auth: { persistSession: false } });
```

---

## 3. Bản đồ trang (Page/Route map)

| Route | Tên hiển thị | Câu hỏi | Nội dung chính | Dữ liệu |
|---|---|---|---|---|
| `/` | **Tổng quan** | — | 7 KPI card (K01–K07) + FilterBar (cohort / trường / khối ngành) + 2–3 chart tóm tắt | `v_student_outcome`, các bảng fact qua RPC `kpi_overview` |
| `/q1-nguyen-vong` | **Xếp nguyện vọng** | Q1 | Nhập/chọn hồ sơ HS → danh sách NV gợi ý chia **reach / match / safety**; trực quan K01, K02 | `v_main_dataset`, `fact_application_method`, `fact_cutoff_score`, RPC `q1_recommend` |
| `/q2-diem-chuan` | **Dự báo điểm chuẩn** | Q2 | Bảng ngành + MAE/K03; chọn ngành → trend dự báo vs thực tế + dải sai số | `fact_cutoff_forecast`, `fact_cutoff_score` |
| `/q2-diem-chuan/[programId]` | **Chi tiết dự báo ngành** | Q2 | Line chart 2023→2027, error band, so NAIVE vs MA2 | `fact_cutoff_forecast`, `fact_cutoff_score` |
| `/q3-viec-lam` | **Cơ hội việc làm** | Q3 | K04 tăng trưởng nhu cầu theo `industry_group` + K05 tỷ lệ việc làm theo ngành | `fact_labor_demand`, `fact_employment` |
| `/q4-chi-phi` | **Chi phí & khả năng chi trả** | Q4 | K06 tổng chi phí toàn khóa + K07 affordability index; cờ học bổng | `v_main_dataset`, `fact_tuition`, `dim_student` |
| `/explorer` | **Tra cứu ngành** | — | Bảng tìm kiếm 380 ngành + mọi fact; filter + phân trang | `dim_program` + join fact qua RPC/VIEW |
| `/explorer/[programId]` | **Chi tiết chương trình** | — | 1 trang gom hết: điểm chuẩn, chỉ tiêu, học phí, việc làm, dự báo, NV mô phỏng | nhiều bảng theo `program_id` |
| `/chat-luong-du-lieu` | **Chất lượng & độ phủ dữ liệu** | — | Trả lời trực tiếp nỗi lo "DB có ok không": độ phủ, dòng thiếu, confidence | `v_coverage_real`, `v_coverage_sim`, `fact_cutoff_score.confidence` |

### 3.1. Chi tiết từng module

**`/` Tổng quan**
- 7 `KpiCard`: K01, K02 (Q1) · K03 (Q2) · K04, K05 (Q3) · K06, K07 (Q4). Mỗi card: nhãn VN, giá trị đã format, 1 dòng "decision_meaning", badge tốt/cảnh báo theo ngưỡng (K05 ≥ 90% = tốt; K07 > 100% = cảnh báo).
- `FilterBar` dính (sticky): `cohort_year` (2023–2026), `university_code` (7 trường), `khoi_nganh` (I, III, IV, V, VI, VII — lưu ý khối II hầu như không có). Filter đẩy vào query param → RSC đọc `searchParams` → fetch lại.
- Chart tóm tắt: xem §5 (funnel kết quả tuyển sinh, bar tỷ lệ việc làm theo trường).

**`/q1-nguyen-vong` Xếp nguyện vọng (Q1)**
- Đầu vào: **chọn hồ sơ học sinh có sẵn** (`StudentPickerDialog`, 500 HS trong `dim_student`) **hoặc** nhập nhanh (GPA, điểm thi, IELTS/TSA/HSA, ngân sách, khối quan tâm). v1 ưu tiên "chọn hồ sơ sẵn" vì đã có kết quả chấm sẵn trong `fact_application_method`.
- Gọi RPC `q1_recommend(student_id)` → trả danh sách NV với `best_margin_30` và nhãn:
  - **Reach** (mơ ước): `best_margin_30 < 0` (chưa đủ điểm năm tham chiếu).
  - **Match** (vừa sức): `0 ≤ best_margin_30 < 1.0`.
  - **Safety** (an toàn): `best_margin_30 ≥ 1.0`.
- Trực quan: K01 (tỷ lệ đỗ NV1–NV3), K02 (lợi thế phương thức phụ). Cảnh báo khi danh sách toàn Reach (quá mạo hiểm).

**`/q2-diem-chuan` Dự báo điểm chuẩn (Q2)**
- Bảng ngành kèm `abs_error` trung bình (MAE) → K03. Chọn 1 ngành → chi tiết.
- Chi tiết: line forecast vs actual theo năm, dải ±MAE, so sánh phương pháp NAIVE vs MA2 (2 đường). `target_year = 2027` chưa có `actual_cutoff` → hiển thị là dự báo-only (điểm rỗng ở actual).

**`/q3-viec-lam` Cơ hội việc làm (Q3)**
- K04: tăng trưởng nhu cầu theo `industry_group` (từ `fact_labor_demand`, 15 nhóm có dữ liệu). Chú ý: các `metric` khác nhau về đơn vị (%, người/năm) → tách theo `metric`, không trộn.
- K05: tỷ lệ việc làm theo ngành/lĩnh vực (`fact_employment`, chỉ 26 ngành có số liệu, 37 dòng) → chỉ hiển thị ngành có dữ liệu, ngành thiếu ghi "Chưa có dữ liệu".

**`/q4-chi-phi` Chi phí & khả năng chi trả (Q4)**
- K06: tổng chi phí toàn khóa ước tính (có sẵn cột `est_total_cost_vnd` trong `v_main_dataset`/`fact_application`).
- K07: `affordability_index_pct` (>100% = vượt ngân sách). Gắn với hồ sơ HS đã chọn ở §3.1-Q1 (chung bộ chọn hồ sơ).
- Cờ học bổng: `scholarship_eligibility_score` (chỉ có ở NV trúng tuyển, ~85% null → hiển thị "n/a" khi null).

**`/explorer` + `/explorer/[programId]`**
- Bảng 380 ngành: `program_id`, tên ngành, trường, khối ngành, nhóm nghề, điểm chuẩn mới nhất, chỉ tiêu, học phị, tỷ lệ việc làm. Tìm kiếm theo tên/mã, filter trường/khối, phân trang (§4.5).
- Trang chi tiết: gom mọi fact theo `program_id` — lịch sử điểm chuẩn đa phương thức, chỉ tiêu, học phí, việc làm, dự báo, và các NV mô phỏng đã đặt vào ngành này.

---

## 4. Mẫu truy cập dữ liệu (Data Access Patterns)

### 4.1. Base table vs VIEW vs RPC — chọn cái nào

| Nhu cầu | Dùng | Lý do |
|---|---|---|
| Danh mục tĩnh (trường, ngành) | **Base table** `dim_university`, `dim_program` | nhỏ, join đơn giản, cache lâu |
| Dòng NV đầy đủ đã gộp HS+ngành+chi phí | **VIEW** `v_main_dataset` | đã join sẵn, tránh lặp logic join ở client |
| Kết quả 1 dòng/HS | **VIEW** `v_student_outcome` | tổng hợp sẵn cho Q1/Tổng quan |
| 7 KPI của trang Tổng quan | **RPC** `kpi_overview(cohort, uni, khoi)` | gộp 7 phép tính + áp filter trong 1 round-trip, trả JSON gọn |
| Gợi ý NV cho 1 HS (Q1) | **RPC** `q1_recommend(student_id)` | logic reach/match/safety nên để SQL, trả bảng |
| MAE theo ngành (K03) | **RPC** `q2_mae(program_id?)` hoặc VIEW `v_forecast_eval` | cần `AVG(abs_error)` nhóm theo ngành/năm |
| Độ phủ dữ liệu | **VIEW** `v_coverage_real`, `v_coverage_sim` | đã có sẵn trong gói |

> **Khuyến nghị:** tạo thêm 1 VIEW tổng hợp cho KPI (`v_kpi_overview`) hoặc RPC trả về 7 con số. Đừng tính K01–K07 bằng nhiều query rời rạc ở client — vừa chậm vừa dễ lệch công thức. Công thức chuẩn đã ghi ở KPI_Sheet (ví dụ K06 = Σ(học phí năm đầu × 1,1^k) + (54 triệu − hỗ trợ) × số năm; K07 = tổng chi phí / ngân sách × 100).

### 4.2. Fetch phía server (mặc định)

```ts
// app/page.tsx  (Server Component)
import { createClient } from "@/lib/supabase/server";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ cohort?: string; uni?: string; khoi?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: kpis } = await supabase.rpc("kpi_overview", {
    p_cohort: sp.cohort ? Number(sp.cohort) : null,
    p_uni: sp.uni ?? null,
    p_khoi: sp.khoi ?? null,
  });
  return <KpiRow kpis={kpis} />;
}
```

- Filter đi qua **query param** → URL chia sẻ được, back/forward hoạt động, RSC tự fetch lại.
- Chỉ phần tương tác (chart hover, mở dialog) mới là Client Component; data truyền xuống qua props.

### 4.3. Caching & revalidation

- Dữ liệu **tĩnh gần như hoàn toàn** (dump 2026-10-07, không đổi realtime) → cache mạnh.
- Dùng `export const revalidate = 3600` ở page tĩnh (hoặc lớn hơn, vì dữ liệu assignment cố định). Danh mục trường/ngành có thể `revalidate = false` (build-time) hoặc gắn tag.
- Với fetch qua `supabase-js`, bọc truy vấn trong hàm có `unstable_cache`/`cache()` và gắn `tags` (vd `["programs"]`, `["kpi"]`) để revalidate theo tag khi seed lại DB.
- Explorer (tìm kiếm động) → `dynamic` theo query, nhưng vẫn cache theo cặp (search+page) ngắn hạn.

### 4.4. Chuẩn hoá đơn vị ngay tại DB

Để tránh lỗi "nhân 100 chỗ này quên chỗ kia", tạo VIEW/RPC trả **đúng đơn vị hiển thị**:
- K01, K02, K05, K07: trả `value_pct` = fraction × 100 (0.648 → 64.8).
- K06: trả VND nguyên; format ở client bằng `formatVnd()` (vd "317,9 triệu").
- K03: trả điểm (thang 30), 2 chữ số thập phân.

### 4.5. Phân trang cho dữ liệu lớn (3k+ dòng NV, 4,5k dòng phương thức)

- `fact_application` 3.096 dòng, `fact_application_method` 4.587 dòng → **không bao giờ** `select("*")` không giới hạn ra client.
- Explorer và bảng NV dùng **range pagination** của PostgREST:

```ts
const PAGE = 50;
const from = page * PAGE;
const { data, count } = await supabase
  .from("dim_program")
  .select("program_id, major_name, university_code, khoi_nganh", { count: "exact" })
  .ilike("major_name", `%${q}%`)
  .order("program_id")
  .range(from, from + PAGE - 1);
```

- Với tập rất lớn/nhiều lần cuộn → ưu tiên **keyset pagination** (`.gt("program_id", lastId)`) thay cho offset lớn.
- Bảng danh mục chỉ 380 ngành → có thể tải full 1 lần rồi lọc/sort client-side (nhẹ). Nhưng NV 3k+ thì luôn phân trang server.
- Mọi truy vấn **chỉ chọn cột cần** (tránh kéo cả `source_url`, `note` dài khi không hiển thị).

---

## 5. Biểu đồ cho từng module (Charts)

> Theo quy trình dataviz: **chọn hình trước, màu sau**; một trục duy nhất (không bao giờ dual-axis); categorical gán màu theo thứ tự cố định, không quay vòng; sequential = 1 hue đậm dần; diverging = 2 cực + xám ở giữa; status (tốt/cảnh báo) tách riêng, luôn kèm icon+nhãn. Dùng Recharts, nhưng áp palette và số lượng series theo luật dưới.

### 5.1. Palette (đã validate — nhúng vào `globals.css` làm CSS vars)

Categorical (gán theo đúng thứ tự, tối đa 8; nếu quá 3 series trong scatter/choropleth thì gộp "Khác"):

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | blue | `#2a78d6` | `#3987e5` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#6250d6` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

- **Sequential (độ lớn):** blue, nhạt→đậm (`#cde2fb` … `#0d366b`).
- **Diverging (±quanh baseline):** blue ↔ red, midpoint xám (`#f0efec` sáng / `#383835` tối).
- **Status:** good `#0ca30c` · warning `#fab219` · serious `#ec835a` · critical `#d03b3b` — **không** tái dùng làm màu series; luôn kèm icon + nhãn (vd K07 > 100% = critical "Vượt ngân sách").
- Surface: sáng `#fcfcfb`, tối `#1a1a19`. Ink/grid/axis theo bảng chrome của palette.
- Màu 7 trường: cố định 1 màu/trường bằng 7 slot đầu categorical, map theo `university_code` trong `lib/constants.ts` — **màu theo thực thể, không theo thứ hạng**, filter đổi số series không được đổi màu trường còn lại.

### 5.2. Bảng chart theo module (loại + lý do)

| Màn hình | Chỉ số | Loại biểu đồ | Lý do (job của dữ liệu) |
|---|---|---|---|
| Tổng quan | Kết quả tuyển sinh 500 HS | **Funnel / bucket bar** (Đăng ký → Đủ điểm → Trúng tuyển NV1–3) | phễu lọc dần, job là "còn lại bao nhiêu ở mỗi bước" — 1 hue ordinal |
| Tổng quan | K05 theo trường | **Bar ngang, sequential** | so sánh độ lớn giữa 7 trường (tên dài → ngang); 1 hue đậm dần |
| Tổng quan | 7 KPI | **KPI row (stat tile)**, KHÔNG phải chart | mỗi KPI là 1 con số headline + delta/ngưỡng; stat tile đúng hơn one-bar chart |
| **Q1** | K01 tỷ lệ đỗ NV1–3 | **Bucket bar / stacked bar** (reach·match·safety) theo nhóm NV | part-to-whole của 1 danh sách NV; categorical 3 màu (vừa khít cap "color alone") |
| **Q1** | K02 lợi thế phương thức phụ | **Stacked bar** THPT vs phương thức phụ trên tổng NV đủ điểm | part-to-whole 2 phần; hoặc emphasis 1 phần |
| **Q1** | margin từng NV | **Diverging bar** quanh 0 (đủ/thiếu điểm, `best_margin_30`) | polarity ±: xanh đủ điểm / đỏ thiếu, midpoint 0 |
| **Q2** | forecast vs actual theo năm | **Line chart + error band** (area ±MAE quanh forecast) | trend theo thời gian + bất định; 2 đường (forecast, actual) + dải mờ |
| **Q2** | NAIVE vs MA2 | **Multi-line** (2 series categorical) | so 2 phương pháp; direct label cuối đường |
| **Q2** | K03 MAE theo ngành | **Bar ngang, sequential** (top ngành sai số lớn) | xếp hạng độ lớn sai số |
| **Q3** | K04 tăng trưởng nhu cầu | **Diverging bar** (tăng dương / âm theo `industry_group`) | polarity: xanh tăng / đỏ giảm quanh 0; cảnh báo bão hòa |
| **Q3** | K05 tỷ lệ việc làm theo ngành | **Grouped/bar ngang** + đường ngưỡng 90% | so magnitude + mốc tham chiếu (reference line 90%) |
| **Q4** | K07 affordability index | **Gauge / meter** (track cùng ramp, mốc 100%) | 1 tỷ lệ so với 1 giới hạn → meter đúng hơn pie 2 lát |
| **Q4** | K06 cấu phần chi phí | **Stacked bar** (học phí + sinh hoạt − hỗ trợ) theo năm học | part-to-whole chi phí toàn khóa; categorical |
| **Q4** | phân bố affordability toàn cohort | **Histogram** (bucket theo %), vùng >100% tô status critical | phân bố 1 biến; nhấn vùng vượt ngân sách |
| Explorer/chi tiết | lịch sử điểm chuẩn ngành | **Line/scatter theo năm × phương thức** | trend + nhiều phương thức; nếu >3 phương thức → facet small-multiples |
| Chất lượng DL | độ phủ theo trường×năm | **Heatmap** (sequential, % ô có điểm chuẩn chính) | ma trận trường×năm, job là magnitude ô → sequential 1 hue |

**Luật áp dụng xuyên suốt:**
- Mọi line/area/bar có **hover tooltip** (crosshair cho line, per-mark cho bar/dot).
- ≥2 series → **luôn có legend**; ≤4 series thì **direct-label** luôn, không ghi số trên mọi điểm.
- Không dual-axis: K04 (% tăng trưởng) và K05 (% việc làm) tuy cùng "%" nhưng khác ý nghĩa → **2 chart tách**, không chồng 2 trục.
- `fact_labor_demand` trộn nhiều `metric`/đơn vị (%, người/năm) → **không** vẽ chung 1 trục; tách theo metric hoặc chỉ lấy metric tăng trưởng cho K04.
- Có **bảng xem thay chart** (table view) cho mọi biểu đồ (yêu cầu accessibility); dark mode là bộ màu riêng đã nêu, không flip tự động.

---

## 6. Mô hình xác thực (Auth)

### 6.1. Khuyến nghị v1: KHÔNG đăng nhập per-user — public read-only

- DSS học thuật, dữ liệu công khai, mục tiêu là trình bày quyết định → **không cần tài khoản người dùng**.
- Supabase: bật **RLS** trên mọi bảng, tạo policy **`SELECT` cho `anon`** (public read). Không mở `INSERT/UPDATE/DELETE` cho anon.

```sql
alter table dim_program enable row level security;
create policy "public read dim_program" on dim_program
  for select to anon using (true);
-- lặp cho mọi bảng/VIEW công khai
```

- "Đăng nhập" thực chất được thay bằng **"chọn hồ sơ học sinh"** (StudentPickerDialog): người dùng chọn 1 trong 500 `dim_student` để cá nhân hoá Q1 (reach/match/safety) và Q4 (chi phí/affordability theo `family_budget_vnd_year`). Lưu lựa chọn bằng query param `?student=HS2023001` hoặc cookie nhẹ — **không phải auth**, chỉ là bộ lọc ngữ cảnh.

### 6.2. Nơi "cắm" auth thật sau này

- Khi cần (giáo viên lưu danh sách NV, học sinh tạo hồ sơ riêng): dùng **Supabase Auth** (email/OAuth), đổi RLS policy sang `auth.uid()`-based, thêm bảng `profile` map user→student. `@supabase/ssr` đã sẵn sàng đọc session qua cookie nên nâng cấp không phải viết lại tầng data.
- `service_role` vẫn chỉ ở server cho tác vụ admin/seed.

---

## 7. Danh mục component (Component inventory)

| Component | Loại | Vai trò | Props chính |
|---|---|---|---|
| `KpiCard` | UI/kpi | 1 thẻ KPI: nhãn VN, giá trị format, decision_meaning, badge ngưỡng | `label, value, unit, meaning, status?` |
| `KpiRow` | kpi | Hàng 7 KpiCard trang Tổng quan | `kpis: Kpi[]` |
| `FilterBar` | filters | Hàng filter sticky (1 hàng, trên chart) | `cohort, university, khoiNganh` (đẩy query param) |
| `CohortSelect` / `UniversitySelect` / `KhoiNganhSelect` | filters | Combobox shadcn, nhãn VN giữ nguyên | `value, onChange` |
| `StudentPickerDialog` | student | Chọn 1 trong 500 hồ sơ HS (search theo id/khối/ngân sách) → set `?student=` | `onSelect(studentId)` |
| `ProgramTable` | explorer | Bảng ngành có sort/filter/phân trang server | `rows, page, count, onPage` |
| `ProgramDetailPanel` | explorer | Gom mọi fact của 1 ngành | `programId` |
| `NvRecommendationList` | Q1 | Danh sách NV chia reach/match/safety, chip màu diverging | `items: NvReco[]` |
| `NvFunnelChart` | charts | Phễu Đăng ký→Đủ điểm→Trúng tuyển | `stages` |
| `ForecastChart` | charts | Line forecast vs actual + error band + NAIVE/MA2 | `series, band, methods` |
| `DemandGrowthChart` | charts | Diverging bar K04 theo industry_group | `data` |
| `EmploymentRateChart` | charts | Bar K05 + reference line 90% | `data, threshold=90` |
| `CostBreakdownChart` | charts | Stacked bar K06 theo năm | `years` |
| `AffordabilityMeter` | charts | Gauge/meter K07 quanh 100% | `indexPct, budget, cost` |
| `AffordabilityHistogram` | charts | Phân bố affordability toàn cohort | `buckets` |
| `CoverageHeatmap` | charts | Heatmap độ phủ trường×năm | `matrix` |
| `DataQualityBadge` | layout | Badge confidence (Cao/Trung bình/Thấp) cạnh số liệu | `confidence, nSources` |
| `Sidebar` / `PageHeader` | layout | Điều hướng 4 module + Tổng quan + Explorer + Chất lượng DL | — |
| `EmptyState` | layout | "Chưa có dữ liệu" cho ngành thiếu employment/forecast | `message` |
| `ChartCard` | charts | Khung chart: tiêu đề, legend, nút "Xem bảng", toggle | `title, children` |

---

## 8. Biến môi trường & cấu hình

`.env.local` (KHÔNG commit — thêm vào `.gitignore`; commit `.env.example` rỗng):

```bash
# Công khai (nhúng vào client bundle được)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>

# CHỈ server — KHÔNG prefix NEXT_PUBLIC_, KHÔNG log, KHÔNG import vào client
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# (tùy chọn) để introspect/seed bằng kết nối Postgres trực tiếp
DATABASE_URL=postgres://postgres:<pwd>@db.<project-ref>.supabase.co:5432/postgres
```

Sinh types từ DB (chạy lại mỗi khi schema đổi):

```bash
# cách 1: qua project-id (cần supabase login)
npx supabase gen types typescript --project-id <project-ref> --schema public > types/database.types.ts

# cách 2: qua local/DB URL
npx supabase gen types typescript --db-url "$DATABASE_URL" --schema public > types/database.types.ts
```

Dùng type đã sinh để Supabase client có kiểu:

```ts
import type { Database } from "@/types/database.types";
createServerClient<Database>(url, anon, { cookies: ... });
```

Cấu hình khác: `tailwind.config.ts` (bật dark mode `class`), `components.json` (shadcn), `next.config` (ảnh/headers). Không đặt secret nào trong `next.config` hay client.

---

## 9. Triển khai (Deployment — Vercel + Supabase)

1. **Supabase trước:** chạy migrations trong `supabase/migrations/` tạo bảng + VIEW + RPC + RLS policy. Nạp dữ liệu từ Excel bằng `seed.sql` hoặc import CSV (một lần). Dữ liệu assignment tĩnh nên không cần pipeline.
2. **Vercel:** import repo GitHub → framework tự nhận Next.js.
3. **Khai báo env trên Vercel** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → cả Production/Preview/Development.
   - `SUPABASE_SERVICE_ROLE_KEY` → đánh dấu **Sensitive**, chỉ Production/Preview; không bao giờ để lộ ở client.
4. **Kết nối runtime:** app (trên Vercel edge/node) gọi Supabase qua HTTPS/PostgREST bằng URL + anon key. Không cần mở cổng; Supabase quản lý Postgres + API.
5. **Preview deploy:** mỗi PR có URL preview riêng dùng chung Supabase (dữ liệu tĩnh nên an toàn). Nếu muốn tách, tạo project Supabase staging.
6. **Region:** chọn region Vercel gần Supabase (vd Singapore `sin1`) để giảm latency query.
7. **Build:** `next build`; bật caching/ISR theo §4.3. Không có job nền cần thiết cho v1.

---

## 10. Xử lý nỗi lo "database có ok không" & chất lượng dữ liệu

> Đây là mối lo người dùng nêu trực tiếp. Giải quyết bằng **một bước kiểm chứng trước khi build UI** + **một màn hình minh bạch chất lượng**.

### 10.1. Kiểm chứng schema Supabase khớp với gói Excel (làm TRƯỚC khi code UI)

- Đã có sẵn script introspect chỉ-đọc: `C:/Users/dat/Desktop/dss/_dbcheck/introspect.mjs` (đọc `DATABASE_URL` từ env hoặc `.env.local`, chỉ chạy SELECT trên catalog). Chạy nó để lấy danh sách bảng/cột/kiểu/số dòng **thực tế** trên Supabase, rồi đối chiếu với bảng dưới (số dòng kỳ vọng từ gói v5):

| Bảng/VIEW | Số dòng kỳ vọng | Kiểm |
|---|---|---|
| dim_university | 7 | ✅ phải đúng 7 trường, `tier_rank` 1–7 |
| dim_program | 380 | tổng theo trường 71+88+20+57+72+48+24 = 380 |
| dim_student | 500 | 200 v2 + 300 v4 |
| fact_exam_score | 500 | 1 dòng/HS |
| fact_application | 3096 | = số NV |
| fact_application_method | 4587 | ≥ fact_application (đa phương thức) |
| fact_cutoff_score | 2939 | 13 loại phương thức |
| fact_quota | 1366 | |
| fact_tuition | 63 | nhỏ — chủ yếu toàn trường |
| fact_employment | 37 | chỉ 26 ngành có số liệu |
| fact_labor_demand | 22 | 15 nhóm nghề |
| fact_cutoff_forecast | 1826 | 693 dòng chưa có `actual_cutoff` (2027) |
| v_main_dataset | 3096 | VIEW |
| v_student_outcome | 500 | VIEW |
| v_coverage_real / v_coverage_sim | 1520 / 1520 | VIEW |

- **Checklist khớp:** tên bảng = tên **chuẩn** (không phải tên sheet); 4 `v_*` tồn tại dưới dạng **VIEW** (không phải bảng nhân bản dữ liệu); khóa ngoại đúng (`fact_application_method.cutoff_id → fact_cutoff_score.cutoff_id`, NULL ở `TUYEN_THANG`); kiểu số (VND là integer, điểm là numeric), ngày là `date`.
- Nếu DB thiếu VIEW `v_*` hoặc thiếu RPC KPI → tạo bằng migrations (các công thức đã có ở KPI_Sheet). Nếu thiếu `fact_salary`/`fact_macro_labor` → **đúng như kỳ vọng** (gói v5 không có); UI Q3 phải ẩn phần lương một cách êm.

### 10.2. Minh bạch chất lượng ngay trong UI

- Màn hình **`/chat-luong-du-lieu`**: heatmap độ phủ (`v_coverage_real`: 1273/1292 ô có điểm chuẩn chính = 98,5%), liệt kê các ô thiếu (vd `BKA_MS5` 2024/2025, loạt `DCN_*TA` 2026...).
- Hiển thị `confidence` (Cao/Trung bình/Thấp) + `n_sources_agree` cạnh mỗi số liệu điểm chuẩn qua `DataQualityBadge`.
- Cờ các dòng cần cẩn trọng: `scale_confirmed = FALSE` (SPT ĐH Y, HSA/TSA quy đổi HaUI 2024) — **không** dùng cho mô phỏng/so sánh; phương thức `OTHER` độ tin cậy thấp; học phí phần lớn là khoảng toàn trường (`granularity`).
- Nhấn mạnh **THẬT vs MÔ PHỎNG**: dữ liệu điểm chuẩn/chỉ tiêu/học phí/việc làm là thật (có `source_url`); 500 HS + NV là **mô phỏng** (phân phối điểm, hành vi chọn NV, tỷ lệ case đặc biệt là giả định). UI nên ghi rõ để không gây hiểu nhầm là số liệu thực của học sinh thật.
- Case đặc biệt ảnh hưởng KPI (từ Case_Summary): K01 tính trên **cả 500 HS** (gồm HS bỏ thi/điểm liệt → không tốt nghiệp, `is_thpt_graduated = FALSE`) nên thấp hơn; K02/K06/K07 chỉ tính trên NV đủ điều kiện/trúng tuyển. Màn hình phải chú thích scope này để con số không bị "trông sai".

---

## 11. Lộ trình build gợi ý (cho nhóm sinh viên)

1. **Tuần 1 — Nền:** `create-next-app` (TS, Tailwind, App Router) → cài shadcn/ui, Recharts, `@supabase/ssr` → 3 client (§2.1) → chạy `introspect.mjs` đối chiếu schema (§10.1) → `supabase gen types`.
2. **Tuần 1–2 — Data layer:** viết migrations tạo VIEW `v_*` + RPC `kpi_overview`, `q1_recommend`, `q2_mae` nếu chưa có; bật RLS public read; `lib/queries/*`.
3. **Tuần 2 — Tổng quan:** `KpiRow` + `FilterBar` + funnel + bar K05.
4. **Tuần 3 — Q2 & Explorer:** `ForecastChart`, bảng ngành phân trang, trang chi tiết.
5. **Tuần 3–4 — Q1 & Q4:** `StudentPickerDialog`, `NvRecommendationList`, `AffordabilityMeter`, `CostBreakdownChart`.
6. **Tuần 4 — Q3 & Chất lượng DL:** `DemandGrowthChart`, `EmploymentRateChart`, `CoverageHeatmap`, badge confidence.
7. **Cuối — Polish & deploy:** dark mode, table-view cho chart, export CSV, deploy Vercel (§9).

---

### Phụ lục A — Enum/nhãn tiếng Việt cần giữ nguyên (đặt ở `lib/constants.ts`)

- `khoi_nganh`: I, III, IV, V, VI, VII (+ II hiếm) với `khoi_nganh_name` kèm theo.
- `tier`: "Top 1", "Nhóm khá", "Nhóm trung bình", "Nhóm trung bình – thấp", "Nhóm thấp".
- `confidence`: "Cao", "Trung bình", "Thấp", "Không có dữ liệu".
- `admission_status`: "Trúng tuyển", "Trượt tất cả NV", "Không tốt nghiệp THPT – không được xét".
- `exam_status` / `special_case`: 6–7 giá trị (NORMAL, TU_DO, BO_THI_TOAN_BO, BO_THI_1_MON, DIEM_LIET, MIEN_THI_NN, MIEN_THI_TOAN_BO) và nhãn VN tương ứng.
- `admission_method`: THPT, QUY_DOI_CHUNG, HOC_BA, XTTH, TSA, HSA, SPT, KET_HOP_CCNN, KET_HOP_XT, SAT, XTTN_*, TUYEN_THANG, OTHER — kèm `method_group` (tên VN).
- Quy đổi thang điểm: TSA→30 = 9,6 + 0,248×TSA; HSA→30 = 14,6 + 0,117×HSA; ưu tiên dùng cột `*_30` có sẵn thay vì tự tính.
