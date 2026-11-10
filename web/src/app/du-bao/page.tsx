import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { FormulaTooltip } from "@/components/dss/formula-tooltip";
import { IfThenRulesCard } from "@/components/dss/core-insights-callout";
import { buildForecastInsights } from "@/lib/dss/insights";
import { getPrograms } from "@/lib/queries/programs";
import { getForecast, getForecastAccuracy } from "@/lib/queries/forecast";
import { getQualityStats } from "@/lib/queries/quality";
import { ProgramPicker } from "@/app/diem-chuan/_components/program-picker";
import { ForecastPanel } from "@/app/diem-chuan/_components/forecast-panel";
import { ConfidenceCard } from "@/app/chat-luong-du-lieu/_components/confidence-card";

export default function DuBaoPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Dự báo & Độ tin cậy (Forecasting)"
        description="Dự báo điểm chuẩn (MA2 / NAIVE) kèm biên sai số ±MAE, khoảng tin cậy mô hình và kiểm định chất lượng dữ liệu."
        badge="3. Forecasting · Khoảng tin cậy ±MAE"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <DuBaoContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DuBaoContent({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const sp = await searchParams;
  const [programs, accuracy, quality] = await Promise.all([
    getPrograms(),
    getForecastAccuracy(),
    getQualityStats(),
  ]);

  if (!programs.length) {
    return (
      <EmptyState
        title="Chưa có dữ liệu ngành học"
        description="Không đọc được danh sách ngành từ dim_program."
      />
    );
  }

  const hasForecast = new Set(accuracy.map((a) => a.programId));
  const defaultProg =
    programs.find((p) => hasForecast.has(p.program_id)) ?? programs[0];
  const programId =
    sp.program && programs.some((p) => p.program_id === sp.program)
      ? sp.program
      : defaultProg.program_id;
  const program = programs.find((p) => p.program_id === programId)!;
  const label = `${program.short_name ?? program.university_code} — ${program.major_name}`;

  const [points] = await Promise.all([getForecast(programId)]);
  const acc = accuracy.find((a) => a.programId === programId) ?? null;
  const mae = acc?.mae ?? null;
  const latestMa2 =
    [...points]
      .filter((p) => (p.method ?? "").toUpperCase().startsWith("MA2") && p.forecast_cutoff != null)
      .sort((a, b) => b.target_year - a.target_year)[0]?.forecast_cutoff ?? null;

  const confTotal = Object.values(quality.cutoffConfidence).reduce((a, b) => a + b, 0);
  const highConfPct =
    confTotal > 0 ? ((quality.cutoffConfidence["Cao"] ?? 0) / confTotal) * 100 : 0;

  const rules = buildForecastInsights({
    programLabel: label,
    mae,
    latestForecast: latestMa2,
    highConfidencePct: highConfPct,
    unconfirmedScaleCount: quality.cutoffScaleUnconfirmed,
  });

  const avgMaeAll = accuracy.length
    ? accuracy.reduce((s, a) => s + a.mae, 0) / accuracy.length
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ProgramPicker
          programs={programs.map((p) => ({
            program_id: p.program_id,
            major_name: p.major_name,
            university_name: p.university_name,
            short_name: p.short_name,
            university_code: p.university_code,
          }))}
          selected={programId}
        />
        <Link
          href="/chat-luong-du-lieu"
          className="text-xs font-medium text-primary underline"
        >
          Xem bảng kiểm định độ phủ 13 bảng dữ liệu →
        </Link>
      </div>

      {/* KPI tóm tắt dự báo & độ tin cậy kèm Tooltip công thức */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>K03 · MAE toàn hệ (MA2)</span>
              <FormulaTooltip
                title="K03 · Sai số tuyệt đối trung bình (MAE)"
                formula="AVG(|Điểm_thực − Dự_báo_MA2|)"
                threshold="≤ 1,5đ Tốt · 1,5–2,5đ Lưu ý · > 2,5đ Rủi ro"
                source="fact_cutoff_forecast"
              />
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {avgMaeAll != null ? `±${avgMaeAll.toFixed(2).replace(".", ",")} điểm` : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Trên {accuracy.length} ngành có kiểm định thực tế
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>MAE ngành đang chọn</span>
              <FormulaTooltip
                title="Biên an toàn khuyến nghị"
                formula="Khoảng an toàn = ⌈MAE_ngành⌉"
                threshold="Nên cộng thêm khoảng này khi đặt NV"
                source="fact_cutoff_forecast"
              />
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {mae != null ? `±${mae.toFixed(2).replace(".", ",")} điểm` : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {mae != null
                ? `Nên giữ biên +${Math.ceil(mae)} điểm khi chốt NV`
                : "Ngành chưa đủ năm đối chiếu thực tế"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Độ tin cậy dữ liệu điểm chuẩn</span>
              <FormulaTooltip
                title="Tỷ lệ bản ghi tin cậy Cao"
                formula="COUNT(confidence = 'Cao') / COUNT(fact_cutoff_score) × 100%"
                threshold="≥ 70% Đáng tin cậy"
                source="fact_cutoff_score"
              />
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {confTotal > 0 ? `${highConfPct.toFixed(1).replace(".", ",")}%` : "0 dòng"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Thang điểm chưa xác nhận: {quality.cutoffScaleUnconfirmed.toLocaleString("vi-VN")} dòng
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dự báo điểm chuẩn + Khoảng tin cậy */}
      <ForecastPanel programId={programId} programLabel={label} />

      {/* Phân bố độ tin cậy */}
      <ConfidenceCard
        cutoffConfidence={quality.cutoffConfidence}
        cutoffScaleUnconfirmed={quality.cutoffScaleUnconfirmed}
      />

      {/* Khuyến nghị DSS */}
      <IfThenRulesCard rules={rules} title="Khuyến nghị DSS" />
    </div>
  );
}

