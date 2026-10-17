import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/charts/chart-card";
import { getEmployment, getLaborDemand } from "@/lib/queries/employment";
import { getIndustryGroups, getUniversities } from "@/lib/queries/filters";
import { FilterControls } from "./_components/filter-controls";
import { EmploymentChart } from "./_components/employment-chart";
import { LaborDemandPanel } from "./_components/labor-demand-panel";

type SearchParams = Promise<{ university?: string; industry?: string }>;

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits).replace(".", ",")}%`;
}

export default function ViecLamPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader
        title="Cơ hội việc làm"
        description="Tỷ lệ việc làm sau 1 năm (K05) và nhu cầu tuyển dụng theo nhóm nghề (K04)."
        badge="Nguồn: fact_employment · fact_labor_demand"
      />

      <Suspense fallback={<FilterSkeleton />}>
        <FiltersBar searchParams={searchParams} />
      </Suspense>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Phần A – Tỷ lệ việc làm</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Tỷ lệ có việc làm sau 1 năm tốt nghiệp (K05) và top ~15 ngành theo tỷ lệ cao nhất.
        </p>
        <Suspense fallback={<PanelSkeleton />}>
          <EmploymentSection searchParams={searchParams} />
        </Suspense>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Phần B – Nhu cầu nhân lực</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Nhu cầu tuyển dụng theo nhóm nghề (K04) và tăng trưởng so với năm trước (YoY).
        </p>
        <Suspense fallback={<PanelSkeleton />}>
          <LaborSection searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

function FilterSkeleton() {
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-10 w-56" />
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

async function FiltersBar({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [universities, industryGroups] = await Promise.all([getUniversities(), getIndustryGroups()]);
  return (
    <FilterControls
      universities={universities}
      industryGroups={industryGroups}
      university={sp.university ?? ""}
      industry={sp.industry ?? ""}
    />
  );
}

async function EmploymentSection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const rows = await getEmployment({
    universityCode: sp.university || undefined,
    industryGroup: sp.industry || undefined,
  });

  if (!rows.length) {
    return (
      <EmptyState
        title="Chưa có dữ liệu việc làm"
        description="Không có dòng fact_employment khớp bộ lọc (trường / nhóm nghề). Thử bỏ bộ lọc."
      />
    );
  }

  const rates = rows
    .map((r) => r.employment_rate_pct)
    .filter((v): v is number => v != null);
  const k05 = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const k05Tone = k05 == null ? "neutral" : k05 >= 90 ? "success" : k05 >= 80 ? "warning" : "neutral";

  const sorted = [...rows]
    .filter((r) => r.employment_rate_pct != null)
    .sort((a, b) => (b.employment_rate_pct ?? 0) - (a.employment_rate_pct ?? 0));
  const top = sorted.slice(0, 15);

  const chartData = top.map((r) => ({
    label: r.major_name ?? r.program_label ?? r.program_id,
    rate: r.employment_rate_pct ?? 0,
  }));

  const table: ReactNode = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Ngành</th>
            <th className="py-2 pr-4 font-medium">Trường</th>
            <th className="py-2 pr-4 text-right font-medium">Năm TN</th>
            <th className="py-2 pr-4 text-right font-medium">SV tốt nghiệp</th>
            <th className="py-2 pr-4 text-right font-medium">Phản hồi</th>
            <th className="py-2 text-right font-medium">Tỷ lệ việc làm</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r, i) => (
            <tr key={`${r.employment_id}-${i}`} className="border-b last:border-0">
              <td className="py-2 pr-4">{r.major_name ?? "—"}</td>
              <td className="py-2 pr-4">{r.university_code}</td>
              <td className="py-2 pr-4 text-right">{r.graduation_year ?? "—"}</td>
              <td className="py-2 pr-4 text-right">
                {r.n_graduates != null ? r.n_graduates.toLocaleString("vi-VN") : "—"}
              </td>
              <td className="py-2 pr-4 text-right">
                {r.n_responses != null ? r.n_responses.toLocaleString("vi-VN") : "—"}
              </td>
              <td className="py-2 text-right font-medium">{fmtPct(r.employment_rate_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>K05 · Tỷ lệ có việc làm sau 1 năm</CardTitle>
              <CardDescription>
                Trung bình trên {rates.length} dòng dữ liệu việc làm khớp bộ lọc.
              </CardDescription>
            </div>
            <Badge tone={k05Tone}>{k05 == null ? "—" : fmtPct(k05)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">{fmtPct(k05)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ngưỡng tham chiếu: ≥90% là tốt (badge xanh) · 80–90% trung bình · &lt;80% thấp.
          </p>
        </CardContent>
      </Card>

      <ChartCard
        title="Top 15 ngành theo tỷ lệ việc làm sau 1 năm"
        description="Màu theo ngưỡng: ≥90% xanh · 80–90% vàng · &lt;80% đỏ."
        table={table}
      >
        <EmploymentChart data={chartData} />
      </ChartCard>
    </div>
  );
}

async function LaborSection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const demands = await getLaborDemand(sp.industry || undefined);
  return <LaborDemandPanel demands={demands} />;
}