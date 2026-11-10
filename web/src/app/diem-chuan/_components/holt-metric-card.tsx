import { HOLT_MIN_YEARS } from "@/lib/dss/holt";
import { cn } from "@/lib/utils";

type Props = {
  /** Dự báo Holt năm kế tiếp; null khi chuỗi chưa đủ ≥ 3 năm liên tiếp. */
  forecast: number | null;
  targetYear: number | null;
  mae: number | null;
  nYears: number | null;
  className?: string;
};

/** Thẻ chỉ số Holt: tím khi có dự báo, viền đứt + mờ khi chưa đủ dữ liệu. */
export function HoltMetricCard({ forecast, targetYear, mae, nYears, className }: Props) {
  const hasHoltData = forecast != null;

  if (!hasHoltData) {
    return (
      <div
        aria-disabled="true"
        className={cn(
          "cursor-not-allowed select-none rounded-lg border border-dashed border-muted-foreground/40 bg-muted/40 p-3 opacity-70",
          className,
        )}
      >
        <div className="text-xs text-muted-foreground">Holt (α=0.6, β=0.2)</div>
        <div className="text-xl font-semibold text-muted-foreground">—</div>
        <div className="text-xs text-muted-foreground">
          Chưa đủ dữ liệu (Cần ≥ {HOLT_MIN_YEARS} năm)
          {nYears != null ? ` · hiện có ${nYears} năm` : ""}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-900 dark:bg-purple-950/30", className)}>
      <div className="text-xs text-purple-700 dark:text-purple-300">
        Holt (α=0.6, β=0.2){targetYear != null ? ` · ${targetYear}` : ""}
      </div>
      <div className="text-xl font-semibold tabular-nums text-purple-700 dark:text-purple-300">
        {forecast.toFixed(2)}
      </div>
      <div className="text-xs text-muted-foreground">
        MAE kiểm định: {mae != null ? `±${mae.toFixed(2)}` : "chưa có năm để kiểm định"}
        {nYears != null ? ` · ${nYears} năm dữ liệu` : ""}
      </div>
    </div>
  );
}
