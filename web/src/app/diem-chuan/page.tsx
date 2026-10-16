import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DiemChuanContent } from "./_components/diem-chuan-content";

export default function DiemChuanPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Q2 · Dự báo điểm chuẩn"
        description="So sánh điểm chuẩn thực tế với dự báo theo hai phương pháp NAIVE (năm trước) và MA2 (TB 2 năm trước), kèm dải sai số ±MAE của từng ngành để tham khảo khi chốt nguyện vọng."
        badge="Nguồn: fact_cutoff_forecast"
      />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <DiemChuanContent searchParams={searchParams} />
      </Suspense>

      <p className="mt-6 text-xs text-muted-foreground">
        Lưu ý: điểm chuẩn và dự báo hiển thị theo thang gốc của từng ngành (score_scale); năm dự báo
        mới nhất chưa có điểm thực tế nên đường “Thực tế” dừng ở năm gần nhất có dữ liệu.
      </p>
    </div>
  );
}