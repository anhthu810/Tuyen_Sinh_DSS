import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FormulaTooltip } from "@/components/dss/formula-tooltip";
import { IfThenRulesCard } from "@/components/dss/core-insights-callout";
import { buildForecastInsights } from "@/lib/dss/insights";
import { getForecastAccuracy, getOverallMae } from "@/lib/queries/forecast";
import { getQualityStats } from "@/lib/queries/quality";
import {
  DiemChuanContent,
  type DiemChuanSearchParams,
} from "@/app/diem-chuan/_components/diem-chuan-content";
import { ConfidenceCard } from "@/app/chat-luong-du-lieu/_components/confidence-card";

export default function DuBaoPage({
  searchParams,
}: {
  searchParams: DiemChuanSearchParams;
}) {
  return (
    <div>
      <PageHeader
        title="Dự báo & Độ tin cậy (Forecasting)"
        description="Dự báo điểm chuẩn theo phương thức (MA2 / NAIVE / Holt) kèm biên sai số ±MAE, khoảng tin cậy và kiểm định chất lượng dữ liệu."
        badge="3. Forecasting · Method-aware · Holt / MA2 / NAIVE"
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
  searchParams: DiemChuanSearchParams;
}) {
  const [overallMae, accuracy, quality] = await Promise.all([
    getOverallMae(),
    getForecastAccuracy(),
    getQualityStats(),
  ]);

  const confTotal = Object.values(quality.cutoffConfidence).reduce((a, b) => a + b, 0);
  const highConfPct =
    confTotal > 0 ? ((quality.cutoffConfidence["Cao"] ?? 0) / confTotal) * 100 : 0;

  const rules = buildForecastInsights({
    programLabel: "Hệ thống dự báo đa phương thức (MA2 / Holt)",
    mae: overallMae,
    latestForecast: null,
    highConfidencePct: highConfPct,
    unconfirmedScaleCount: quality.cutoffScaleUnconfirmed,
  });

  return (
    <div className="space-y-5">
      {/* KPI tóm tắt dự báo & độ tin cậy kèm Tooltip công thức */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>K03 · MAE toàn hệ (chuỗi chính MA2)</span>
              <FormulaTooltip
                title="K03 · Sai số tuyệt đối trung bình (MAE)"
                formula="AVG(|Điểm_thực − Dự_báo_MA2|) trên is_primary = true"
                threshold="≤ 1,5đ Tin cậy cao · 1,5–2,5đ Trung bình · > 2,5đ Thấp"
                source="fact_cutoff_forecast"
              />
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {overallMae != null ? `±${overallMae.toFixed(2).replace(".", ",")} điểm` : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Trên {accuracy.length} ngành có chuỗi chính đối chiếu thực tế
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Mô hình dự báo tích hợp</span>
              <FormulaTooltip
                title="NAIVE · MA2 · Holt (α=0,6, β=0,2)"
                formula="Holt kích hoạt khi chuỗi có ≥ 3 năm liên tiếp; giữ nguyên thang điểm gốc"
                source="etl/build_method_forecast.py"
              />
            </div>
            <div className="mt-1 text-2xl font-bold">MA2 · NAIVE · Holt</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Không quy đổi chéo giữa THPT, học bạ, HSA, TSA
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
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Chưa xác nhận thang: {quality.cutoffScaleUnconfirmed.toLocaleString("vi-VN")} dòng
              </span>
              <Link href="/chat-luong-du-lieu" className="font-medium text-primary underline">
                Audit 13 bảng →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bộ lọc phương thức + bảng kết quả + biểu đồ dự báo Holt/MA2/NAIVE */}
      <DiemChuanContent searchParams={searchParams} basePath="/du-bao" />

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
