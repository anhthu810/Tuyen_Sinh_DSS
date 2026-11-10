import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FORECAST_STATUS_LABEL } from "@/lib/queries/forecast";
import type { SeriesSummary } from "@/lib/queries/forecast-search";
import {
  ALL,
  METHOD_GROUP_SHORT,
  MODEL_LABEL,
  MODEL_TYPES,
  type ModelType,
} from "@/lib/dss/forecast-filter";
import { cn } from "@/lib/utils";

const MAX_ROWS = 100;
const fmt = (v: number | null) => (v != null ? v.toFixed(2) : "—");

const MODEL_COL: Record<ModelType, string> = { MA2: "MA2", NAIVE: "NAIVE", HOLT: "Holt" };

/** Danh sách chuỗi khớp bộ lọc — bấm một dòng để xem biểu đồ chi tiết bên dưới. */
export function ForecastResults({
  series,
  linkQuery,
  selectedKey,
  modelType,
  basePath = "/diem-chuan",
}: {
  series: SeriesSummary[];
  /** Query string của bộ lọc hiện tại, giữ lại khi chọn dòng. */
  linkQuery: string;
  selectedKey: string | null;
  modelType: ModelType | typeof ALL;
  basePath?: string;
}) {
  const models = modelType === ALL ? MODEL_TYPES : [modelType];
  const shown = series.slice(0, MAX_ROWS);
  const targetYear = series.find((s) => s.targetYear != null)?.targetYear ?? null;
  const holtCount = series.filter((s) => s.forecasts.HOLT != null).length;
  const href = (s: SeriesSummary) =>
    `${basePath}?${linkQuery ? `${linkQuery}&` : ""}program=${encodeURIComponent(s.programId)}&series=${encodeURIComponent(s.seriesKey)}#chi-tiet`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {series.length.toLocaleString("vi-VN")} chuỗi điểm chuẩn khớp bộ lọc ({holtCount} chuỗi
          đủ ≥ 3 năm tính Holt)
        </CardTitle>
        <CardDescription>
          Mỗi dòng là một chuỗi riêng (trường + ngành + phương thức + tổ hợp + thang gốc). Điểm giữ nguyên
          thang gốc — không quy đổi chéo.{" "}
          {series.length > MAX_ROWS
            ? `Hiển thị ${MAX_ROWS}/${series.length.toLocaleString("vi-VN")} chuỗi — thu hẹp bộ lọc để xem thêm.`
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Trường</th>
                <th className="px-3 py-2 font-medium">Ngành</th>
                <th className="px-3 py-2 font-medium">Phương thức</th>
                <th className="px-3 py-2 text-right font-medium">Thang</th>
                <th className="px-3 py-2 text-right font-medium">Thực tế gần nhất</th>
                {models.map((m) => (
                  <th
                    key={m}
                    className={cn("px-3 py-2 text-right font-medium", m === "HOLT" && "text-purple-700 dark:text-purple-300")}
                    title={MODEL_LABEL[m]}
                  >
                    {MODEL_COL[m]}
                    {targetYear ? ` ${targetYear}` : ""}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const active = s.seriesKey === selectedKey;
                return (
                  <tr
                    key={s.seriesKey}
                    className={cn("border-b last:border-0 hover:bg-muted/60", active && "bg-accent")}
                    aria-current={active ? "true" : undefined}
                  >
                    <td className="px-3 py-2 font-medium">{s.schoolName ?? s.schoolCode}</td>
                    <td className="max-w-64 px-3 py-2">
                      <Link href={href(s)} scroll={false} className="block hover:underline">
                        <span className="block truncate font-medium text-foreground">{s.majorName ?? s.programId}</span>
                        <span className="block truncate text-muted-foreground">{s.programId}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1">
                        {s.methodGroup ? (
                          <Badge tone="neutral" className="px-1.5 py-0">
                            {METHOD_GROUP_SHORT[s.methodGroup]}
                          </Badge>
                        ) : null}
                        <span className="text-muted-foreground">
                          {s.examType ?? s.admissionMethod}
                          {s.subjectCombination && s.subjectCombination !== "ALL" ? ` · ${s.subjectCombination}` : ""}
                        </span>
                        {s.isPrimary ? <Badge tone="default" className="px-1.5 py-0">chính</Badge> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.scoreScale ?? "?"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(s.latestActual)}
                      {s.latestYear ? <span className="text-muted-foreground"> ({s.latestYear})</span> : null}
                    </td>
                    {models.map((m) => (
                      <td
                        key={m}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          m === "HOLT" && s.forecasts.HOLT != null && "font-medium text-purple-700 dark:text-purple-300",
                        )}
                        title={s.mae[m] != null ? `MAE kiểm định ±${s.mae[m]!.toFixed(2)}` : undefined}
                      >
                        {fmt(s.forecasts[m])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.status ? FORECAST_STATUS_LABEL[s.status] : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
