# BRIEF cho GLM-5.3 — paste nguyên văn vào agent Zed

Bạn là agent build song song với Claude trên cùng repo. Đọc kỹ trước khi code.

## Bối cảnh
- Dự án: **DSS Tư vấn Tuyển sinh & Hướng nghiệp** (Nhóm 5). Web tại `C:/Users/dat/Desktop/dss/web` (Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase, Recharts, lucide-react).
- DB Supabase **đã sẵn sàng** (13 bảng có dữ liệu thật, RLS cho phép đọc công khai). `.env.local` đã cấu hình (URL + publishable key) — **đừng sửa**.
- **BẮT BUỘC đọc trước khi code** (context 1M, đọc trọn):
  `dss-web-plan/COLLAB-PLAN.md` (luật chia việc), `dss-web-plan/PLAN.md`, `dss-web-plan/docs/01-architecture.md` (mục 3 bản đồ trang + mục 5 biểu đồ từng module), `dss-web-plan/docs/03-dss-logic-and-flows.md` (logic DSS), `dss-web-plan/docs/05-live-db-audit.md` (dữ liệu thật + nhãn THẬT/MÔ PHỎNG).

## Luật cứng (vi phạm = hỏng phối hợp)
1. **CHỈ** tạo/sửa file trong các thư mục của bạn:
   `web/src/app/diem-chuan/**`, `viec-lam/**`, `chi-phi/**`, `explorer/**`, `chat-luong-du-lieu/**` (component riêng để trong `_components/` cùng route).
2. **CHỈ ĐỌC** (import), KHÔNG sửa: `web/src/lib/**`, `web/src/components/ui/**`, `web/src/components/charts/**`, `web/src/types/**`, `layout.tsx`, `globals.css`.
3. **KHÔNG đụng** DB/Supabase/migration/RLS, **không** sửa `.env.local`, **không** sửa `src/app/page.tsx`, `nguyen-vong/**`, `khuyen-nghi/**` (Claude làm).
4. Cần hàm query / biểu đồ chung chưa có → tạo file `dss-web-plan/requests/<tên>.md` mô tả yêu cầu; **đừng tự thêm** vào `lib/queries` hay `components/charts`.
5. Dữ liệu lấy **từ DB qua `web/src/lib/queries/*`** — không hardcode số liệu.
6. Giữ nhãn tiếng Việt **nguyên văn** (dấu `–`, `≤`, `…`). Bạn không nhận ảnh → bám spec chữ.
7. `git pull`/merge `main` trước khi code để có foundation mới nhất của Claude. Làm trên nhánh `glm/modules`. Build thử ở cổng riêng: `cd web && PORT=3001 npm run dev`.

## Hợp đồng dữ liệu bạn dùng (Claude cung cấp trong `web/src/lib/queries/`)
Xem chữ ký đầy đủ ở `COLLAB-PLAN.md §3.1`. Kiểu dữ liệu ở `web/src/types/database.types.ts`. Component chung ở `components/ui` + `components/charts` (có `chartPalette`, `ChartCard`, `LineBandChart`, `GroupedBarChart`, `DivergingBarChart`, `GaugeMeter`, `DataTable`, `FilterBar`, `DataQualityBadge`, `EmptyState`, `Skeleton`).
> Nếu Claude chưa commit xong foundation, dựng layout + text trước; nối query khi có.

## Nhiệm vụ của bạn (làm theo thứ tự Q2 → Q3 → Q4 → Explorer → Chất lượng DL)

### Q2 — `diem-chuan` (Dự báo điểm chuẩn)
- Chọn 1 ngành (Select, mặc định 1 ngành hot) → `getForecast(programId)` → `LineBandChart`: trục x = năm (2023–2027), đường **thực tế** (actual_cutoff), đường **dự báo NAIVE** và **MA2**, dải ±MAE quanh dự báo. Năm 2027 chưa có actual → chỉ dự báo + dải.
- Thẻ **K03** (MAE của ngành) + câu dịch nghĩa: "nên cộng thêm ~X điểm làm khoảng an toàn khi chốt NV".
- Bảng sai số (năm × phương pháp × forecast × actual × abs_error) + nút xem bảng.
- Nguồn: `getForecast`, `getForecastAccuracy`. DoD theo `COLLAB-PLAN §10`.

### Q3 — `viec-lam` (Cơ hội việc làm)
- `getEmployment` → tỷ lệ có việc làm theo ngành/lĩnh vực (`employment_rate_pct`), ngưỡng tham chiếu 90% (badge success/warning).
- `getLaborDemand(industryGroup)` → tăng trưởng nhu cầu (K04) + số thiếu hụt tuyệt đối; **DivergingBarChart** cho tăng trưởng (±). Dữ liệu mỏng → badge "Chưa đủ dữ liệu" khi thiếu, **không bịa**.
- Lọc theo nhóm nghề/trường (`FilterBar`).

### Q4 — `chi-phi` (Chi phí & khả năng chi trả)
- Chọn ngành + nhập ngân sách/năm → `estimateCost` → `GaugeMeter` chỉ số chi trả (K07, mốc 100%) + bóc tách chi phí toàn khóa (K06: học phí lũy tiến 10%/năm + sinh hoạt 54tr − hỗ trợ NĐ116 nếu sư phạm).
- >100% → gợi ý: học bổng, ngành học phí thấp hơn, tín dụng. Dùng `getTuition` để so học phí các trường.

### Explorer — `explorer` + `explorer/[programId]`
- `DataTable` 380 ngành: cột trường, tên ngành, khối ngành, nhóm nghề, điểm chuẩn mới nhất, chỉ tiêu, học phí, việc làm; **lọc + tìm + phân trang server** (`getPrograms`).
- Trang chi tiết `[programId]`: `getProgramDetail` → gom điểm chuẩn qua các năm/phương thức, chỉ tiêu, học phí, việc làm, dự báo. Link chéo sang Q2/Q4.

### Chất lượng dữ liệu — `chat-luong-du-lieu`
- Bảng độ phủ (ngành×năm có điểm chuẩn: 1273/1292 ≈ 98,5%), `DataQualityBadge` theo `confidence` & `scale_confirmed=FALSE`, nhãn **THẬT vs MÔ PHỎNG** cho từng bảng (xem `docs/05` + `PLAN.md §3`), và phạm vi tính của từng KPI K01–K07.

## Biểu đồ: theo `docs/01-architecture.md §5` + skill dataviz (màu từ `chartPalette`). Mỗi biểu đồ kèm "xem bảng". Light + dark đều phải đẹp.

## Kiểm tra trước khi báo xong mỗi trang
`cd web && npm run build` phải pass; trang đọc dữ liệu thật; có loading/empty; chỉ sửa file trong folder của bạn.
