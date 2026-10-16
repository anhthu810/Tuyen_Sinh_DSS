"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { chartPalette } from "@/components/charts/palette";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { FactLaborDemand } from "@/types/database.types";

type MetricSeries = {
  metric: string;
  unit: string | null;
  points: { year: number | null; value: number | null; note: string | null }[];
};

type IndustryGroupData = {
  industry: string;
  metrics: MetricSeries[];
};

type GrowthItem = {
  label: string;
  growth: number;
  from: number;
  to: number;
  year: number | null;
  prevYear: number | null;
};

function fmtNum(v: number | null): string {
  return v != null ? v.toLocaleString("vi-VN") : "—";
}

function fmtPct(v: number, withSign = true): string {
  const sign = withSign && v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1).replace(".", ",")}%`;
}

function shorten(s: string, max = 36): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function groupDemands(demands: FactLaborDemand[]): IndustryGroupData[] {
  const byIndustry = new Map<string, Map<string, MetricSeries>>();
  for (const d of demands) {
    const metrics = byIndustry.get(d.industry_group) ?? new Map<string, MetricSeries>();
    byIndustry.set(d.industry_group, metrics);
    const key = d.metric ?? "—";
    const series = metrics.get(key) ?? { metric: key, unit: d.unit, points: [] };
    series.points.push({
      year: d.period_end_year,
      value: d.value,
      note: d.note,
    });
    if (!series.unit && d.unit) series.unit = d.unit;
    metrics.set(key, series);
  }
  return [...byIndustry.entries()].map(([industry, metrics]) => ({
    industry,
    metrics: [...metrics.values()].map((m) => ({
      ...m,
      points: m.points.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
    })),
  }));
}

function computeGrowth(groups: IndustryGroupData[]): GrowthItem[] {
  const items: GrowthItem[] = [];
  for (const g of groups) {
    for (const m of g.metrics) {
      const valid = m.points.filter((p) => p.value != null);
      if (valid.length < 2) continue;
      const prev = valid[valid.length - 2];
      const last = valid[valid.length - 1];
      if (prev.value === 0) continue;
      const growth = ((last.value! - prev.value!) / Math.abs(prev.value!)) * 100;
      items.push({
        label: `${g.industry} – ${m.metric}`,
        growth,
        from: prev.value!,
        to: last.value!,
        year: last.year,
        prevYear: prev.year,
      });
    }
  }
  return items;
}

export function LaborDemandPanel({ demands }: { demands: FactLaborDemand[] }) {
  const groups = useMemo(() => groupDemands(demands), [demands]);
  const growth = useMemo(() => computeGrowth(groups), [groups]);

  if (!demands.length) {
    return (
      <EmptyState
        title="Chưa đủ dữ liệu nhu cầu cho nhóm nghề này"
        description="Không có dòng fact_labor_demand khớp bộ lọc nhóm nghề hiện tại."
      />
    );
  }

  const growthTable: ReactNode = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Nhóm nghề – Chỉ số</th>
            <th className="py-2 pr-4 text-right font-medium">Năm trước</th>
            <th className="py-2 pr-4 text-right font-medium">Năm gần nhất</th>
            <th className="py-2 text-right font-medium">YoY (K04)</th>
          </tr>
        </thead>
        <tbody>
          {growth.map((g, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2 pr-4">{g.label}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground">
                {fmtNum(g.from)} ({g.prevYear ?? "—"})
              </td>
              <td className="py-2 pr-4 text-right font-medium">
                {fmtNum(g.to)} ({g.year ?? "—"})
              </td>
              <td className="py-2 text-right">
                <Badge tone={g.growth >= 0 ? "success" : "danger"}>{fmtPct(g.growth)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const chartHeight = Math.max(240, growth.length * 32 + 40);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.industry}>
            <CardHeader>
              <CardTitle>{g.industry}</CardTitle>
              <CardDescription>Nhu cầu nhân lực theo chỉ số và năm công bố.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.metrics.map((m) =>
                m.points.map((p, i) => (
                  <div
                    key={`${m.metric}-${i}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b last:border-0 pb-2 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{m.metric ?? "—"}</div>
                      {p.note ? (
                        <div className="text-xs text-muted-foreground">{p.note}</div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold">{fmtNum(p.value)}</span>
                      {m.unit ? (
                        <span className="ml-1 text-xs text-muted-foreground">{m.unit}</span>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        Năm {p.year ?? "—"}
                      </div>
                    </div>
                  </div>
                )),
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {growth.length ? (
        <ChartCard
          title="Tăng trưởng nhu cầu tuyển dụng so với năm trước (K04)"
          description="Dương (xanh) là nhu cầu tăng · âm (đỏ) là nhu cầu giảm, tính trên 2 kỳ gần nhất của cùng chỉ số."
          table={growthTable}
        >
          <div style={{ height: chartHeight }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={growth}
                layout="vertical"
                margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
              >
                <CartesianGrid stroke={chartPalette.grid} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={220}
                  tickFormatter={(v: string) => shorten(v)}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [fmtPct(Number(value)), "YoY (K04)"]}
                  labelFormatter={(label) => String(label ?? "")}
                />
                <ReferenceLine x={0} stroke={chartPalette.neutral} />
                <Bar dataKey="growth" radius={[0, 4, 4, 0]} barSize={14}>
                  {growth.map((g, i) => (
                    <Cell
                      key={i}
                      fill={g.growth >= 0 ? chartPalette.positive : chartPalette.negative}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : (
        <EmptyState
          title="Chưa đủ dữ liệu nhu cầu cho nhóm nghề này"
          description="Cần ≥2 kỳ của cùng một chỉ số để tính tăng trưởng YoY (K04). Các số liệu đã công bố vẫn hiển thị ở thẻ phía trên."
        />
      )}
    </div>
  );
}