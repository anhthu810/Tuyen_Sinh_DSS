# COLLAB-PLAN.md — Kế hoạch chia việc Claude ⨉ GLM-5.3

> Hai agent build song song web DSS trong `web/`. **Nguyên tắc tối thượng: KHÔNG hai agent sửa cùng một file.** Chia theo **sở hữu thư mục** + **hợp đồng giao diện** cố định trước.

## 1. Phân vai theo thế mạnh

| Agent | Mảng | Vì sao |
|---|---|---|
| **Claude** (phiên này) | Nền tảng dùng chung + "bộ não" DSS + phần tích hợp/rủi ro | Đang nắm toàn bộ ngữ cảnh DB thật, lớp KPI, schema; hợp để làm phần chung + engine Q1/Σ (khó nhất, nhiều ràng buộc) |
| **GLM-5.3** (Zed) | Các module trình bày độc lập (đọc dữ liệu qua lớp chung) | Context 1M + reasoning max, hợp làm nhiều trang UI song song khi đã có hợp đồng dữ liệu rõ. Lưu ý: **không nhận ảnh** → làm theo spec chữ, không dựa screenshot |

## 2. Bản đồ sở hữu file (OWNERSHIP — bất khả xâm phạm)

**CLAUDE sở hữu (GLM KHÔNG sửa):**
```
web/src/lib/**                    (supabase/, kpi.ts, queries/, dss/, utils.ts, format.ts, nav.ts)
web/src/types/**                  (database.types.ts)
web/src/components/ui/**          (card, badge, button, + select/input/table/filter sắp thêm)
web/src/components/charts/**      (primitive biểu đồ dùng chung + palette)
web/src/components/app-sidebar.tsx, page-header.tsx, kpi-card.tsx, module-stub.tsx
web/src/app/layout.tsx
web/src/app/globals.css
web/src/app/page.tsx              (Tổng quan)
web/src/app/nguyen-vong/**        (Q1)
web/src/app/khuyen-nghi/**        (Σ)
+ toàn bộ DB/Supabase (migration, RLS, nạp dữ liệu) + file trong dss-web-plan/ và _dbcheck/
```

**GLM sở hữu (Claude KHÔNG sửa):**
```
web/src/app/diem-chuan/**         (Q2)  + diem-chuan/_components/*
web/src/app/viec-lam/**           (Q3)  + viec-lam/_components/*
web/src/app/chi-phi/**            (Q4)  + chi-phi/_components/*
web/src/app/explorer/**           (Tra cứu ngành + [programId] detail) + explorer/_components/*
web/src/app/chat-luong-du-lieu/** (Chất lượng dữ liệu) + _components/*
```
> Mỗi trang GLM đặt component riêng trong `_components/` **cùng thư mục route** (co-located) — không bỏ vào `components/` chung.
> GLM **chỉ ĐỌC** `web/src/lib/queries`, `web/src/components/charts`, `web/src/components/ui`, `web/src/types`. Cần thêm hàm query/biểu đồ dùng chung → **nhờ Claude thêm** (xem §8), không tự sửa file chung.
> GLM **TUYỆT ĐỐI không** đụng DB/Supabase (schema, RLS, nạp dữ liệu) — Claude sở hữu toàn bộ DB.

## 3. Hợp đồng giao diện (CONTRACTS) — Claude giao trước, cả hai code theo

### 3.1. Lớp truy vấn `web/src/lib/queries/*` (Claude implement; GLM gọi)
```ts
// filters.ts
getUniversities(): Promise<DimUniversity[]>
getKhoiNganhList(): Promise<string[]>
getIndustryGroups(): Promise<string[]>
export type CommonFilter = { universityCode?: string; khoiNganh?: string; year?: number; search?: string }

// programs.ts
getPrograms(f?: CommonFilter): Promise<ProgramRow[]>
getProgramDetail(programId: string): Promise<ProgramDetail> // program + cutoffs[] + quotas[] + tuition[] + employment[] + forecasts[]

// forecast.ts  (Q2)
getForecast(programId: string): Promise<ForecastPoint[]> // {target_year, method, forecast_cutoff, actual_cutoff, abs_error}
getForecastAccuracy(): Promise<{ programId: string; mae: number }[]>

// employment.ts (Q3)
getEmployment(f?: CommonFilter): Promise<EmploymentRow[]>
getLaborDemand(industryGroup?: string): Promise<LaborDemandRow[]>

// tuition.ts (Q4)
getTuition(f?: CommonFilter): Promise<TuitionRow[]>
estimateCost(input: { programId: string; budgetVndYear: number }): Promise<{ total: number; affordabilityPct: number; breakdown: ... }>

// students.ts (dùng cho Q1/Q4 + selector)
getStudentOptions(): Promise<{ student_id: string; label: string }[]>
getStudent(id: string): Promise<StudentFull>
```
Tất cả kiểu dữ liệu nằm ở `web/src/types/database.types.ts` (Claude mở rộng đủ 13 bảng). GLM `import type { ... }` từ đó.

### 3.2. Biểu đồ dùng chung `web/src/components/charts/*` (Claude cung cấp; theo dataviz)
- `LineBandChart` — đường + dải sai số (Q2: dự báo vs thực tế, dải MAE).
- `GroupedBarChart`, `DivergingBarChart` — (Q3 tăng trưởng nhu cầu).
- `GaugeMeter` / `ProgressMeter` — (Q4 chỉ số chi trả).
- `ChartCard` (khung + tiêu đề + chú thích + nút "xem bảng").
- `chartPalette` (màu categorical/sequential/diverging + status) đã kiểm định accessibility (light+dark).
> Nếu một trang cần biểu đồ đặc thù không có sẵn: GLM dựng bằng **Recharts trực tiếp trong `_components/` của trang**, dùng màu từ `chartPalette` — **không** sửa `components/charts/`.

### 3.3. UI chung `web/src/components/ui/*` (Claude cung cấp)
`Card/Badge/Button` (đã có) + sắp thêm: `Select`, `Input`, `DataTable` (phân trang server), `FilterBar`, `EmptyState`, `DataQualityBadge`, `Skeleton`.

## 4. Thứ tự thực hiện (sequencing)

```
PHA 0 (xong) ── M0: scaffold, 3 supabase client, KPI tổng quan, 9 trang khung.
PHA 1 (Claude, LÀM TRƯỚC) ── Nền tảng:
   F1 mở rộng types đủ 13 bảng
   F2 lớp queries/* (§3.1)
   F3 charts/* + palette (§3.2)
   F4 ui/* bổ sung: Select/Input/DataTable/FilterBar/EmptyState/DataQualityBadge
   → commit + push nhánh `claude/foundation` → merge `main`. BÁO GLM "foundation ready".
PHA 2 (SONG SONG) ──
   Claude: Q1 (nguyen-vong) + lib/dss engine (reach/match/safety, xác suất đỗ) → Σ (khuyen-nghi) → polish Tổng quan (filter + biểu đồ funnel K01).
   GLM:    Q2 → Q3 → Q4 → Explorer → Chất lượng dữ liệu (theo §7).
```
> GLM có thể **bắt đầu ngay** phần không phụ thuộc (layout trang, text, bộ khung component) dựa trên **spec §7 + hợp đồng §3**, rồi nối `queries/*` thật khi Claude báo foundation ready. Trong lúc chờ, tạm `import` hàm query và chấp nhận TS báo thiếu — hoặc Claude commit **stub** các hàm (trả mảng rỗng đúng kiểu) để GLM compile được ngay.

## 5. Việc của CLAUDE (checklist)
- [ ] F1 types đủ 13 bảng (thay types tối giản M0).
- [ ] F2 `lib/queries/*` theo §3.1 (có xử lý phân trang, lọc, map kiểu).
- [ ] F3 `components/charts/*` + `chartPalette` (theo skill dataviz, light+dark, có table-view).
- [ ] F4 `components/ui/*` bổ sung.
- [ ] `lib/dss/*`: engine quy đổi thang 30, priority_bonus, Holland match, forecast band, phân loại REACH/MATCH/SAFETY, P(đỗ), K06/K07 per-student.
- [ ] **Q1** `nguyen-vong`: chọn hồ sơ HS (hoặc nhập tay) → danh sách NV xếp hạng + badge reach/match/safety + cảnh báo so baseline K01.
- [ ] **Σ** `khuyen-nghi`: xếp hạng ngành 4 trục + slider trọng số + Top-3 + lý do.
- [ ] Polish **Tổng quan**: FilterBar (khóa/trường/khối ngành) + funnel kết quả + bar K05; sửa đối chiếu **K02** (xem ghi chú H1 & chênh lệch 56,1% vs 37,68%).
- [ ] Giữ types/queries ổn định; xử lý yêu cầu "cần hàm chung" từ GLM (§8).

## 6. Việc của GLM-5.3 (tổng quan — chi tiết ở GLM-BRIEF.md)
- [ ] **Q2 diem-chuan**: chọn ngành → `LineBandChart` dự báo (NAIVE/MA2) vs thực tế + dải MAE; bảng sai số; "khoảng an toàn nên cộng". Dữ liệu: `getForecast`, `getForecastAccuracy`.
- [ ] **Q3 viec-lam**: `getEmployment` + `getLaborDemand` → tỷ lệ việc làm theo ngành/lĩnh vực (ngưỡng 90%) + tăng trưởng nhu cầu (K04) theo nhóm nghề; badge "Chưa đủ dữ liệu" khi thiếu.
- [ ] **Q4 chi-phi**: chọn ngành (+ ngân sách) → `estimateCost` → `GaugeMeter` chỉ số chi trả (K07) + bóc tách chi phí (K06); gợi ý khi >100%.
- [ ] **Explorer**: `DataTable` 380 ngành (lọc + phân trang server) + trang chi tiết `explorer/[programId]` gom mọi fact (`getProgramDetail`).
- [ ] **Chất lượng dữ liệu**: độ phủ, `DataQualityBadge` (confidence, scale_confirmed=FALSE), nhãn THẬT/MÔ PHỎNG, phạm vi tính từng KPI. (Tham chiếu `docs/05-live-db-audit.md`.)

## 7. Quy tắc phối hợp & Git
- **Git branch:** `main` = ổn định. Claude làm trên `claude/*`, GLM trên `glm/modules`. Merge vào `main` khi 1 trang xong + `npm run build` pass. Vì sở hữu folder rời nhau → gần như không conflict; nếu có, chỉ ở `main`.
  - Nên tạo remote GitHub (private) để 2 bên pull/push. Chưa có remote → tạm: mỗi bên commit trên nhánh riêng, Claude merge.
- **Trước khi code:** `git pull` (hoặc merge `main`) để lấy foundation mới nhất.
- **Không chạy đồng thời 2 `npm run dev`** trên cùng cổng; mỗi agent tự build/kiểm trên máy/cổng riêng (vd GLM `PORT=3001`).
- **Không ai sửa file ngoài folder mình sở hữu.** Cần thay đổi file chung → ghi yêu cầu, Claude làm.
- **DB chỉ Claude đụng.** GLM chỉ đọc qua `lib/queries`.
- **Đừng sửa** `web/.env.local` (đã cấu hình). GLM dùng nguyên anon key sẵn có.

## 8. Kênh "xin hàm chung" (GLM → Claude)
GLM cần 1 query/biểu đồ chưa có → tạo file `dss-web-plan/requests/<ngày>-<tên>.md` mô tả: tên hàm, input, output kiểu gì, dùng ở trang nào. Claude implement trong `lib/queries` hoặc `components/charts` rồi báo. (Không tự thêm vào file chung để tránh lệch hợp đồng.)

## 9. Lưu ý riêng cho GLM-5.3
- **Không nhận ảnh** → không yêu cầu xem screenshot; bám spec chữ + các file `docs/01-architecture.md` §3/§5 (biểu đồ từng module) và `docs/03-dss-logic-and-flows.md`.
- Context 1M → **đọc trọn** `PLAN.md`, `docs/01`, `docs/03`, `docs/05`, `COLLAB-PLAN.md`, `GLM-BRIEF.md` trước khi code.
- `parallel_tool_calls: false` → gọi tool tuần tự.
- Giữ nhãn tiếng Việt **nguyên văn** (en-dash `–`, `≤`, `…`).

## 10. Định nghĩa HOÀN THÀNH (mỗi trang)
1. `npm run build` pass (type-check sạch). 2. Đọc dữ liệu THẬT từ Supabase (không hardcode). 3. Có trạng thái loading (Suspense) + empty/err. 4. Light + dark đều đẹp. 5. Có "xem bảng" cho mỗi biểu đồ. 6. Nhãn tiếng Việt đúng. 7. Chỉ nằm trong folder sở hữu của mình.

## 11. Mốc gợi ý
- Ngày 1: Claude F1–F4 (foundation) + merge. GLM dựng khung Q2/Q3/Q4 (layout + text) theo spec.
- Ngày 2: GLM nối dữ liệu Q2/Q3/Q4; Claude làm lib/dss + Q1.
- Ngày 3: GLM Explorer + Chất lượng DL; Claude Σ + polish Tổng quan.
- Ngày 4: tích hợp, kiểm chéo, deploy Vercel.
