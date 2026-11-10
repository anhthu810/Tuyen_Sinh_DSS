"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { chartPalette } from "@/components/charts/palette";
import { formatPct } from "@/lib/format";
import type { SensitivityPoint, SimulationResult } from "@/lib/dss/what-if";

export function WhatIfCharts({
  baseline,
  scenario,
  scoreCurve,
  budgetCurve,
}: {
  baseline: SimulationResult;
  scenario: SimulationResult;
  scoreCurve: SensitivityPoint[];
  budgetCurve: SensitivityPoint[];
}) {
  const outcomeData = [
    {
      bucket: "Đỗ NV1",
      "Cơ sở": baseline.admittedNv1Count,
      "Kịch bản": scenario.admittedNv1Count,
    },
    {
      bucket: "Đỗ NV2–NV3",
      "Cơ sở": baseline.admittedNv23Count,
      "Kịch bản": scenario.admittedNv23Count,
    },
    {
      bucket: "Đỗ NV4+ (NV lót)",
      "Cơ sở": baseline.admittedFallbackCount,
      "Kịch bản": scenario.admittedFallbackCount,
    },
    {
      bucket: "Trượt tất cả NV",
      "Cơ sở": baseline.rejectedCount,
      "Kịch bản": scenario.rejectedCount,
    },
  ];

  const outcomeTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Nhóm kết quả</th>
            <th className="py-2 px-3 text-right">Cơ sở (HS)</th>
            <th className="py-2 px-3 text-right">Kịch bản (HS)</th>
            <th className="py-2 pl-3 text-right">Chênh lệch</th>
          </tr>
        </thead>
        <tbody>
          {outcomeData.map((r) => {
            const diff = r["Kịch bản"] - r["Cơ sở"];
            return (
              <tr key={r.bucket} className="border-b last:border-0">
                <td className="py-2 pr-3 font-medium">{r.bucket}</td>
                <td className="py-2 px-3 text-right tabular-nums">{r["Cơ sở"]}</td>
                <td className="py-2 px-3 text-right tabular-nums font-medium">{r["Kịch bản"]}</td>
                <td className="py-2 pl-3 text-right tabular-nums">
                  {diff > 0 ? `+${diff}` : diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const scoreTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Δ điểm HS</th>
            <th className="py-2 px-3 text-right">K01 (NV1–NV3)</th>
            <th className="py-2 px-3 text-right">Đỗ NV1</th>
            <th className="py-2 pl-3 text-right">Trúng tuyển chung</th>
          </tr>
        </thead>
        <tbody>
          {scoreCurve.map((p) => (
            <tr key={p.xLabel} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium">{p.xLabel}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatPct(p.k01Pct)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{formatPct(p.nv1Pct)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">
                {formatPct(p.admittedTotalPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const budgetTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3">Δ ngân sách</th>
            <th className="py-2 pl-3 text-right">K07 (Vượt ngân sách)</th>
          </tr>
        </thead>
        <tbody>
          {budgetCurve.map((p) => (
            <tr key={p.xLabel} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium">{p.xLabel}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{formatPct(p.k07Pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const k01Diff = scenario.k01Pct - baseline.k01Pct;
  const rejectedDiff = scenario.rejectedCount - baseline.rejectedCount;
  const outcomeTitle =
    scenario.admittedTop3Count === baseline.admittedTop3Count &&
    scenario.rejectedCount === baseline.rejectedCount
      ? `${formatPct(baseline.k01Pct)} học sinh (${baseline.admittedTop3Count}/${baseline.totalStudents}) đỗ NV1–NV3, ${baseline.admittedFallbackCount} HS nhờ NV lót và ${baseline.rejectedCount} HS trượt toàn bộ`
      : `Kịch bản làm K01 ${k01Diff >= 0 ? "tăng" : "giảm"} ${formatPct(Math.abs(k01Diff))} lên ${formatPct(scenario.k01Pct)} (${scenario.admittedTop3Count} HS); số trượt ${rejectedDiff <= 0 ? "còn" : "tăng lên"} ${scenario.rejectedCount} HS`;

  const scoreBase = scoreCurve.find((p) => p.xValue === 0);
  const scorePlus1 = scoreCurve.find((p) => p.xValue === 1);
  const scoreMinus1 = scoreCurve.find((p) => p.xValue === -1);
  const scoreTitle =
    scoreBase && scorePlus1 && scoreMinus1
      ? `Cộng +1,0đ nâng K01 từ ${formatPct(scoreBase.k01Pct)} lên ${formatPct(scorePlus1.k01Pct)} (+${formatPct(scorePlus1.k01Pct - scoreBase.k01Pct)}), trong khi hụt −1,0đ kéo xuống ${formatPct(scoreMinus1.k01Pct)}`
      : `Tác động biên điểm từ −2,0đ đến +2,5đ lên tỷ lệ đỗ K01`;

  const budgetBase = budgetCurve.find((p) => p.xValue === 0);
  const budgetDrop20 = budgetCurve.find((p) => p.xValue === -20);
  const budgetTitle =
    budgetBase && budgetDrop20
      ? `Ngân sách giảm 20% đẩy K07 từ ${formatPct(budgetBase.k07Pct)} lên ${formatPct(budgetDrop20.k07Pct)}${budgetDrop20.k07Pct > 50 ? " — vượt ngưỡng báo động 50%" : ""}`
      : `Ngưỡng chịu tải tài chính (K07) khi ngân sách biến động −40% đến +30%`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <ChartCard
          title={outcomeTitle}
          description="So sánh số lượng học sinh theo từng nhóm thứ tự nguyện vọng trúng tuyển (NV1, NV2–NV3, NV4+) và nhóm trượt."
          table={outcomeTable}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomeData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={chartPalette.grid} vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} HS`, ""]} />
                <Legend />
                <Bar
                  dataKey="Cơ sở"
                  fill={chartPalette.naive}
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
                <Bar
                  dataKey="Kịch bản"
                  fill={chartPalette.actual}
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title={scoreTitle}
        description="Quét Δ điểm từ −2,0đ đến +2,5đ (giữ nguyên biến động điểm chuẩn đang chọn)."
        table={scoreTable}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scoreCurve} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={chartPalette.grid} vertical={false} />
              <XAxis dataKey="xLabel" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatPct(Number(v)), ""]} />
              <Legend />
              <ReferenceLine y={65} stroke={chartPalette.positive} strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="k01Pct"
                name="K01 (NV1–NV3)"
                stroke={chartPalette.actual}
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="nv1Pct"
                name="Đỗ NV1"
                stroke={chartPalette.ma2}
                strokeWidth={2}
                dot={{ r: 2.5 }}
              />
              <Line
                type="monotone"
                dataKey="admittedTotalPct"
                name="Trúng tuyển chung"
                stroke={chartPalette.positive}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title={budgetTitle}
        description="Tỷ lệ HS trúng tuyển vượt ngân sách khi thu nhập/ngân sách biến động (−40% → +30%)."
        table={budgetTable}
      >
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={budgetCurve} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={chartPalette.grid} vertical={false} />
              <XAxis dataKey="xLabel" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [formatPct(Number(v)), "K07 vượt ngân sách"]} />
              <Legend />
              <ReferenceLine
                y={50}
                stroke={chartPalette.negative}
                strokeDasharray="3 3"
                label={{ value: "Báo động 50%", position: "insideTopRight", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="k07Pct"
                name="K07 Vượt ngân sách"
                stroke={chartPalette.warning}
                strokeWidth={2.5}
                dot={{ r: 3.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

