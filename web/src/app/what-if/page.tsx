import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { loadWhatIfDataset } from "@/lib/queries/what-if";
import { WhatIfSimulator } from "./_components/what-if-simulator";

export default function WhatIfPage() {
  return (
    <div className="-mx-5 -my-6 min-h-screen bg-[#f6f5f1] px-5 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <WhatIfContent />
        </Suspense>
      </div>
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
