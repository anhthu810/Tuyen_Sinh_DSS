"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, GitBranch } from "lucide-react";
import { FormulaTooltip } from "@/components/dss/formula-tooltip";
import { formatPct, formatVndShort } from "@/lib/format";
import { buildWhatIfInsights, type CoreInsightTone } from "@/lib/dss/insights";
import {
  BASELINE_PARAMS,
  WHAT_IF_PRESETS,
  buildSensitivitySeries,
  computeBaselineAvgScore,
  simulateWhatIf,
  type CutoffScope,
  type WhatIfDataset,
  type WhatIfParams,
} from "@/lib/dss/what-if";
import { cn } from "@/lib/utils";
import { WhatIfCharts } from "./what-if-charts";

const ALL_UNIS = [
  { code: "BKA", short: "HUST" },
  { code: "KHA", short: "NEU" },
  { code: "YHB", short: "HMU" },
  { code: "SPH", short: "HNUE" },
  { code: "DCN", short: "HaUI" },
  { code: "TLA", short: "TLU" },
  { code: "HVN", short: "VNUA" },
];

const SCOPE_TO_UNIS: Record<CutoffScope, string[]> = {
  hust_neu: ["BKA", "KHA"],
  top1: ["BKA", "KHA", "YHB"],
  all: ALL_UNIS.map((u) => u.code),
};

const SOFT_BADGE: Record<CoreInsightTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

function fmtSigned(n: number, suffix = "", digits = 1): string {
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return `0${suffix}`;
  const str =
    digits === 0 ? String(Math.round(rounded)) : rounded.toFixed(digits).replace(".", ",");
  return `${rounded > 0 ? "+" : ""}${str}${suffix}`;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

function detectPresetId(params: WhatIfParams, checkedUnis: string[]): string {
  const match = WHAT_IF_PRESETS.find((p) => {
    const presetUnis = p.params.cutoffDelta === 0 ? [] : SCOPE_TO_UNIS[p.params.cutoffScope];
    return (
      p.params.scoreBonus === params.scoreBonus &&
      p.params.cutoffDelta === params.cutoffDelta &&
      p.params.budgetDeltaPct === params.budgetDeltaPct &&
      p.params.costDeltaPct === params.costDeltaPct &&
      sameSet(checkedUnis, presetUnis)
    );
  });
  return match?.id ?? "custom";
}

export function WhatIfSimulator({ dataset }: { dataset: WhatIfDataset }) {
  const baseAvgScore = useMemo(() => computeBaselineAvgScore(dataset), [dataset]);
  const [examScore, setExamScore] = useState<number>(baseAvgScore);
  const [hasExtraExam, setHasExtraExam] = useState<boolean>(false);
  const [extraBonus, setExtraBonus] = useState<number>(1.0);
  const [checkedUnis, setCheckedUnis] = useState<string[]>([]);
  const [params, setParams] = useState<WhatIfParams>({
    ...BASELINE_PARAMS,
    affectedUniversities: [],
    cohortYear: "all",
  });

  const effectiveScoreBonus =
    Number((examScore - baseAvgScore).toFixed(2)) + (hasExtraExam ? extraBonus : 0);

  const effectiveParams: WhatIfParams = useMemo(
    () => ({
      ...params,
      scoreBonus: effectiveScoreBonus,
      affectedUniversities: checkedUnis,
    }),
    [params, effectiveScoreBonus, checkedUnis],
  );

  const baseline = useMemo(
    () =>
      simulateWhatIf(dataset, {
        ...BASELINE_PARAMS,
        affectedUniversities: [],
        cohortYear: params.cohortYear,
      }),
    [dataset, params.cohortYear],
  );

  const scenario = useMemo(
    () => simulateWhatIf(dataset, effectiveParams),
    [dataset, effectiveParams],
  );

  const { scoreCurve, budgetCurve } = useMemo(
    () => buildSensitivitySeries(dataset, effectiveParams),
    [dataset, effectiveParams],
  );

  const presetId = detectPresetId(effectiveParams, checkedUnis);

  const whatIfInsights = useMemo(
    () => buildWhatIfInsights({ params: effectiveParams, baseline, scenario }),
    [effectiveParams, baseline, scenario],
  );

  function applyPreset(id: string) {
    const found = WHAT_IF_PRESETS.find((p) => p.id === id);
    if (!found) return;
    const unis = found.params.cutoffDelta === 0 ? [] : SCOPE_TO_UNIS[found.params.cutoffScope];
    setCheckedUnis(unis);
    setExamScore(baseAvgScore);
    if (found.params.scoreBonus > 0) {
      setHasExtraExam(true);
      setExtraBonus(Math.min(1.5, Math.max(0.5, found.params.scoreBonus)));
    } else {
      setHasExtraExam(false);
      setExtraBonus(1.0);
    }
    setParams((prev) => ({
      ...found.params,
      affectedUniversities: unis,
      cohortYear: prev.cohortYear,
    }));
  }

  function toggleUni(code: string) {
    setCheckedUnis((prev) => {
      const exists = prev.includes(code);
      const next = exists ? prev.filter((c) => c !== code) : [...prev, code];
      const nextDelta = next.length === 0 ? 0 : params.cutoffDelta === 0 ? 1.0 : params.cutoffDelta;
      setParams((p) => ({ ...p, cutoffDelta: nextDelta, affectedUniversities: next }));
      return next;
    });
  }

  const warnings: string[] = [];
  if (Math.abs(examScore - baseAvgScore) > 3.0) {
    warnings.push(
      `⚠ Điểm thi giả lập (${examScore.toFixed(2).replace(".", ",")}đ) lệch ${fmtSigned(examScore - baseAvgScore, "đ", 2)} so với trung bình mẫu (${baseAvgScore.toFixed(2).replace(".", ",")}đ).`,
    );
  }
  if (Math.abs(params.cutoffDelta) > 2.0 && checkedUnis.length > 0) {
    warnings.push(
      `⚠ Δ điểm chuẩn (${fmtSigned(params.cutoffDelta, "đ", 2)}) vượt ngưỡng giả định thông thường (±2,0đ).`,
    );
  }
  if (params.budgetDeltaPct < -25 || params.costDeltaPct > 20) {
    warnings.push(
      `⚠ Biến động tài chính (ngân sách ${fmtSigned(params.budgetDeltaPct, "%", 0)}, học phí ${fmtSigned(params.costDeltaPct, "%", 0)}) ngoài vùng ổn định.`,
    );
  }
  if (scenario.k07Pct != null && scenario.k07Pct > 50) {
    warnings.push(
      `⚠ K07 đạt ${formatPct(scenario.k07Pct)} — vượt ngưỡng báo động 50% HS trúng tuyển quá tải ngân sách.`,
    );
  }

  const k01Diff = scenario.k01Pct - baseline.k01Pct;
  const nv1Diff = scenario.nv1Pct - baseline.nv1Pct;
  const totalAdmDiff = scenario.admittedTotalPct - baseline.admittedTotalPct;
  const k07Diff =
    scenario.k07Pct != null && baseline.k07Pct != null
      ? scenario.k07Pct - baseline.k07Pct
      : null;
  const k06Diff =
    scenario.k06AvgCostVnd != null && baseline.k06AvgCostVnd != null
      ? scenario.k06AvgCostVnd - baseline.k06AvgCostVnd
      : null;

  const baseUniMap = new Map(baseline.byUniversity.map((u) => [u.university_code, u]));
  const scenUniMap = new Map(scenario.byUniversity.map((u) => [u.university_code, u]));

  const tiles = [
    {
      label: "K01 · Đỗ NV1–NV3",
      value: formatPct(scenario.k01Pct),
      sub: `Cơ sở: ${formatPct(baseline.k01Pct)} (${fmtSigned(k01Diff, "%")})`,
      formula: "COUNT(HS đỗ NV ≤ 3) / COUNT(Tổng HS) × 100%",
      threshold: "≥ 65% Tốt · 55–64% Lưu ý · < 55% Rủi ro",
      border:
        scenario.k01Pct >= 65
          ? "border-l-4 border-l-emerald-600"
          : scenario.k01Pct >= 55
            ? "border-l-4 border-l-amber-500"
            : "border-l-4 border-l-rose-600",
    },
    {
      label: "Đỗ đúng NV1",
      value: formatPct(scenario.nv1Pct),
      sub: `${scenario.admittedNv1Count}/${scenario.totalStudents} HS (${fmtSigned(nv1Diff, "%")})`,
      formula: "COUNT(HS đỗ NV1) / COUNT(Tổng HS) × 100%",
      threshold: "Tỷ lệ đỗ nguyện vọng ưu tiên 1",
      border:
        nv1Diff > 0
          ? "border-l-4 border-l-emerald-600"
          : nv1Diff < 0
            ? "border-l-4 border-l-amber-500"
            : "border-l-4 border-l-slate-300",
    },
    {
      label: "Trúng tuyển chung",
      value: formatPct(scenario.admittedTotalPct),
      sub: `${scenario.admittedTotalCount}/${scenario.totalStudents} HS (${scenario.admittedFallbackCount} nhờ NV4+)`,
      formula: "COUNT(HS đỗ ít nhất 1 NV) / COUNT(Tổng HS)",
      threshold: "≥ 88% An toàn nhờ NV lót",
      border:
        scenario.admittedTotalPct >= 88
          ? "border-l-4 border-l-emerald-600"
          : "border-l-4 border-l-amber-500",
    },
    {
      label: "K07 · Vượt ngân sách",
      value: formatPct(scenario.k07Pct),
      sub: `${scenario.overBudgetCount}/${scenario.costEvaluatedCount} HS đỗ (${k07Diff != null ? fmtSigned(k07Diff, "%") : "0%"})`,
      formula: "COUNT(HS đỗ Chi_phí > Ngân_sách × Năm) / HS đỗ",
      threshold: "≤ 35% An toàn · > 50% Báo động",
      border:
        scenario.k07Pct == null
          ? "border-l-4 border-l-slate-300"
          : scenario.k07Pct <= 35
            ? "border-l-4 border-l-emerald-600"
            : scenario.k07Pct <= 50
              ? "border-l-4 border-l-amber-500"
              : "border-l-4 border-l-rose-600",
    },
    {
      label: "K06 · Chi phí TB khóa",
      value: formatVndShort(scenario.k06AvgCostVnd),
      sub:
        k06Diff != null && Math.abs(k06Diff) >= 500_000
          ? `${k06Diff > 0 ? "+" : "−"}${formatVndShort(Math.abs(k06Diff))} vs cơ sở`
          : "Không đổi so với cơ sở",
      formula: "AVG(est_total_cost_vnd × (1 + Δchi_phí))",
      threshold: "Chi phí bình quân trên tập HS trúng tuyển",
      border: "border-l-4 border-l-slate-300",
    },
  ];

  return (
    <div className="space-y-6">
      {/* CARD CHÍNH: MẪU KỊCH BẢN WHAT-IF (GIỐNG MẪU CANTEEN) */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#1f5f8b] text-sm font-bold text-white">
            4
          </span>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Kịch bản What-if</h2>
          <span className="rounded-full bg-[#e3eef6] px-2.5 py-0.5 text-xs font-semibold text-[#1f5f8b]">
            Ch4 · Ch5
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Thay đổi giả định để xem khuyến nghị thay đổi thế nào. Kết quả cập nhật cả dashboard bên
          dưới.
        </p>

        {/* Hàng điều khiển 1: Kịch bản có sẵn + Checkbox + Sliders (giống hệt bố cục Canteen) */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-800">
          <label className="flex items-center gap-2">
            <span>Kịch bản có sẵn</span>
            <select
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
              className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-[#1f5f8b]"
            >
              {WHAT_IF_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {presetId === "custom" ? <option value="custom">Tùy chỉnh</option> : null}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span>Điểm thi</span>
            <input
              type="range"
              min={0}
              max={30}
              step={0.25}
              value={examScore}
              onChange={(e) => setExamScore(Number(e.target.value))}
              className="w-32 accent-[#1f5f8b]"
            />
            <b className="min-w-16 tabular-nums">
              {examScore.toFixed(2).replace(".", ",")}đ
            </b>
          </label>

          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={hasExtraExam}
              onChange={(e) => setHasExtraExam(e.target.checked)}
              className="size-4 accent-[#1f5f8b]"
            />
            <span>Bài thi phụ</span>
          </label>

          <label className="flex items-center gap-2">
            <span>Cộng bài phụ</span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={extraBonus}
              onChange={(e) => {
                setHasExtraExam(true);
                setExtraBonus(Number(e.target.value));
              }}
              className="w-24 accent-[#1f5f8b]"
            />
            <b className="min-w-14 tabular-nums text-slate-900">
              {hasExtraExam ? `+${extraBonus.toFixed(1).replace(".", ",")}đ` : "0đ"}
            </b>
          </label>

          <label className="flex items-center gap-2">
            <span>Δ ngân sách</span>
            <input
              type="range"
              min={-40}
              max={40}
              step={5}
              value={params.budgetDeltaPct}
              onChange={(e) =>
                setParams((p) => ({ ...p, budgetDeltaPct: Number(e.target.value) }))
              }
              className="w-28 accent-[#1f5f8b]"
            />
            <b className="min-w-11 tabular-nums">{fmtSigned(params.budgetDeltaPct, "%", 0)}</b>
          </label>

          <label className="flex items-center gap-2">
            <span>Δ học phí</span>
            <input
              type="range"
              min={-20}
              max={30}
              step={5}
              value={params.costDeltaPct}
              onChange={(e) => setParams((p) => ({ ...p, costDeltaPct: Number(e.target.value) }))}
              className="w-24 accent-[#1f5f8b]"
            />
            <b className="min-w-10 tabular-nums">{fmtSigned(params.costDeltaPct, "%", 0)}</b>
          </label>
        </div>

        {/* Hàng điều khiển 2: Checkboxes theo 7 trường (tương tự Mưa theo từng ngày trong Canteen) */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
          <span className="text-slate-500">Tăng điểm chuẩn +1,0đ theo trường:</span>
          {ALL_UNIS.map((u) => {
            const checked = checkedUnis.includes(u.code);
            return (
              <label key={u.code} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleUni(u.code)}
                  className="size-4 accent-[#1f5f8b]"
                />
                <span className="font-medium text-slate-800">{u.short}</span>
              </label>
            );
          })}
        </div>

        {/* Thanh cảnh báo nếu vượt ngưỡng */}
        {warnings.length > 0 ? (
          <div className="mt-4 space-y-1 rounded-lg bg-[#f8e3e3] px-3.5 py-2.5 text-sm text-[#b83a3a]">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Bảng so sánh gọn gàng ngay trong card (giống hệt bảng T2..T6 & Tổng tuần trong ảnh) */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                <th className="px-3 py-2.5">Trường / Chỉ tiêu</th>
                <th className="px-3 py-2.5">Đổi ĐC</th>
                <th className="px-3 py-2.5 text-right">Cơ sở (HS đỗ)</th>
                <th className="px-3 py-2.5 text-right">Kịch bản (HS đỗ)</th>
                <th className="px-3 py-2.5 text-right">Chênh lệch</th>
                <th className="px-3 py-2.5 text-right">Vượt NS (K07)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ALL_UNIS.map((u) => {
                const baseU = baseUniMap.get(u.code);
                const scenU = scenUniMap.get(u.code);
                const isShifted = checkedUnis.includes(u.code) && params.cutoffDelta !== 0;
                const diff = (scenU?.admittedCount ?? 0) - (baseU?.admittedCount ?? 0);
                return (
                  <tr key={u.code} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {u.short}{" "}
                      <span className="text-xs font-normal text-slate-400">({u.code})</span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {isShifted ? fmtSigned(params.cutoffDelta, "đ", 1) : "–"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {baseU?.admittedCount ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">
                      {scenU?.admittedCount ?? 0}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        diff > 0
                          ? "text-emerald-700"
                          : diff < 0
                            ? "text-rose-700"
                            : "text-slate-500",
                      )}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {scenU?.overBudgetCount ?? 0} HS
                    </td>
                  </tr>
                );
              })}

              {/* Các dòng tổng hợp cuối bảng (giống "Tổng tuần" trong ảnh) */}
              <tr className="border-t-2 border-slate-200 bg-slate-50/50 font-semibold text-slate-900">
                <td className="px-3 py-2.5">Tổng trúng tuyển (7 trường)</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {baseline.admittedTotalCount} ({formatPct(baseline.admittedTotalPct)})
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                  {scenario.admittedTotalCount} ({formatPct(scenario.admittedTotalPct)})
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtSigned(scenario.admittedTotalCount - baseline.admittedTotalCount, " HS", 0)} (
                  {fmtSigned(totalAdmDiff, "%")})
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {scenario.overBudgetCount}/{scenario.costEvaluatedCount} HS
                </td>
              </tr>
              <tr className="bg-slate-50/50 font-semibold text-slate-900">
                <td className="px-3 py-2">K01 · Đỗ nhóm mục tiêu (NV1–NV3)</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">
                  {baseline.admittedTop3Count} ({formatPct(baseline.k01Pct)})
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">
                  {scenario.admittedTop3Count} ({formatPct(scenario.k01Pct)})
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtSigned(scenario.admittedTop3Count - baseline.admittedTop3Count, " HS", 0)} (
                  {fmtSigned(k01Diff, "%")})
                </td>
                <td className="px-3 py-2 text-right text-xs font-normal text-slate-500">
                  NV1: {formatPct(scenario.nv1Pct)}
                </td>
              </tr>
              <tr className="bg-slate-50/50 font-semibold text-slate-900">
                <td className="px-3 py-2">K07 · Vượt ngân sách gia đình</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">
                  {baseline.overBudgetCount} ({formatPct(baseline.k07Pct)})
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">
                  {scenario.overBudgetCount} ({formatPct(scenario.k07Pct)})
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtSigned(scenario.overBudgetCount - baseline.overBudgetCount, " HS", 0)} (
                  {k07Diff != null ? fmtSigned(k07Diff, "%") : "0%"})
                </td>
                <td className="px-3 py-2 text-right text-xs font-normal text-slate-500">
                  K06: {formatVndShort(scenario.k06AvgCostVnd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5 TILES TÓM TẮT (GIỐNG STEP 9 CANTEEN) */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", t.border)}
          >
            <div className="flex items-center justify-between gap-1 text-xs text-slate-500">
              <span>{t.label}</span>
              <FormulaTooltip
                title={t.label}
                formula={t.formula}
                threshold={t.threshold}
                source="500 HS · 3.096 NV"
              />
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{t.value}</div>
            <div className="mt-1 text-xs text-slate-500">{t.sub}</div>
          </div>
        ))}
      </section>

      {/* BIỂU ĐỒ TRỰC QUAN (INSIGHT TITLES) */}
      <WhatIfCharts
        baseline={baseline}
        scenario={scenario}
        scoreCurve={scoreCurve}
        budgetCurve={budgetCurve}
      />

      {/* KHUYẾN NGHỊ DSS (IF–THEN) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <GitBranch className="size-4 text-[#1f5f8b]" />
              Khuyến nghị DSS (IF–THEN)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Quy tắc hành động kèm độ tin cậy ước lượng từ 500 học sinh và 3.096 nguyện vọng.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {whatIfInsights.rules.map((r) => (
            <div
              key={r.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 p-4"
            >
              <div className="space-y-2.5">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                    SOFT_BADGE.success,
                  )}
                >
                  Confidence: {r.confidenceLabel} ({r.confidencePct}%)
                </span>

                <div className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase text-slate-500">
                    IF
                  </span>
                  {r.condition}
                </div>

                <div className="flex items-start gap-2 text-sm text-slate-900">
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-[#1f5f8b]" />
                  <div>
                    <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase text-[#1f5f8b]">
                      THEN
                    </span>
                    <span className="font-semibold leading-snug">{r.action}</span>
                  </div>
                </div>
              </div>

              <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Tác động:</span> {r.impact}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
