import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, GitBranch } from "lucide-react";
import { getExecutiveChartData, getOverviewKpis } from "@/lib/kpi";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { buildExecutiveOverviewInsights } from "@/lib/dss/insights";
import { ExecutiveCharts } from "./_components/executive-charts";

export default function OverviewPage() {
  return (
    <div className="-mx-5 -my-6 min-h-screen bg-slate-50 px-5 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-2 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-white">
                1. Executive Overview
              </span>
              <span className="text-xs text-slate-500">
                7 trường ĐH Hà Nội · 380 ngành · 500 HS · Rê chuột ⓘ để xem công thức
              </span>
            </div>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
              Tổng quan KPI (Executive Overview)
            </h1>
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-medium">
            <Link href="/chan-doan" className="text-indigo-600 hover:underline">
              2. Chẩn đoán &amp; K04 →
            </Link>
            <Link href="/du-bao" className="text-indigo-600 hover:underline">
              3. Dự báo &amp; Độ tin cậy →
            </Link>
            <Link href="/what-if" className="text-indigo-600 hover:underline">
              4. What-if &amp; Khuyến nghị →
            </Link>
          </div>
        </header>

        <Suspense fallback={<KpiGridSkeleton />}>
          <KpiGrid />
        </Suspense>
      </div>
    </div>
  );
}

async function KpiGrid() {
  const [allKpis, chartData] = await Promise.all([
    getOverviewKpis(),
    getExecutiveChartData(),
  ]);
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

      {/* 1. 6 Thẻ KPI Scorecards tích hợp thanh Bullet/Progress */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.code} kpi={k} />
        ))}
      </div>

      {/* 2. 2 Biểu đồ chuyên sâu (Stacked Horizontal Bar + Ma trận Điểm chuẩn & Học phí 7 trường) */}
      <ExecutiveCharts data={chartData} />

      {/* 3. Khối Khuyến nghị DSS (IF-THEN): 3 Decision Cards nằm ngang ở chân trang */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
            <GitBranch className="size-4 text-indigo-600" />
            Khuyến nghị DSS (IF–THEN)
          </h2>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            3 quyết định điều hành cốt lõi
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {executiveInsights.rules.map((r) => (
            <div
              key={r.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="space-y-2.5">
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  Confidence: {r.confidenceLabel} {r.confidencePct}%
                </span>

                <div className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase text-slate-500">
                    IF
                  </span>
                  {r.condition}
                </div>

                <div className="flex items-start gap-2 text-sm text-slate-900">
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                  <div>
                    <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase text-indigo-600">
                      THEN
                    </span>
                    <span className="font-semibold leading-snug">{r.action}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Tác động:</span> {r.impact}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiGridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl border bg-white" />
        <div className="h-72 animate-pulse rounded-xl border bg-white" />
      </div>
    </div>
  );
}
