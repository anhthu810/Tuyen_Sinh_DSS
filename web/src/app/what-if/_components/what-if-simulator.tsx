"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPct, formatVndShort } from "@/lib/format";
import {
  BASELINE_PARAMS,
  WHAT_IF_PRESETS,
  buildSensitivitySeries,
  simulateWhatIf,
  type CutoffScope,
  type WhatIfDataset,
  type WhatIfParams,
} from "@/lib/dss/what-if";
import { WhatIfCharts } from "./what-if-charts";
import {
  CoreInsightsCallout,
  IfThenRulesCard,
} from "@/components/dss/core-insights-callout";
import { FormulaTooltip } from "@/components/dss/formula-tooltip";
import { buildWhatIfInsights } from "@/lib/dss/insights";

const SCOPE_LABELS: Record<CutoffScope, string> = {
  hust_neu: "HUST (BKA) & NEU (KHA)",
  top1: "Nhóm Top 1 (BKA, KHA, YHB)",
  all: "Tất cả 7 trường",
};

function fmtSigned(n: number, suffix = "", digits = 1): string {
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return `0${suffix}`;
  const str = digits === 0 ? String(Math.round(rounded)) : rounded.toFixed(digits).replace(".", ",");
  return `${rounded > 0 ? "+" : ""}${str}${suffix}`;
}

function detectPresetId(params: WhatIfParams): string {
  const match = WHAT_IF_PRESETS.find(
    (p) =>
      p.params.scoreBonus === params.scoreBonus &&
      p.params.cutoffDelta === params.cutoffDelta &&
      p.params.cutoffScope === params.cutoffScope &&
      p.params.quotaDeltaPct === params.quotaDeltaPct &&
      p.params.budgetDeltaPct === params.budgetDeltaPct &&
      p.params.costDeltaPct === params.costDeltaPct,
  );
  return match?.id ?? "custom";
}

export function WhatIfSimulator({ dataset }: { dataset: WhatIfDataset }) {
  const [params, setParams] = useState<WhatIfParams>({
    ...BASELINE_PARAMS,
    cohortYear: "all",
  });

  const cohorts = useMemo(
    () => Array.from(new Set(dataset.students.map((s) => s.cohort_year))).sort((a, b) => a - b),
    [dataset.students],
  );

  const baseline = useMemo(
    () => simulateWhatIf(dataset, { ...BASELINE_PARAMS, cohortYear: params.cohortYear }),
    [dataset, params.cohortYear],
  );

  const scenario = useMemo(() => simulateWhatIf(dataset, params), [dataset, params]);

  const { scoreCurve, budgetCurve } = useMemo(
    () => buildSensitivitySeries(dataset, params),
    [dataset, params],
  );

  const presetId = detectPresetId(params);
  const activePreset = WHAT_IF_PRESETS.find((p) => p.id === presetId) ?? null;

  // Cảnh báo giống mẫu Canteen: vượt phạm vi giả định hoặc chạm ngưỡng báo động KPI
  const warnings: string[] = [];
  if (Math.abs(params.scoreBonus) > 2.0) {
    warnings.push(
      `Biến động điểm xét tuyển (${fmtSigned(params.scoreBonus, "đ", 2)}) nằm ngoài phạm vi hợp lệ (±2,0đ). Kết quả chỉ mang tính tham khảo.`,
    );
  }
  if (Math.abs(params.cutoffDelta) > 2.0) {
    warnings.push(
      `Biến động điểm chuẩn (${fmtSigned(params.cutoffDelta, "đ", 2)}) nằm ngoài phạm vi giả định thông thường (±2,0đ).`,
    );
  }
  if (Math.abs(params.quotaDeltaPct) > 15) {
    warnings.push(
      `Biến động chỉ tiêu (${fmtSigned(params.quotaDeltaPct, "%", 0)}) vượt ngưỡng ±15%; áp lực quy đổi lên điểm chuẩn chỉ mang tính tham khảo.`,
    );
  }
  if (params.budgetDeltaPct < -25 || params.costDeltaPct > 20) {
    warnings.push(
      `Biến động tài chính (ngân sách ${fmtSigned(params.budgetDeltaPct, "%", 0)}, chi phí ${fmtSigned(params.costDeltaPct, "%", 0)}) vượt ngưỡng giả định ổn định.`,
    );
  }
  if (scenario.k07Pct != null && scenario.k07Pct > 50) {
    warnings.push(
      `Cảnh báo tài chính: K07 đạt ${formatPct(scenario.k07Pct)} (vượt ngưỡng báo động 50% HS trúng tuyển vượt ngân sách).`,
    );
  }
  if (scenario.k01Pct < 55) {
    warnings.push(
      `Cảnh báo nguyện vọng: K01 giảm còn ${formatPct(scenario.k01Pct)} (< 55%) — cần bổ sung nguyện vọng an toàn hoặc thi thêm chứng chỉ.`,
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

  const tiles = [
    {
      label: "K01 · Đỗ NV1–NV3",
      value: formatPct(scenario.k01Pct),
      sub: `${scenario.admittedTop3Count}/${scenario.totalStudents} HS · ${fmtSigned(k01Diff, "%")} vs cơ sở`,
      formula: "COUNT(HS có NV_đỗ_đầu_tiên ≤ 3) / COUNT(Tổng HS) × 100%",
      threshold: "≥ 65% Tốt · 55–64% Lưu ý · < 55% Rủi ro cao",
      border:
        scenario.k01Pct >= 65
          ? "border-l-4 border-l-success"
          : scenario.k01Pct >= 55
            ? "border-l-4 border-l-warning"
            : "border-l-4 border-l-danger",
    },
    {
      label: "Đỗ đúng NV1",
      value: formatPct(scenario.nv1Pct),
      sub: `${scenario.admittedNv1Count}/${scenario.totalStudents} HS · ${fmtSigned(nv1Diff, "%")} vs cơ sở`,
      formula: "COUNT(HS đỗ ngay tại NV1) / COUNT(Tổng HS) × 100%",
      threshold: "Phản ánh mức khớp nguyện vọng ưu tiên cao nhất",
      border:
        nv1Diff > 0
          ? "border-l-4 border-l-success"
          : nv1Diff < 0
            ? "border-l-4 border-l-warning"
            : "border-l-4 border-l-border",
    },
    {
      label: "Trúng tuyển chung",
      value: formatPct(scenario.admittedTotalPct),
      sub: `${scenario.admittedTotalCount}/${scenario.totalStudents} HS (${scenario.admittedFallbackCount} nhờ NV4+) · ${fmtSigned(totalAdmDiff, "%")}`,
      formula: "COUNT(HS có ít nhất 1 NV đủ điểm) / COUNT(Tổng HS) × 100%",
      threshold: "≥ 88% Bảo toàn suất đỗ nhờ đệm NV lót",
      border:
        scenario.admittedTotalPct >= 88
          ? "border-l-4 border-l-success"
          : "border-l-4 border-l-warning",
    },
    {
      label: "K07 · Vượt ngân sách",
      value: formatPct(scenario.k07Pct),
      sub: `${scenario.overBudgetCount}/${scenario.costEvaluatedCount} HS đỗ · ${k07Diff != null ? fmtSigned(k07Diff, "%") : "—"} vs cơ sở`,
      formula: "COUNT(HS đỗ có Chi_phí_mới > Ngân_sách_mới × Số_năm) / COUNT(HS đỗ) × 100%",
      threshold: "≤ 35% An toàn · 36–50% Lưu ý · > 50% Báo động",
      border:
        scenario.k07Pct == null
          ? "border-l-4 border-l-border"
          : scenario.k07Pct <= 35
            ? "border-l-4 border-l-success"
            : scenario.k07Pct <= 50
              ? "border-l-4 border-l-warning"
              : "border-l-4 border-l-danger",
    },
    {
      label: "K06 · Chi phí TB toàn khóa",
      value: formatVndShort(scenario.k06AvgCostVnd),
      sub:
        k06Diff != null && Math.abs(k06Diff) >= 500_000
          ? `${k06Diff > 0 ? "+" : "−"}${formatVndShort(Math.abs(k06Diff))} vs cơ sở`
          : "Không đổi so với cơ sở",
      formula: "AVG(est_total_cost_vnd × (1 + Δchi_phí)) trên tập HS đỗ",
      threshold: "Đối chiếu với tổng ngân sách 4 năm của gia đình",
      border: "border-l-4 border-l-border",
    },
  ];

  const comparisonRows = [
    {
      metric: "K01 · Tỷ lệ đỗ nhóm mục tiêu (NV1–NV3)",
      scen: `${formatPct(scenario.k01Pct)} (${scenario.admittedTop3Count} HS)`,
      base: `${formatPct(baseline.k01Pct)} (${baseline.admittedTop3Count} HS)`,
      diff: `${fmtSigned(k01Diff, "%")} (${fmtSigned(scenario.admittedTop3Count - baseline.admittedTop3Count, " HS", 0)})`,
      tone: k01Diff > 0 ? "success" : k01Diff < 0 ? "danger" : "neutral",
      note: k01Diff > 0 ? "Mở rộng cơ hội NV mục tiêu" : k01Diff < 0 ? "Bị đẩy xuống NV lót" : "Như cơ sở",
    },
    {
      metric: "Đỗ đúng NV1",
      scen: `${formatPct(scenario.nv1Pct)} (${scenario.admittedNv1Count} HS)`,
      base: `${formatPct(baseline.nv1Pct)} (${baseline.admittedNv1Count} HS)`,
      diff: `${fmtSigned(nv1Diff, "%")} (${fmtSigned(scenario.admittedNv1Count - baseline.admittedNv1Count, " HS", 0)})`,
      tone: nv1Diff > 0 ? "success" : nv1Diff < 0 ? "warning" : "neutral",
      note: "Ưu tiên cao nhất của thí sinh",
    },
    {
      metric: "Đỗ NV lót (NV4 trở đi)",
      scen: `${formatPct(scenario.fallbackPct)} (${scenario.admittedFallbackCount} HS)`,
      base: `${formatPct(baseline.fallbackPct)} (${baseline.admittedFallbackCount} HS)`,
      diff: `${fmtSigned(scenario.fallbackPct - baseline.fallbackPct, "%")} (${fmtSigned(scenario.admittedFallbackCount - baseline.admittedFallbackCount, " HS", 0)})`,
      tone: "neutral",
      note: "Đệm an toàn khi trượt NV1–NV3",
    },
    {
      metric: "Trúng tuyển chung (mọi NV)",
      scen: `${formatPct(scenario.admittedTotalPct)} (${scenario.admittedTotalCount} HS)`,
      base: `${formatPct(baseline.admittedTotalPct)} (${baseline.admittedTotalCount} HS)`,
      diff: `${fmtSigned(totalAdmDiff, "%")} (${fmtSigned(scenario.admittedTotalCount - baseline.admittedTotalCount, " HS", 0)})`,
      tone: totalAdmDiff >= 0 ? "success" : "warning",
      note: scenario.admittedTotalPct >= 88 ? "Giữ được suất đỗ an toàn" : "Rủi ro trượt toàn bộ tăng",
    },
    {
      metric: "K07 · HS trúng tuyển vượt ngân sách",
      scen: `${formatPct(scenario.k07Pct)} (${scenario.overBudgetCount}/${scenario.costEvaluatedCount} HS)`,
      base: `${formatPct(baseline.k07Pct)} (${baseline.overBudgetCount}/${baseline.costEvaluatedCount} HS)`,
      diff:
        k07Diff != null
          ? `${fmtSigned(k07Diff, "%")} (${fmtSigned(scenario.overBudgetCount - baseline.overBudgetCount, " HS", 0)})`
          : "—",
      tone:
        k07Diff == null || k07Diff === 0
          ? "neutral"
          : k07Diff > 0
            ? (scenario.k07Pct ?? 0) > 50
              ? "danger"
              : "warning"
            : "success",
      note:
        (scenario.k07Pct ?? 0) > 50
          ? "Vượt ngưỡng báo động 50%"
          : "Cần K07 < 100% chi phí/ngân sách ở từng NV",
    },
    {
      metric: "K06 · Chi phí toàn khóa trung bình",
      scen: formatVndShort(scenario.k06AvgCostVnd),
      base: formatVndShort(baseline.k06AvgCostVnd),
      diff:
        k06Diff != null && Math.abs(k06Diff) >= 500_000
          ? `${k06Diff > 0 ? "+" : "−"}${formatVndShort(Math.abs(k06Diff))}`
          : "0 ₫",
      tone: k06Diff != null && k06Diff > 0 ? "warning" : "neutral",
      note: "Tính trên tập HS trúng tuyển",
    },
  ] as const;

  const baseUniMap = new Map(baseline.byUniversity.map((u) => [u.university_code, u]));

  // 3 kịch bản chuẩn (Bước 4) tính trực tiếp trên cohort hiện tại
  const canonicalScenarios = useMemo(() => {
    return WHAT_IF_PRESETS.slice(1, 4).map((p) => ({
      preset: p,
      result: simulateWhatIf(dataset, { ...p.params, cohortYear: params.cohortYear }),
    }));
  }, [dataset, params.cohortYear]);

  const whatIfInsights = useMemo(
    () => buildWhatIfInsights({ params, baseline, scenario }),
    [params, baseline, scenario],
  );

  const topUni = [...scenario.byUniversity].sort(
    (a, b) => b.admittedCount - a.admittedCount,
  )[0];

  function applyPreset(id: string) {
    const found = WHAT_IF_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setParams((prev) => ({ ...found.params, cohortYear: prev.cohortYear }));
  }

  function resetToBase() {
    setParams((prev) => ({ ...BASELINE_PARAMS, cohortYear: prev.cohortYear }));
  }

  return (
    <div className="space-y-6">
      {/* 0. Insight & Khuyến nghị cốt lõi ngay đầu trang */}
      <CoreInsightsCallout
        points={whatIfInsights.points}
        subtitle={activePreset ? activePreset.label : "Kịch bản tùy chỉnh"}
      />

      {/* 1. Bộ điều khiển What-if (giống #s8 mẫu Canteen) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Thiết lập kịch bản What-if</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Chọn kịch bản có sẵn hoặc kéo thanh trượt để thay đổi giả định. Mọi KPI và biểu đồ
                tính lại ngay lập tức trên {scenario.totalStudents} học sinh.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={resetToBase}>
              <RotateCcw className="size-3.5" />
              Đặt lại cơ sở
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Kịch bản có sẵn</span>
              <select
                value={presetId}
                onChange={(e) => applyPreset(e.target.value)}
                className="h-9 rounded-md border bg-background px-2.5 text-sm"
              >
                {WHAT_IF_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {presetId === "custom" ? (
                  <option value="custom">Tùy chỉnh theo thanh trượt</option>
                ) : null}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Phạm vi biến động điểm chuẩn</span>
              <select
                value={params.cutoffScope}
                onChange={(e) =>
                  setParams((p) => ({ ...p, cutoffScope: e.target.value as CutoffScope }))
                }
                className="h-9 rounded-md border bg-background px-2.5 text-sm"
              >
                {Object.entries(SCOPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Khóa tuyển sinh</span>
              <select
                value={String(params.cohortYear)}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    cohortYear: e.target.value === "all" ? "all" : Number(e.target.value),
                  }))
                }
                className="h-9 rounded-md border bg-background px-2.5 text-sm"
              >
                <option value="all">Tất cả khóa ({dataset.students.length} HS)</option>
                {cohorts.map((y) => (
                  <option key={y} value={y}>
                    Khóa {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Δ điểm thi / bài phụ</span>
                <span className="font-semibold tabular-nums">
                  {fmtSigned(params.scoreBonus, "đ", 2)}
                </span>
              </div>
              <input
                type="range"
                min={-2}
                max={3}
                step={0.25}
                value={params.scoreBonus}
                onChange={(e) =>
                  setParams((p) => ({ ...p, scoreBonus: Number(e.target.value) }))
                }
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                TSA / HSA / IELTS quy đổi (−2,0 → +3,0đ)
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Δ điểm chuẩn</span>
                <span className="font-semibold tabular-nums">
                  {fmtSigned(params.cutoffDelta, "đ", 2)}
                </span>
              </div>
              <input
                type="range"
                min={-2}
                max={3}
                step={0.25}
                value={params.cutoffDelta}
                onChange={(e) =>
                  setParams((p) => ({ ...p, cutoffDelta: Number(e.target.value) }))
                }
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Áp dụng: {SCOPE_LABELS[params.cutoffScope]}
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Δ chỉ tiêu tuyển sinh</span>
                <span className="font-semibold tabular-nums">
                  {fmtSigned(params.quotaDeltaPct, "%", 0)}
                </span>
              </div>
              <input
                type="range"
                min={-20}
                max={20}
                step={5}
                value={params.quotaDeltaPct}
                onChange={(e) =>
                  setParams((p) => ({ ...p, quotaDeltaPct: Number(e.target.value) }))
                }
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Giảm 10% chỉ tiêu ≈ +0,25đ cạnh tranh
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Δ ngân sách gia đình</span>
                <span className="font-semibold tabular-nums">
                  {fmtSigned(params.budgetDeltaPct, "%", 0)}
                </span>
              </div>
              <input
                type="range"
                min={-40}
                max={40}
                step={5}
                value={params.budgetDeltaPct}
                onChange={(e) =>
                  setParams((p) => ({ ...p, budgetDeltaPct: Number(e.target.value) }))
                }
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Sức chi trả/năm (−40% → +40%)
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Δ học phí &amp; sinh hoạt</span>
                <span className="font-semibold tabular-nums">
                  {fmtSigned(params.costDeltaPct, "%", 0)}
                </span>
              </div>
              <input
                type="range"
                min={-20}
                max={30}
                step={5}
                value={params.costDeltaPct}
                onChange={(e) =>
                  setParams((p) => ({ ...p, costDeltaPct: Number(e.target.value) }))
                }
                className="accent-primary"
              />
              <span className="text-xs text-muted-foreground">
                Tổng chi phí toàn khóa (−20% → +30%)
              </span>
            </label>
          </div>

          {warnings.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
              {warnings.map((msg, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. 5 KPI Tiles (giống .tiles mẫu Canteen) kèm Tooltip công thức */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label} className={t.border}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                <span>{t.label}</span>
                <FormulaTooltip
                  title={t.label}
                  formula={t.formula}
                  threshold={t.threshold}
                  source="500 HS · 3.096 NV"
                />
              </div>
              <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{t.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 3. Bảng so sánh Kịch bản vs Cơ sở (#wi) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Kịch bản đưa K01 đạt {formatPct(scenario.k01Pct)} ({fmtSigned(k01Diff, "%")} vs cơ sở)
            và giữ K07 ở mức {formatPct(scenario.k07Pct)}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Chỉ tiêu</th>
                <th className="py-2 px-3 text-right">Kịch bản</th>
                <th className="py-2 px-3 text-right">Cơ sở</th>
                <th className="py-2 px-3 text-right">Chênh lệch</th>
                <th className="py-2 pl-3">Ý nghĩa</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.metric} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{row.metric}</td>
                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{row.scen}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">
                    {row.base}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    <Badge tone={row.tone}>{row.diff}</Badge>
                  </td>
                  <td className="py-2.5 pl-3 text-xs text-muted-foreground">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 4. Biểu đồ so sánh & đường cong độ nhạy */}
      <WhatIfCharts
        baseline={baseline}
        scenario={scenario}
        scoreCurve={scoreCurve}
        budgetCurve={budgetCurve}
      />

      {/* 5. Tác động theo 7 trường & Chuỗi suy diễn kịch bản */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {topUni
                ? `${topUni.label} dẫn đầu với ${topUni.admittedCount}/${scenario.admittedTotalCount} HS trúng tuyển (${topUni.overBudgetCount} HS vượt ngân sách)`
                : "Phân bố trúng tuyển theo 7 trường"}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Trường</th>
                  <th className="py-2 px-3 text-right">Cơ sở</th>
                  <th className="py-2 px-3 text-right">Kịch bản</th>
                  <th className="py-2 px-3 text-right">Chênh lệch</th>
                  <th className="py-2 pl-3 text-right">Vượt ngân sách</th>
                </tr>
              </thead>
              <tbody>
                {scenario.byUniversity.map((u) => {
                  const b = baseUniMap.get(u.university_code);
                  const diff = u.admittedCount - (b?.admittedCount ?? 0);
                  return (
                    <tr key={u.university_code} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{u.label}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                        {b?.admittedCount ?? 0}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums">
                        {u.admittedCount}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {diff === 0 ? "0" : fmtSigned(diff, "", 0)}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">
                        {u.overBudgetCount} HS
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Chuỗi suy diễn &amp; Công thức mô phỏng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Giả định đang xét
              </div>
              <p className="mt-1">
                {activePreset
                  ? activePreset.assumption
                  : `Điểm HS ${fmtSigned(params.scoreBonus, "đ", 2)}, điểm chuẩn (${SCOPE_LABELS[params.cutoffScope]}) ${fmtSigned(params.cutoffDelta, "đ", 2)}, ngân sách ${fmtSigned(params.budgetDeltaPct, "%", 0)}, chi phí ${fmtSigned(params.costDeltaPct, "%", 0)}.`}
              </p>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="flex gap-2 rounded-md border p-2">
                <Badge tone="default">B1</Badge>
                <span>
                  Biên_điểm_mới = best_margin_30 + ({fmtSigned(params.scoreBonus, "", 2)}) −{" "}
                  {params.cutoffDelta !== 0
                    ? `${fmtSigned(params.cutoffDelta, "", 2)} [nếu thuộc ${params.cutoffScope}]`
                    : "0"}{" "}
                  − {params.quotaDeltaPct !== 0 ? `${(-(params.quotaDeltaPct / 10) * 0.25).toFixed(2)} (chỉ tiêu)` : "0"}
                </span>
              </div>
              <div className="flex gap-2 rounded-md border p-2">
                <Badge tone="default">B2</Badge>
                <span>
                  Đủ điều kiện NV: đã tốt nghiệp THPT ∧ Biên_điểm_mới ≥ 0 → chọn NV có thứ tự nhỏ
                  nhất → K01 = {scenario.admittedTop3Count}/{scenario.totalStudents} (
                  {formatPct(scenario.k01Pct)})
                </span>
              </div>
              <div className="flex gap-2 rounded-md border p-2">
                <Badge tone="default">B3</Badge>
                <span>
                  Ngân_sách_mới = Ngân_sách × {(1 + params.budgetDeltaPct / 100).toFixed(2)} ·
                  Chi_phí_mới = Chi_phí × {(1 + params.costDeltaPct / 100).toFixed(2)} → K07 ={" "}
                  {scenario.overBudgetCount}/{scenario.costEvaluatedCount} (
                  {formatPct(scenario.k07Pct)})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 6. Bảng đối chiếu 3 kịch bản chuẩn Bước 4 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Thi bài thi phụ tăng K01 lên {formatPct(canonicalScenarios[0]?.result.k01Pct)}, còn NV
            lót giữ {formatPct(canonicalScenarios[1]?.result.admittedTotalPct)} trúng tuyển khi
            Top 1 tăng +1,0đ
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Kịch bản</th>
                <th className="py-2 px-3">Giả định</th>
                <th className="py-2 px-3 text-right">K01 (NV1–NV3)</th>
                <th className="py-2 px-3 text-right">Trúng tuyển chung</th>
                <th className="py-2 px-3 text-right">K07 (Vượt NS)</th>
                <th className="py-2 pl-3 text-right">Thử nhanh</th>
              </tr>
            </thead>
            <tbody>
              {canonicalScenarios.map(({ preset, result }) => (
                <tr key={preset.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{preset.label}</td>
                  <td className="py-2.5 px-3 text-xs text-muted-foreground">
                    {preset.assumption}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatPct(result.k01Pct)} ({result.admittedTop3Count}/{result.totalStudents})
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatPct(result.admittedTotalPct)} ({result.admittedTotalCount}/
                    {result.totalStudents})
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatPct(result.k07Pct)} ({result.overBudgetCount}/{result.costEvaluatedCount})
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <Button
                      variant={presetId === preset.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => applyPreset(preset.id)}
                    >
                      {presetId === preset.id ? "Đang chọn" : "Áp dụng"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {/* 7. Khuyến nghị DSS (IF–THEN & Confidence) */}
      <IfThenRulesCard rules={whatIfInsights.rules} title="Khuyến nghị DSS" />
    </div>
  );
}

