import { Suspense } from "react";
import { getQualityStats } from "@/lib/queries/quality";
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

function TableSkeleton() {
  return <Skeleton className="h-96 rounded-xl border" />;
}

function ChartSkeleton() {
  return <Skeleton className="h-96 rounded-xl border" />;
}