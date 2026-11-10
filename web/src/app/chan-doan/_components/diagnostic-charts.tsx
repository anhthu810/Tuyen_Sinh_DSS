"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { chartPalette } from "@/components/charts/palette";
import { formatPct, formatVndShort } from "@/lib/format";
import { BUCKET_LABEL, type Bucket } from "@/lib/dss/recommend";

export type DiagnosticNvDatum = {
  nvLabel: string;
  programId: string;
  majorName: string;
  university: string;
  bucket: Bucket | null;
  margin30: number | null;
  admitProbPct: number;
  affordabilityPct: number | null;
  estTotalCostVnd: number | null;
  employmentRatePct: number | null;
};

function statusColor(bucket: Bucket | null): string {
  if (bucket === "safety") return chartPalette.positive;
  if (bucket === "match") return chartPalette.warning;
  if (bucket === "reach") return chartPalette.negative;
  return chartPalette.neutral;
}

function BentoChartShell({
  title,
  description,
  table,
  children,
}: {
  title: string;
  description: string;
  table: ReactNode;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug tracking-tight text-slate-900">
            {title}
          </h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          {showTable ? "Biểu đồ" : "Bảng"}
        </button>
      </div>
      <div className="mt-4 flex-1">{showTable ? table : children}</div>
    </div>
  );
}

export function DiagnosticCharts({
  items,
  probAnyPct,
}: {
  items: DiagnosticNvDatum[];
  probAnyPct: number;
}) {
  const counts: Record<Bucket, number> = { reach: 0, match: 0, safety: 0 };
  items.forEach((it) => {
    if (it.bucket) counts[it.bucket]++;
  });

  const bucketTitle = `Chiến lược ${counts.reach} Với / ${counts.match} Vừa / ${counts.safety} Chắc đỗ đạt ${Math.round(probAnyPct)}% xác suất trúng tuyển`;

  const bucketData = items.map((it) => ({
    name: `${it.nvLabel} · ${it.university}`,
    major: it.majorName,
    prob: it.admitProbPct,
    bucket: it.bucket,
    margin: it.margin30,
  }));

  const scatterItems = items
    .filter((it) => it.margin30 != null && it.estTotalCostVnd != null)
    .map((it) => ({
      x: Number((it.margin30 ?? 0).toFixed(2)),
      y: Math.round((it.estTotalCostVnd ?? 0) / 1_000_000),
      z: it.employmentRatePct ?? 85,
      label: `${it.nvLabel}: ${it.majorName} (${it.university})`,
      bucket: it.bucket,
      afford: it.affordabilityPct,
      emp: it.employmentRatePct,
    }));

  const overBudgetCount = items.filter((it) => (it.affordabilityPct ?? 0) > 100).length;
  const maxCost = scatterItems.reduce((m, x) => Math.max(m, x.y), 0);
  const minCost = scatterItems.reduce((m, x) => Math.min(m, x.y), maxCost);
  const corrTitle =
    scatterItems.length > 0
      ? `Chi phí khóa ${minCost}–${maxCost} triệu ₫ kéo ${overBudgetCount}/${items.length} NV vượt ngân sách so với biên điểm`
      : "Chưa đủ dữ liệu chi phí & biên điểm để đối chiếu tương quan";

  const bucketTable = (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-2 py-2 font-medium">NV</th>
            <th className="px-2 py-2 font-medium">Ngành · Trường</th>
            <th className="px-2 py-2 font-medium">Nhóm</th>
            <th className="px-2 py-2 text-right font-medium">Biên</th>
            <th className="px-2 py-2 text-right font-medium">P(đỗ)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((it) => (
            <tr key={it.programId} className="hover:bg-slate-50/80">
              <td className="px-2 py-2 font-medium text-slate-900">{it.nvLabel}</td>
              <td className="px-2 py-2 text-slate-700">
                {it.majorName} ({it.university})
              </td>
              <td className="px-2 py-2 text-slate-600">
                {it.bucket ? BUCKET_LABEL[it.bucket] : "—"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                {it.margin30 != null ? it.margin30.toFixed(2).replace(".", ",") : "—"}
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums text-slate-900">
                {it.admitProbPct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const scatterTable = (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-2 py-2 font-medium">Nguyện vọng</th>
            <th className="px-2 py-2 text-right font-medium">Biên</th>
            <th className="px-2 py-2 text-right font-medium">Chi phí</th>
            <th className="px-2 py-2 text-right font-medium">Áp lực NS</th>
            <th className="px-2 py-2 text-right font-medium">Việc làm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((it) => (
            <tr key={it.programId} className="hover:bg-slate-50/80">
              <td className="px-2 py-2 text-slate-700">
                {it.nvLabel}: {it.majorName} ({it.university})
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                {it.margin30 != null ? it.margin30.toFixed(2).replace(".", ",") : "—"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-900">
                {formatVndShort(it.estTotalCostVnd)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                {formatPct(it.affordabilityPct, 0)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                {it.employmentRatePct != null ? formatPct(it.employmentRatePct, 0) : "Thiếu DL"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Tỷ lệ 5:7 */}
      <div className="lg:col-span-5">
        <BentoChartShell
          title={bucketTitle}
          description="Xanh: Chắc đỗ · Vàng: Vừa sức · Đỏ: Với cao. Đường đứt: mốc 50%."
          table={bucketTable}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bucketData} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                  }}
                  formatter={(v) => [`${v}%`, "Xác suất đỗ"]}
                  labelFormatter={(l) => String(l ?? "")}
                />
                <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="3 3" />
                <Bar dataKey="prob" radius={[5, 5, 0, 0]} barSize={20}>
                  {bucketData.map((d, i) => (
                    <Cell key={i} fill={statusColor(d.bucket)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </BentoChartShell>
      </div>

      <div className="lg:col-span-7">
        <BentoChartShell
          title={corrTitle}
          description="Trục X: Biên điểm (≥0 đủ điểm) · Trục Y: Tổng chi phí (triệu ₫) · Kích thước bong bóng: Tỷ lệ việc làm."
          table={scatterTable}
        >
          {scatterItems.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">
              Chưa có dữ liệu điểm và chi phí cho các nguyện vọng này.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, left: -4, bottom: 4 }}>
                  <CartesianGrid stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Biên điểm"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    unit="đ"
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Chi phí"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    unit="tr"
                  />
                  <ZAxis type="number" dataKey="z" range={[70, 260]} name="Việc làm (%)" />
                  <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                      boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                    }}
                    formatter={(value, name) => [String(value), String(name)]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.label ? String(payload[0].payload.label) : ""
                    }
                  />
                  <Scatter data={scatterItems}>
                    {scatterItems.map((entry, idx) => (
                      <Cell key={idx} fill={statusColor(entry.bucket)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </BentoChartShell>
      </div>
    </div>
  );
}
