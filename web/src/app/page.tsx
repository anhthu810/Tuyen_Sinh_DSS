import { Suspense } from "react";
import { getOverviewKpis } from "@/lib/kpi";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function OverviewPage() {
  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="7 KPI chủ chốt (K01–K07) cho 4 câu hỏi quyết định — tính trực tiếp từ dữ liệu Supabase (7 trường ĐH Hà Nội · 380 ngành · 500 HS mô phỏng · 2023–2026)."
        badge="Dữ liệu trực tiếp từ Supabase"
      />

      <Suspense fallback={<KpiGridSkeleton />}>
        <KpiGrid />
      </Suspense>

      <p className="mt-6 text-xs text-muted-foreground">
        Lưu ý đơn vị: các KPI tỷ lệ hiển thị dạng phần trăm (K01 = 64,8% nghĩa là 324/500 HS đỗ
        NV1–NV3). K03 là điểm (thang 30), K06 là VND. K04 tính theo từng nhóm nghề ở màn Q3.
      </p>
    </div>
  );
}

async function KpiGrid() {
  const kpis = await getOverviewKpis();
  const hasData = kpis.some((k) => k.display !== "—");

  return (
    <>
      {!hasData ? (
        <Card className="mb-4">
          <CardContent className="p-5 text-sm">
            Chưa đọc được KPI. Kiểm tra <code>.env.local</code> (NEXT_PUBLIC_SUPABASE_URL /
            NEXT_PUBLIC_SUPABASE_ANON_KEY) và policy RLS đọc công khai.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.code} kpi={k} />
        ))}
      </div>
    </>
  );
}

function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-xl border bg-muted/40"
        />
      ))}
    </div>
  );
}
