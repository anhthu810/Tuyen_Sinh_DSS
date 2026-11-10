import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadWhatIfDataset } from "@/lib/queries/what-if";
import { WhatIfSimulator } from "./_components/what-if-simulator";

export default function WhatIfPage() {
  return (
    <div>
      <PageHeader
        title="Phân tích kịch bản (What-if)"
        description="Nếu thay đổi điểm bài thi phụ, điểm chuẩn hoặc ngân sách gia đình thì tỷ lệ đỗ NV1–NV3 (K01) và áp lực tài chính (K07) sẽ thay đổi thế nào?"
        badge="Dữ liệu trực tiếp từ Supabase"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <WhatIfContent />
      </Suspense>
    </div>
  );
}

async function WhatIfContent() {
  const dataset = await loadWhatIfDataset();
  if (!dataset.students.length) {
    return (
      <EmptyState
        title="Chưa tải được dữ liệu mô phỏng"
        description="Không đọc được dim_student hoặc main_dataset từ Supabase. Kiểm tra kết nối và policy RLS đọc công khai."
      />
    );
  }
  return <WhatIfSimulator dataset={dataset} />;
}

