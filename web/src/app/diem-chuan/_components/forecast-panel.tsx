import {
  getForecast,
  getForecastAccuracy,
  type ForecastPoint,
} from "@/lib/queries/forecast";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartCard } from "@/components/charts/chart-card";
import { ForecastChart, type ChartRow } from "./forecast-chart";

function buildChartData(points: ForecastPoint[], mae: number | null): ChartRow[] {
  const byYear = new Map<number, ChartRow>();
  for (const p of points) {
    const row =
      byYear.get(p.target_year) ??
      { year: p.target_year, actual: null, naive: null, ma2: null, bandLow: null, bandHigh: null };
    if (p.actual_cutoff != null) row.actual = p.actual_cutoff;
    const method = (p.method ?? "").toUpperCase();
    if (method.startsWith("NAIVE") && p.forecast_cutoff != null) row.naive = p.forecast_cutoff;
    if (method.startsWith("MA2") && p.forecast_cutoff != null) row.ma2 = p.forecast_cutoff;
    byYear.set(p.target_year, row);
  }
  const rows = [...byYear.values()].sort((a, b) => a.year - b.year);
  if (mae != null) {
    for (const r of rows) {
      if (r.ma2 != null) {
        r.bandLow = r.ma2 - mae;
        r.bandHigh = r.ma2 + mae;
      }
    }
  }
  return rows;
}

function formatNum(v: number | null): string {
  return v != null ? v.toFixed(2) : "—";
}

export async function ForecastPanel({
  programId,
  programLabel,
}: {
  programId: string;
  programLabel: string;
}) {
  const [points, accuracy] = await Promise.all([
    getForecast(programId),
    getForecastAccuracy(),
  ]);
  const acc = accuracy.find((a) => a.programId === programId) ?? null;
  const mae = acc?.mae ?? null;

  if (points.length === 0) {
    return (
      <EmptyState
        title="Chưa có dữ liệu dự báo cho ngành này"
        description="Bảng fact_cutoff_forecast chưa có dòng nào cho ngành này."
      />
    );
  }

  const data = buildChartData(points, mae);

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Năm</th>
            <th className="px-3 py-2 font-medium">Phương pháp</th>
            <th className="px-3 py-2 text-right font-medium">Dự báo</th>
            <th className="px-3 py-2 text-right font-medium">Thực tế</th>
            <th className="px-3 py-2 text-right font-medium">|Sai số|</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.forecast_id} className="border-b last:border-0">
              <td className="px-3 py-2">{p.target_year}</td>
              <td className="px-3 py-2">{p.method ?? "—"}</td>
              <td className="px-3 py-2 text-right">{formatNum(p.forecast_cutoff)}</td>
              <td className="px-3 py-2 text-right">{formatNum(p.actual_cutoff)}</td>
              <td className="px-3 py-2 text-right">{formatNum(p.abs_error)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {mae != null ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Sai số tuyệt đối trung bình (MAE – phương pháp MA2)
              <Badge
                tone={mae <= 1 ? "success" : mae <= 2 ? "warning" : "danger"}
              >
                ±{mae.toFixed(2)} điểm
              </Badge>
            </CardTitle>
            <CardDescription>
              Nên cộng thêm ~{Math.ceil(mae)} điểm làm khoảng an toàn khi chốt nguyện vọng.
            </CardDescription>
          </CardHeader>
          {acc ? (
            <CardContent className="text-sm text-muted-foreground">
              MAE tính trên {acc.n} năm có điểm chuẩn thực tế của ngành này.
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <ChartCard
        title={`Dự báo điểm chuẩn – ${programLabel}`}
        description="Đường liền: điểm chuẩn thực tế · đường đứt: dự báo NAIVE (năm trước) và MA2 (TB 2 năm trước) · vùng phủ nhạt: dải ±MAE quanh MA2."
        table={table}
      >
        <ForecastChart data={data} mae={mae} />
      </ChartCard>
    </div>
  );
}