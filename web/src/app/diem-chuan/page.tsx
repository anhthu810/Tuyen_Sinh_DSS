import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DiemChuanContent, type DiemChuanSearchParams } from "./_components/diem-chuan-content";

export default function DiemChuanPage({
  searchParams,
}: {
  searchParams: DiemChuanSearchParams;
}) {
  return (
    <div>
      <PageHeader
        title="Dự báo điểm chuẩn"
        description="Dự báo điểm chuẩn theo trường + ngành + phương thức + thang điểm. So sánh NAIVE, MA2 và Holt trên cùng một chuỗi, kèm dải sai số ±MAE; phương thức chưa đủ dữ liệu chỉ hiển thị lịch sử."
        badge="Nguồn: fact_cutoff_forecast"
      />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <DiemChuanContent searchParams={searchParams} />
      </Suspense>

      <p className="mt-6 text-xs text-muted-foreground">
        Lưu ý: điểm hiển thị theo thang gốc của chuỗi; chỉ quy về thang 30 khi có căn cứ (thang 30/40).
        Điểm chuẩn trúng tuyển khác ngưỡng đầu vào (ngành sức khỏe, sư phạm có ngưỡng riêng). Năm dự báo
        mới nhất chưa có điểm thực tế nên đường “Thực tế” dừng ở năm gần nhất có dữ liệu.
      </p>
    </div>
  );
}