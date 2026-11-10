import { Suspense } from "react";
import Link from "next/link";
import { getOverviewKpis } from "@/lib/kpi";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  CoreInsightsCallout,
  IfThenRulesCard,
} from "@/components/dss/core-insights-callout";
import { buildExecutiveOverviewInsights } from "@/lib/dss/insights";

export default function OverviewPage() {
  return (
    <div>
      <PageHeader
        title="Tổng quan KPI (Executive Overview)"
        description="6 chỉ số định lượng cốt lõi (quy tắc 7±2) đánh giá hiệu quả trúng tuyển, lợi thế phương thức phụ, sai số dự báo, việc làm và rủi ro tài chính trên 7 trường ĐH Hà Nội · 380 ngành · 500 HS."
        badge="1. Executive · Rê chuột vào biểu tượng ⓘ để xem công thức"
      />

      <Suspense fallback={<KpiGridSkeleton />}>
        <KpiGrid />
      </Suspense>
    </div>
  );
}

async function KpiGrid() {
  const allKpis = await getOverviewKpis();
  // Giữ 6 KPI định lượng trực tiếp theo nguyên tắc chunking 7±2 (5–7 KPI chính).
  const kpis = allKpis.filter((k) => k.code !== "K04");
  const hasData = kpis.some((k) => k.display !== "—");

  const byCode = Object.fromEntries(allKpis.map((k) => [k.code, k.rawValue]));
  const executiveInsights = buildExecutiveOverviewInsights({
    k01: byCode.K01 ?? null,
    k02: byCode.K02 ?? null,
    k03: byCode.K03 ?? null,
    k05: byCode.K05 ?? null,
    k06: byCode.K06 ?? null,
    k07: byCode.K07 ?? null,
  });

  return (
    <div className="space-y-6">
      {!hasData ? (
        <Card>
          <CardContent className="p-5 text-sm">
            Chưa đọc được KPI. Kiểm tra <code>.env.local</code> (NEXT_PUBLIC_SUPABASE_URL /
            NEXT_PUBLIC_SUPABASE_ANON_KEY) và policy RLS đọc công khai.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.code} kpi={k} />
        ))}
      </div>

      <CoreInsightsCallout
        points={executiveInsights.points}
        subtitle="Tổng hợp 500 HS · 3.096 NV"
      />

      <IfThenRulesCard rules={executiveInsights.rules} title="Khuyến nghị DSS" />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>
          KPI <strong>K04 (Tăng trưởng nhu cầu ngành)</strong> được tính chi tiết theo nhóm nghề tại{" "}
          <Link href="/chan-doan" className="font-medium text-primary underline">
            2. Insight &amp; Chẩn đoán
          </Link>
          .
        </span>
        <div className="flex flex-wrap gap-3">
          <Link href="/du-bao" className="font-medium text-primary underline">
            3. Dự báo &amp; Độ tin cậy →
          </Link>
          <Link href="/what-if" className="font-medium text-primary underline">
            4. What-if &amp; Khuyến nghị →
          </Link>
        </div>
      </div>
    </div>
  );
}

function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}
