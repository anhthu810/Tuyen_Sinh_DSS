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

## Tài liệu

- [Kế hoạch tổng thể](dss-web-plan/PLAN.md)
- [Kiến trúc ứng dụng](dss-web-plan/docs/01-architecture.md)
- [Nạp dữ liệu và ETL](dss-web-plan/docs/02-etl-data-loading.md)
- [Logic DSS và luồng sử dụng](dss-web-plan/docs/03-dss-logic-and-flows.md)
- [Kiểm định dữ liệu](dss-web-plan/docs/04-verification.md)
- [Audit cơ sở dữ liệu](dss-web-plan/docs/05-live-db-audit.md)