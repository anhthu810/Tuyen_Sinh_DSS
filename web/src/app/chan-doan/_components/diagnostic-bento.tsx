"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  GitBranch,
  Layers,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ConfidenceLevel,
  CoreInsightPoint,
  CoreInsightTone,
  IfThenRule,
} from "@/lib/dss/insights";

const PASTEL_PILL: Record<CoreInsightTone, { cls: string; label: string }> = {
  success: {
    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
    label: "An toàn",
  },
  warning: {
    cls: "bg-amber-50 text-amber-700 border border-amber-200/60",
    label: "Lưu ý",
  },
  danger: {
    cls: "bg-rose-50 text-rose-700 border border-rose-200/60",
    label: "Rủi ro",
  },
  neutral: {
    cls: "bg-slate-100 text-slate-700 border border-slate-200/60",
    label: "Cân bằng",
  },
};

const CONFIDENCE_PASTEL: Record<ConfidenceLevel, string> = {
  Cao: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
  "Trung bình": "bg-amber-50 text-amber-700 border border-amber-200/60",
  Thấp: "bg-rose-50 text-rose-700 border border-rose-200/60",
};

const COL_ICONS = [Layers, ShieldAlert, Scale];

/**
 * Hàng 1: Key Insight Banner nằm ngang dạng Bento Grid 3 cột bằng nhau.
 */
export function KeyInsightBanner({
  points,
  bottlenecks,
}: {
  points: [CoreInsightPoint, CoreInsightPoint, CoreInsightPoint];
  bottlenecks: string[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Sparkles className="size-3.5 text-indigo-600" />
          Insight &amp; Khuyến nghị cốt lõi
        </div>
        <span className="text-[11px] text-slate-400">
          Tổng hợp 3 trụ cột chẩn đoán hồ sơ
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {points.map((pt, idx) => {
          const Icon = COL_ICONS[idx] ?? Sparkles;
          const badge = PASTEL_PILL[pt.tone];
          return (
            <div key={pt.category} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <Icon className="size-3.5 text-slate-500" />
                    {pt.category}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      badge.cls,
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="mt-2.5 text-sm font-semibold leading-snug text-slate-900">
                  {pt.headline}
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{pt.detail}</p>
            </div>
          );
        })}
      </div>

      {bottlenecks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Điểm nghẽn mô hình:</span>
          {bottlenecks.map((b, i) => (
            <span
              key={i}
              className="rounded-md border border-slate-200/70 bg-white px-2 py-0.5 text-[11px] text-slate-600"
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hàng 4: Khối Khuyến nghị DSS (IF–THEN) dạng thẻ tương tác có Accordion & Soft Confidence Badge.
 */
export function DiagnosticRecommendations({ rules }: { rules: IfThenRule[] }) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() =>
    rules[0] ? { [rules[0].id]: true } : {},
  );

  if (!rules.length) return null;

  function toggle(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <section className="rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
            <GitBranch className="size-4 text-indigo-600" />
            Khuyến nghị DSS (IF–THEN)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Bấm vào từng thẻ quy tắc để xem tác động dự kiến và căn cứ dữ liệu.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
          {rules.length} luật hành động
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rules.map((r) => {
          const isOpen = Boolean(openIds[r.id]);
          return (
            <div
              key={r.id}
              className="rounded-xl border border-slate-200/70 bg-white transition-colors hover:border-slate-300"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(r.id)}
                className="flex w-full flex-col gap-3 p-4 text-left"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      CONFIDENCE_PASTEL[r.confidenceLabel],
                    )}
                  >
                    Confidence: {r.confidenceLabel} ({r.confidencePct}%)
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-slate-400 transition-transform duration-200",
                      isOpen ? "rotate-180 text-slate-700" : "",
                    )}
                  />
                </div>

                {/* Vế IF nền xám nhạt */}
                <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    IF
                  </span>
                  <span>{r.condition}</span>
                </div>

                {/* Vế THEN nổi bật kèm ArrowRight */}
                <div className="flex items-start gap-2 text-sm text-slate-900">
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                  <div>
                    <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                      THEN
                    </span>
                    <span className="font-semibold leading-snug">{r.action}</span>
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-800">Tác động dự kiến:</span>{" "}
                    {r.impact}
                  </div>
                  <div className="mt-1 text-slate-500">
                    <span className="font-medium text-slate-700">Căn cứ:</span> {r.basis}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

