# Tuyển Sinh DSS

Ứng dụng hỗ trợ ra quyết định tuyển sinh và định hướng ngành học. DSS kết hợp dữ liệu điểm chuẩn, dự báo, học phí, việc làm và hồ sơ học sinh để giúp tra cứu chương trình, đánh giá lựa chọn và xếp nguyện vọng.

## Chức năng

- Tổng quan các chỉ số tuyển sinh.
- Gợi ý và xếp nguyện vọng theo hồ sơ học sinh.
- Tra cứu ngành, điểm chuẩn và dự báo.
- Xem thông tin việc làm, học phí và khả năng chi trả.
- Theo dõi chất lượng và độ phủ dữ liệu.
- Tư vấn ngành bằng AI (cần cấu hình khóa API riêng).

Phạm vi dữ liệu và logic DSS được mô tả trong kế hoạch dự án: 7 trường đại học, 380 chương trình và 500 hồ sơ học sinh mô phỏng.

## Công nghệ

- Next.js 16, React 19 và TypeScript
- Tailwind CSS và Recharts
- Supabase (Postgres)

## Chạy ứng dụng

Cần cài Node.js tương thích với Next.js 16. Từ thư mục gốc của repository, chạy:

```powershell
cd web
npm ci
npm run dev
```

Mở http://localhost:3000.

Tạo file `web/.env.local` để kết nối Supabase:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Thay giá trị mẫu bằng URL và anon key của project Supabase. Trang có thể khởi động khi chưa cấu hình, nhưng dữ liệu từ Supabase sẽ không tải được. Tính năng tư vấn AI cần thêm `ZAI_API_KEY` ở phía server. Không đưa `service_role` key hoặc khóa bí mật vào biến `NEXT_PUBLIC_*`.

Các lệnh khác, chạy trong `web/`:

```powershell
npm run build
npm run start
npm run lint
```

## Dự báo điểm chuẩn theo phương thức

Dự báo được tính riêng cho từng chuỗi **trường + ngành + phương thức + tổ hợp + thang điểm**. Hệ thống không gộp điểm THPT với học bạ, HSA, TSA… và không tự quy đổi chéo thang điểm. Nhóm kết hợp (4) và năng khiếu/tài năng (5) chỉ hiển thị lịch sử. Mỗi chuỗi có `forecast_status` và cờ `crosses_policy_change` để đánh dấu năm đổi quy chế.

Cập nhật dữ liệu (chạy theo thứ tự trong Supabase → SQL Editor):

1. `dss-web-plan/fix/02_method_aware_cutoff.sql`: thêm cột metadata, bảng quy chế, ngưỡng đầu vào và các view kiểm tra `v_check_*`.
2. `python etl/build_method_forecast.py`: đọc `DSS_Group5_DataPackage_v5.xlsx` và sinh `etl/generated/03_load_cutoff_forecast.sql` cùng `forecast_summary.txt`. Cần cài `openpyxl`.
3. Chạy `etl/generated/03_load_cutoff_forecast.sql`: lệnh này thay toàn bộ `fact_cutoff_forecast`. Nếu SQL Editor báo "query too large", chạy lần lượt các file `etl/generated/parts/03_part_01.sql` … `03_part_09.sql` thay cho file trên.
4. (Tùy chọn) `dss-web-plan/fix/04_holt_forecast.sql`: hàm `holt_forecast()` và view `v_holt_check` để đối chiếu Holt tính bằng SQL với dòng ETL (`select * from v_holt_check where holt_etl is null or abs(diff) > 0.01;` kỳ vọng 0 dòng).

5. `dss-web-plan/fix/05_method_group.sql`: thêm `method_group` (GROUP_THPT/HOCBA/EXAM/COMBINED/TALENT) và `is_forecastable` cho `fact_cutoff_forecast`, phân loại theo từ khóa phương thức. Chạy lại sau mỗi lần nạp lại bước 3. Các view `v_check_method_group`, `v_check_series_single_scale`, `v_check_exam_scale`, `v_check_no_cross_scale` phải trả 0 dòng.
6. (Tùy chọn) `dss-web-plan/fix/06_forecast_filter.sql`: view `v_school_catalog` và hàm `search_forecast_series(school, group, scale, model, keyword)` cho client ngoài web (tham số `NULL`/`'ALL'` = bỏ lọc). Web không phụ thuộc file này.

Trang `/diem-chuan` có bộ lọc: từ khóa ngành/mã ngành (không dấu), trường (lấy động từ DB), 5 nhóm phương thức, thang điểm gốc, mô hình (MA2/NAIVE/Holt). API tương ứng:

- `GET /api/v1/schools` → `{ data: [{ code, name, shortName }], total }`
- `GET /api/v1/forecasts?schoolCode=&methodGroup=&scoreScale=&modelType=&keyword=&limit=&offset=` → `{ filters, total, limit, offset, data }`; giá trị rỗng hoặc `ALL` bỏ điều kiện, giá trị sai trả 400.

Module `web/src/lib/dss/forecast-routing.ts` (`routeForecast`) chọn mô hình theo nhóm và số năm: năng khiếu không dự báo; học bạ/kết hợp đổi công thức thì dùng điểm năm gần nhất; còn lại ≥ 3 năm dùng Holt, 2 năm MA2, 1 năm NAIVE (cảnh báo `LOW_DATA_RELIABILITY`). Cơ hội đỗ (Chắc đỗ / Vừa sức / Với cao) dựa trên MAE của chuỗi, không nhỏ hơn sai số nền 1,35 điểm/thang 30 (co giãn theo thang gốc).

Holt dùng α=0.6, β=0.2 và cần ≥ 3 năm liên tiếp. Công thức nằm ở 3 nơi và phải khớp nhau: `etl/build_method_forecast.py`, `web/src/lib/dss/holt.ts` (kiểm thử: `cd web && npm test`) và `04_holt_forecast.sql`.

Ngưỡng đầu vào của khối sức khỏe và sư phạm chưa được seed. Nhóm cần nhập từ thông báo của Bộ vào `ref_min_eligibility_score`; view `v_check_eligibility_threshold` sẽ liệt kê các ngành còn thiếu ngưỡng.

## Tài liệu

- [Kế hoạch tổng thể](dss-web-plan/PLAN.md)
- [Kiến trúc ứng dụng](dss-web-plan/docs/01-architecture.md)
- [Nạp dữ liệu và ETL](dss-web-plan/docs/02-etl-data-loading.md)
- [Logic DSS và luồng sử dụng](dss-web-plan/docs/03-dss-logic-and-flows.md)
- [Kiểm định dữ liệu](dss-web-plan/docs/04-verification.md)
- [Audit cơ sở dữ liệu](dss-web-plan/docs/05-live-db-audit.md)