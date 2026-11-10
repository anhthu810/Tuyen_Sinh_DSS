import Link from "next/link";
import {
  FORECAST_STATUS_LABEL,
  METHOD_ACTUAL,
  METHOD_FAMILY_LABEL,
  getForecastSeries,
  isHolt,
  isMa2,
  isNaive,
  seriesMae,
  type ForecastSeries,
} from "@/lib/queries/forecast";
import type { ForecastStatus, MethodFamily } from "@/types/database.types";
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
import { cn } from "@/lib/utils";
import { ForecastChart, type ChartRow } from "./forecast-chart";
import { HoltMetricCard } from "./holt-metric-card";
import { ALL, MODEL_LABEL, type ModelType } from "@/lib/dss/forecast-filter";

const STATUS_TONE: Record<ForecastStatus, "success" | "warning" | "danger" | "neutral"> = {
  OK: "success",
  CAUTION: "warning",
  INSUFFICIENT_HISTORY: "neutral",
  DISCONTINUED: "neutral",
  NOT_FORECASTED: "neutral",
};

const hasForecast = (s: ForecastSeries) => s.status === "OK" || s.status === "CAUTION";

function seriesLabel(s: ForecastSeries): string {
  const combo =
    s.subjectCombination && s.subjectCombination !== "ALL" ? ` · ${s.subjectCombination}` : "";
  return `${s.examType ?? s.admissionMethod}${combo}`;
}

function buildChartData(
  s: ForecastSeries,
  mae: number | null,
  model: ModelType | typeof ALL,
): ChartRow[] {
  const byYear = new Map<number, ChartRow>();
  for (const p of s.points) {
    const row =
      byYear.get(p.target_year) ??
      { year: p.target_year, actual: null, naive: null, ma2: null, holt: null, bandLow: null, bandHigh: null };
    if (p.method === METHOD_ACTUAL) row.actual = p.actual_cutoff;
    else if (isNaive(p.method) && show(model, "NAIVE")) row.naive = p.forecast_cutoff;
    else if (isMa2(p.method) && show(model, "MA2")) row.ma2 = p.forecast_cutoff;
    else if (isHolt(p.method) && show(model, "HOLT")) row.holt = p.forecast_cutoff;
    byYear.set(p.target_year, row);
  }
  const rows = [...byYear.values()].sort((a, b) => a.year - b.year);
  // Dải ±MAE quanh mô hình đang xem (mặc định MA2 khi so sánh cả 3).
  const center = bandModel(model);
  if (mae != null) {
    for (const r of rows) {
      const c = center === "HOLT" ? r.holt : center === "NAIVE" ? r.naive : r.ma2;
      if (c != null) {
        r.bandLow = c - mae;
        r.bandHigh = c + mae;
      }
    }
  }
  return rows;
}

const show = (model: ModelType | typeof ALL, m: ModelType) => model === ALL || model === m;
const bandModel = (model: ModelType | typeof ALL): ModelType => (model === ALL ? "MA2" : model);

const fmt = (v: number | null | undefined) => (v != null ? v.toFixed(2) : "—");

export async function ForecastPanel({
  programId,
  programLabel,
  seriesKey,
  model = ALL,
  linkQuery = "",
  basePath = "/diem-chuan",
}: {
  programId: string;
  programLabel: string;
  seriesKey?: string;
  /** Mô hình đang lọc ở toolbar — chỉ hiển thị mô hình đó; ALL = so sánh cả 3. */
  model?: ModelType | typeof ALL;
  /** Query string của bộ lọc, giữ lại khi đổi chuỗi. */
  linkQuery?: string;
  basePath?: string;
}) {
  const series = await getForecastSeries(programId);

  if (series.length === 0) {
    return (
      <EmptyState
        title="Chưa có dữ liệu điểm chuẩn cho ngành này"
        description="Bảng fact_cutoff_forecast chưa có chuỗi nào cho ngành này."
      />
    );
  }

  const selected =
    series.find((s) => s.key === seriesKey) ?? series.find(hasForecast) ?? series[0];
  const forecastable = hasForecast(selected);
  const mae = seriesMae(selected.points);
  const latestForecastYear = Math.max(
    ...selected.points.filter((p) => p.method !== METHOD_ACTUAL && p.actual_cutoff == null).map((p) => p.target_year),
    -Infinity,
  );
  const nextYearRows = selected.points.filter(
    (p) => p.method !== METHOD_ACTUAL && p.target_year === latestForecastYear,
  );
  const holtNext = nextYearRows.find((p) => isHolt(p.method) && p.forecast_cutoff != null);
  const bandMae = { MA2: mae.ma2, NAIVE: mae.naive, HOLT: mae.holt }[bandModel(model)];
  const data = buildChartData(selected, forecastable ? bandMae : null, model);
  // Holt chỉ có khi chuỗi đủ ≥ 3 năm liên tiếp (ETL không sinh dòng Holt cho chuỗi ngắn hơn).
  const hasHoltData = forecastable && data.some((r) => r.holt != null);
  const scaleLabel = selected.scoreScale != null ? `thang ${selected.scoreScale}` : "thang chưa rõ";

  const latestFcRow = [...data]
    .reverse()
    .find((r) => r.holt != null || r.ma2 != null || r.naive != null);
  const latestFcVal =
    latestFcRow?.holt ?? latestFcRow?.ma2 ?? latestFcRow?.naive ?? null;
  const latestActRow = [...data].reverse().find((r) => r.actual != null);
  const forecastTitle =
    latestFcVal != null && latestFcRow
      ? `${programLabel} (${seriesLabel(selected)}, ${scaleLabel}) dự báo ${latestFcRow.year} ở mức ${latestFcVal.toFixed(2).replace(".", ",")}${forecastable && bandMae != null ? ` — giữ biên an toàn ±${bandMae.toFixed(2).replace(".", ",")}` : ""}`
      : latestActRow?.actual != null
        ? `${programLabel} (${seriesLabel(selected)}, ${scaleLabel}) ghi nhận mức ${latestActRow.actual.toFixed(2).replace(".", ",")} năm ${latestActRow.year}`
        : `${programLabel} — ${seriesLabel(selected)} (${scaleLabel})`;

  const families = [1, 2, 3, 4, 5] as MethodFamily[];

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Năm</th>
            <th className="px-3 py-2 font-medium">Loại</th>
            <th className="px-3 py-2 font-medium">Tổ hợp</th>
            <th className="px-3 py-2 text-right font-medium">Dự báo</th>
            <th className="px-3 py-2 text-right font-medium">Thực tế</th>
            <th className="px-3 py-2 text-right font-medium">|Sai số|</th>
            <th className="px-3 py-2 font-medium">Quy chế</th>
          </tr>
        </thead>
        <tbody>
          {selected.points.map((p) => (
            <tr key={p.forecast_id} className="border-b last:border-0">
              <td className="px-3 py-2">{p.target_year}</td>
              <td className="px-3 py-2">{p.method === METHOD_ACTUAL ? "Thực tế" : p.method}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.subject_combination ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.forecast_cutoff)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.actual_cutoff)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(p.abs_error)}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.regulation_version ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Chọn chuỗi: mỗi phương thức / kỳ thi / thang điểm là một chuỗi riêng */}
      <Card>
        <CardHeader>
          <CardTitle>Chuỗi điểm chuẩn theo phương thức</CardTitle>
          <CardDescription>
            Mỗi phương thức xét tuyển, kỳ thi và thang điểm là một chuỗi riêng — không gộp THPT với
            học bạ, HSA, TSA… và không tự quy đổi chéo thang điểm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {families.map((fam) => {
            const items = series.filter((s) => s.family === fam);
            if (!items.length) return null;
            return (
              <div key={fam} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                <div className="w-56 shrink-0 pt-1 text-xs font-medium text-muted-foreground">
                  {fam}. {METHOD_FAMILY_LABEL[fam]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((s) => (
                    <Link
                      key={s.key}
                      href={`${basePath}?${linkQuery ? `${linkQuery}&` : ""}program=${encodeURIComponent(programId)}&series=${encodeURIComponent(s.key)}#chi-tiet`}
                      scroll={false}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent",
                        s.key === selected.key && "border-primary bg-accent font-medium",
                        !hasForecast(s) && "text-muted-foreground",
                      )}
                      title={s.statusReason ?? undefined}
                    >
                      {seriesLabel(s)}
                      <span className="text-muted-foreground">({s.scoreScale ?? "?"})</span>
                      {s.isPrimary ? <Badge tone="default" className="px-1.5 py-0">chính</Badge> : null}
                      {!hasForecast(s) ? <span aria-hidden>·</span> : null}
                      {!hasForecast(s) ? <span>lịch sử</span> : null}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {seriesLabel(selected)} · {scaleLabel}
            {selected.status ? (
              <Badge tone={STATUS_TONE[selected.status]}>
                {FORECAST_STATUS_LABEL[selected.status]}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            {selected.family ? `${METHOD_FAMILY_LABEL[selected.family]}. ` : ""}
            {selected.statusReason ??
              "Đủ dữ liệu liên tiếp và phương thức còn áp dụng ở năm gần nhất."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {forecastable && nextYearRows.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {nextYearRows
                .filter((p) => !isHolt(p.method))
                .filter((p) => show(model, isNaive(p.method) ? "NAIVE" : "MA2"))
                .map((p) => {
                const m = isNaive(p.method) ? mae.naive : mae.ma2;
                return (
                  <div key={p.forecast_id} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      {p.method} · {p.target_year}
                    </div>
                    <div className="text-xl font-semibold tabular-nums">{fmt(p.forecast_cutoff)}</div>
                    <div className="text-xs text-muted-foreground">
                      MAE kiểm định: {m != null ? `±${m.toFixed(2)}` : "chưa có năm để kiểm định"}
                      {" · "}
                      {p.n_history_years} năm dữ liệu
                    </div>
                  </div>
                );
              })}
              {show(model, "HOLT") ? (
              <HoltMetricCard
                forecast={holtNext?.forecast_cutoff ?? null}
                targetYear={Number.isFinite(latestForecastYear) ? latestForecastYear : null}
                mae={mae.holt}
                nYears={holtNext?.n_history_years ?? nextYearRows[0]?.n_history_years ?? null}
              />
              ) : null}
            </div>
          ) : null}

          {!forecastable ? (
            <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
              Chưa đủ cơ sở dự báo cho chuỗi này — chỉ hiển thị dữ liệu lịch sử.
            </p>
          ) : null}

          {selected.crossesPolicyChange ? (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-warning">
              Dữ liệu dùng để dự báo trải qua nhiều quy chế tuyển sinh (2025 sửa đổi, 2026 quy chế mới).
              Dự báo {Number.isFinite(latestForecastYear) ? latestForecastYear : "năm tới"} giả định
              trường giữ nguyên phương thức — cần đối chiếu đề án tuyển sinh chính thức trước khi chốt.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ChartCard
        title={forecastTitle}
        description={
          !forecastable
            ? "Chỉ dữ liệu thực tế của chuỗi."
            : model === ALL
              ? "Đường liền: thực tế · đường đứt: NAIVE, MA2 và Holt (khi đủ ≥ 3 năm) · vùng nhạt: dải ±MAE quanh MA2."
              : `Đường liền: thực tế · đường đứt: ${MODEL_LABEL[model]} · vùng nhạt: dải ±MAE của mô hình này.`
        }
        table={table}
      >
        <ForecastChart
          data={data}
          mae={forecastable ? bandMae : null}
          bandLabel={bandModel(model) === "HOLT" ? "Holt" : bandModel(model)}
          hasHoltData={hasHoltData}
        />
      </ChartCard>
    </div>
  );
}
