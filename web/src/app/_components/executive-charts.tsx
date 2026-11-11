"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { chartPalette } from "@/components/charts/palette";
import { formatPct } from "@/lib/format";
import type { ExecutiveChartData } from "@/lib/kpi";

function ExecChartShell({
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
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          {showTable ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
          {showTable ? "Biểu đồ" : "Bảng"}
        </button>
      </div>
      <div className="mt-4 flex-1">{showTable ? table : children}</div>
    </div>
  );
}

export function ExecutiveCharts({ data }: { data: ExecutiveChartData }) {
  const { outcomes, matrix } = data;
  const top3Count = outcomes.nv1Count + outcomes.nv23Count;
  const k01Pct = outcomes.total > 0 ? (top3Count / outcomes.total) * 100 : 0;

  // Biểu đồ 1: Stacked Horizontal Bar Chart (0% -> 100%)
  const stackedData = [
    {
      label: `Mẫu ${outcomes.total} HS`,
      "Đỗ NV1": outcomes.nv1Pct,
      "Đỗ NV2–3": outcomes.nv23Pct,
      "Đỗ NV4+ (NV lót)": outcomes.nv4PlusPct,
      "Trượt toàn bộ": outcomes.rejectedPct,
    },
  ];

  const outcomeTitle = `${formatPct(k01Pct)} học sinh (${top3Count} HS) đỗ đúng nhóm mục tiêu; ${outcomes.nv4PlusCount} HS nhờ đệm NV lót và ${outcomes.rejectedCount} HS trượt trắng`;

  const outcomeTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-400">
            <th className="py-2 pr-3 font-medium">Nhóm kết quả</th>
            <th className="py-2 px-3 text-right font-medium">Số học sinh</th>
            <th className="py-2 pl-3 text-right font-medium">Tỷ lệ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {[
            { name: "Đỗ NV1", count: outcomes.nv1Count, pct: outcomes.nv1Pct },
            { name: "Đỗ NV2–3", count: outcomes.nv23Count, pct: outcomes.nv23Pct },
            { name: "Đỗ NV4+ (NV lót)", count: outcomes.nv4PlusCount, pct: outcomes.nv4PlusPct },
            { name: "Trượt toàn bộ", count: outcomes.rejectedCount, pct: outcomes.rejectedPct },
          ].map((r) => (
            <tr key={r.name} className="hover:bg-slate-50/80">
              <td className="py-2.5 pr-3 font-medium text-slate-900">{r.name}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{r.count} HS</td>
              <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">
                {formatPct(r.pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Biểu đồ 2: Ma trận Điểm chuẩn & Học phí 7 trường (Grouped Bar, trục Y bắt đầu từ 0 triệu ₫)
  const over300Cntt = matrix.filter((m) => (m.cnttCostM ?? 0) >= 300);
  const top1HighCntt = matrix.find(
    (m) => (m.cnttCutoff ?? 0) >= 26 && (m.cnttCostM ?? 0) >= 300,
  );
  const matrixTitle = top1HighCntt
    ? `Nhóm ngành CNTT trường Top 1 (${over300Cntt.map((x) => x.university).join(", ")}) vượt điểm chuẩn 26 và học phí vượt ngưỡng an toàn 300 triệu ₫`
    : over300Cntt.length > 0
      ? `${over300Cntt.map((x) => x.university).join(", ")} có tổng chi phí toàn khóa nhóm CNTT vượt ngưỡng an toàn 300 triệu ₫`
      : "So sánh tổng chi phí toàn khóa (triệu ₫) giữa nhóm CNTT và ngành khác tại 7 trường";

  const matrixChartData = matrix.map((m) => ({
    university: m.university,
    "CNTT (triệu ₫)": m.cnttCostM,
    "Ngành khác (triệu ₫)": m.otherCostM,
    cnttCutoff: m.cnttCutoff,
    otherCutoff: m.otherCutoff,
  }));

  const matrixTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-400">
            <th className="py-2 pr-3 font-medium">Trường</th>
            <th className="py-2 px-2 text-right font-medium">ĐC CNTT</th>
            <th className="py-2 px-2 text-right font-medium">Chi phí CNTT</th>
            <th className="py-2 px-2 text-right font-medium">ĐC Khác</th>
            <th className="py-2 pl-2 text-right font-medium">Chi phí Khác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {matrix.map((m) => (
            <tr key={m.universityCode} className="hover:bg-slate-50/80">
              <td className="py-2 pr-3 font-semibold text-slate-900">{m.university}</td>
              <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                {m.cnttCutoff != null ? m.cnttCutoff.toFixed(1).replace(".", ",") : "—"}
              </td>
              <td
                className={`py-2 px-2 text-right font-medium tabular-nums ${
                  (m.cnttCostM ?? 0) > 300 ? "text-rose-700" : "text-slate-900"
                }`}
              >
                {m.cnttCostM != null ? `${m.cnttCostM} tr ₫` : "—"}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                {m.otherCutoff != null ? m.otherCutoff.toFixed(1).replace(".", ",") : "—"}
              </td>
              <td
                className={`py-2 pl-2 text-right font-medium tabular-nums ${
                  (m.otherCostM ?? 0) > 300 ? "text-rose-700" : "text-slate-900"
                }`}
              >
                {m.otherCostM != null ? `${m.otherCostM} tr ₫` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Biểu đồ 1: Stacked Horizontal Bar Chart tỷ lệ kết quả trúng tuyển */}
      <ExecChartShell
        title={outcomeTitle}
        description="Tỷ lệ (%) theo 4 kết cục xét tuyển trên 500 HS: Đỗ NV1 · Đỗ NV2–3 · Đỗ NV4+ · Trượt."
        table={outcomeTable}
      >
        <div className="space-y-4">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stackedData}
                layout="vertical"
                margin={{ top: 12, right: 20, left: 4, bottom: 12 }}
              >
                <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={82}
                  tick={{ fontSize: 12, fontWeight: 600, fill: "#0f172a" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                  }}
                  formatter={(v, name) => [formatPct(Number(v)), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Đỗ NV1" stackId="s" fill={chartPalette.positive} barSize={40} />
                <Bar dataKey="Đỗ NV2–3" stackId="s" fill={chartPalette.actual} />
                <Bar dataKey="Đỗ NV4+ (NV lót)" stackId="s" fill={chartPalette.warning} />
                <Bar
                  dataKey="Trượt toàn bộ"
                  stackId="s"
                  fill={chartPalette.negative}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 4 ô số lượng tóm tắt dưới thanh Stacked Bar */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2">
              <div className="text-[11px] font-medium text-emerald-700">Đỗ NV1</div>
              <div className="text-base font-bold tabular-nums text-emerald-900">
                {formatPct(outcomes.nv1Pct)}
              </div>
              <div className="text-[11px] text-emerald-700">{outcomes.nv1Count} HS</div>
            </div>
            <div className="rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 py-2">
              <div className="text-[11px] font-medium text-indigo-700">Đỗ NV2–3</div>
              <div className="text-base font-bold tabular-nums text-indigo-900">
                {formatPct(outcomes.nv23Pct)}
              </div>
              <div className="text-[11px] text-indigo-700">{outcomes.nv23Count} HS</div>
            </div>
            <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 px-3 py-2">
              <div className="text-[11px] font-medium text-amber-700">Đỗ NV4+</div>
              <div className="text-base font-bold tabular-nums text-amber-900">
                {formatPct(outcomes.nv4PlusPct)}
              </div>
              <div className="text-[11px] text-amber-700">{outcomes.nv4PlusCount} HS</div>
            </div>
            <div className="rounded-lg border border-rose-200/70 bg-rose-50/70 px-3 py-2">
              <div className="text-[11px] font-medium text-rose-700">Trượt trắng</div>
              <div className="text-base font-bold tabular-nums text-rose-900">
                {formatPct(outcomes.rejectedPct)}
              </div>
              <div className="text-[11px] text-rose-700">{outcomes.rejectedCount} HS</div>
            </div>
          </div>
        </div>
      </ExecChartShell>

      {/* Biểu đồ 2: Ma trận Điểm chuẩn & Học phí 7 trường (Grouped Bar, gốc 0, ReferenceLine y=300) */}
      <ExecChartShell
        title={matrixTitle}
        description="Trục X: 7 trường ĐH · Trục Y: Tổng chi phí toàn khóa (triệu ₫). Đường đứt đỏ: trần ngân sách an toàn 300 triệu ₫."
        table={matrixTable}
      >
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={matrixChartData}
              margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="university" tick={{ fontSize: 11, fill: "#334155" }} />
              <YAxis
                domain={[0, "auto"]}
                tickFormatter={(v: number) => `${v}tr`}
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
                }}
                formatter={(value, name, props) => {
                  const p = props?.payload as
                    | { cnttCutoff?: number | null; otherCutoff?: number | null }
                    | undefined;
                  const cut =
                    String(name).startsWith("CNTT") ? p?.cnttCutoff : p?.otherCutoff;
                  const cutText =
                    cut != null ? ` (ĐC TB: ${cut.toFixed(1).replace(".", ",")}đ)` : "";
                  return [`${value} triệu ₫${cutText}`, String(name)];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                y={300}
                stroke={chartPalette.negative}
                strokeDasharray="4 4"
                label={{
                  value: "Ngưỡng an toàn 300 tr ₫",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: chartPalette.negative,
                }}
              />
              <Bar
                dataKey="CNTT (triệu ₫)"
                fill={chartPalette.actual}
                radius={[4, 4, 0, 0]}
                barSize={18}
              />
              <Bar
                dataKey="Ngành khác (triệu ₫)"
                fill={chartPalette.neutral}
                radius={[4, 4, 0, 0]}
                barSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ExecChartShell>
    </div>
  );
}

