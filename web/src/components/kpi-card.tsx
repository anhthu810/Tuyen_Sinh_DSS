import Link from "next/link";
import { FormulaTooltip } from "@/components/dss/formula-tooltip";
import type { Kpi, KpiTone } from "@/lib/kpi";
import { cn } from "@/lib/utils";

const TONE_VALUE: Record<KpiTone, string> = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  neutral: "text-slate-900",
};

const TONE_BADGE: Record<KpiTone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

const TONE_BAR: Record<KpiTone, string> = {
  good: "bg-emerald-600",
  warn: "bg-amber-500",
  bad: "bg-rose-600",
  neutral: "bg-indigo-600",
};

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const b = kpi.bullet;
  const fillPct = b ? Math.min(100, Math.max(0, (b.value / b.max) * 100)) : 0;
  const targetPct = b ? Math.min(100, Math.max(0, (b.target / b.max) * 100)) : 0;

  return (
    <Link
      href={`/bao-cao/kpi/${kpi.code}`}
      aria-label={`Xem báo cáo chi tiết ${kpi.code}: ${kpi.name}`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors group-hover:border-slate-300 group-hover:bg-slate-50/40">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {kpi.code} · {kpi.question}
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  TONE_BADGE[kpi.tone],
                )}
              >
                {kpi.tone === "good"
                  ? "Đạt chuẩn"
                  : kpi.tone === "warn"
                    ? "Lưu ý"
                    : kpi.tone === "bad"
                      ? "Cảnh báo"
                      : "Tham chiếu"}
              </span>
              <FormulaTooltip
                title={`${kpi.code} · ${kpi.name}`}
                formula={kpi.formula}
                threshold={kpi.threshold}
                source={kpi.source}
              />
            </div>
          </div>

          <div className={cn("mt-2 text-2xl font-bold tracking-tight tabular-nums", TONE_VALUE[kpi.tone])}>
            {kpi.display}
          </div>
          <div className="mt-1 text-sm font-medium leading-snug text-slate-800">{kpi.name}</div>
        </div>

        {b ? (
          <div className="mt-4 space-y-1.5">
            <div className="relative h-2.5 w-full overflow-visible rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full transition-all", TONE_BAR[kpi.tone])}
                style={{ width: `${fillPct}%` }}
              />
              {/* Vạch đứt mục tiêu / ngưỡng cảnh báo */}
              <div
                title={b.targetLabel}
                style={{ left: `${targetPct}%` }}
                className={cn(
                  "absolute -top-1 bottom-[-4px] w-0 border-l-2 border-dashed",
                  b.invertRisk ? "border-rose-600" : "border-slate-700",
                )}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] tabular-nums text-slate-500">
              <span>0{b.unit}</span>
              <span
                className={cn(
                  "font-medium",
                  b.invertRisk ? "text-rose-700" : "text-slate-700",
                )}
              >
                {b.targetLabel}
              </span>
              <span>
                {b.max}
                {b.unit}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-xs font-medium text-indigo-600">Xem báo cáo chi tiết →</div>
        )}
      </div>
    </Link>
  );
}
