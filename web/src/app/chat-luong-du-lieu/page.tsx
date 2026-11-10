import { Suspense } from "react";
import { getQualityStats, getRegulationChecks } from "@/lib/queries/quality";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RowCountsTable } from "./_components/row-counts-table";
import { ConfidenceCard } from "./_components/confidence-card";
import { KpiScope } from "./_components/kpi-scope";

export default function ChatLuongDuLieuPage() {
  return (
    <div>
      <PageHeader
        title="Chất lượng & minh bạch dữ liệu"
        description="Độ phủ, độ tin cậy, và nhãn THẬT vs MÔ PHỎNG của từng nguồn."
      />

      <div className="space-y-6">
        <Suspense fallback={<TableSkeleton />}>
          <RowCountsSection />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<ChartSkeleton />}>
            <ConfidenceSection />
          </Suspense>
          <KpiScope />
        </div>

        <Suspense fallback={<TableSkeleton />}>
          <RegulationSection />
        </Suspense>

        <Card>
          <CardHeader>
            <CardTitle>Ghi chú độ phủ</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            ~98,5% ô ngành×năm có điểm chuẩn chính (1273/1292).
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function RowCountsSection() {
  const { rowCounts } = await getQualityStats();
  return <RowCountsTable rowCounts={rowCounts} />;
}

async function ConfidenceSection() {
  const { cutoffConfidence, cutoffScaleUnconfirmed } = await getQualityStats();
  return (
    <ConfidenceCard
      cutoffConfidence={cutoffConfidence}
      cutoffScaleUnconfirmed={cutoffScaleUnconfirmed}
    />
  );
}

async function RegulationSection() {
  const checks = await getRegulationChecks();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kiểm tra theo quy chế tuyển sinh</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {checks == null ? (
          <p className="text-muted-foreground">
            Chưa có view kiểm tra — chạy dss-web-plan/fix/02_method_aware_cutoff.sql.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Quy định</th>
                <th className="py-2 pr-3 font-medium">Kết quả</th>
                <th className="py-2 text-right font-medium">Số dòng</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={`${c.rule_name}-${c.check_result}`} className="border-b last:border-0">
                  <td className="py-2 pr-3">{c.rule_name}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={c.check_result === "OK" ? "success" : "warning"}>
                      {c.check_result}
                    </Badge>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.n_rows.toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return <Skeleton className="h-96 rounded-xl border" />;
}

function ChartSkeleton() {
  return <Skeleton className="h-96 rounded-xl border" />;
}