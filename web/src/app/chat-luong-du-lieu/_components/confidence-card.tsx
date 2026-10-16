"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { chartPalette } from "@/components/charts/palette";
import { DataQualityBadge } from "@/components/ui/data-quality-badge";

const CONFIDENCE_ORDER = ["Cao", "Trung bình", "Thấp"] as const;

const CONFIDENCE_COLOR: Record<string, string> = {
  "Cao": chartPalette.positive,
  "Trung bình": chartPalette.warning,
  "Thấp": chartPalette.negative,
};

export function ConfidenceCard({
  cutoffConfidence,
  cutoffScaleUnconfirmed,
}: {
  cutoffConfidence: Record<string, number>;
  cutoffScaleUnconfirmed: number;
}) {
  const data = CONFIDENCE_ORDER.filter((k) => (cutoffConfidence[k] ?? 0) > 0).map((k) => ({
    name: k,
    value: cutoffConfidence[k],
  }));
  const total = data.reduce((s, d) => s + d.value, 0);

  const pct = (v: number) =>
    total ? `${((v / total) * 100).toFixed(1).replace(".", ",")}%` : "—";

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="py-2 pr-4 font-medium">Độ tin cậy</th>
          <th className="py-2 pr-4 text-right font-medium">Số dòng</th>
          <th className="py-2 text-right font-medium">Tỷ lệ</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.name} className="border-b last:border-b-0">
            <td className="py-2.5 pr-4">{d.name}</td>
            <td className="py-2.5 pr-4 text-right tabular-nums">
              {d.value.toLocaleString("vi-VN")}
            </td>
            <td className="py-2.5 text-right tabular-nums">{pct(d.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Độ tin cậy điểm chuẩn"
      description="Phân phối nhãn độ tin cậy trên toàn bộ dòng fact_cutoff_score."
      table={table}
    >
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu điểm chuẩn.
        </p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={CONFIDENCE_COLOR[d.name] ?? chartPalette.neutral} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) =>
                  [
                    `${Number(value).toLocaleString("vi-VN")} dòng (${pct(Number(value))})`,
                    String(name),
                  ] as [string, string]
                }
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        <span className="text-sm text-muted-foreground">
          Thang điểm chưa xác nhận: {cutoffScaleUnconfirmed.toLocaleString("vi-VN")} dòng
        </span>
        <DataQualityBadge scaleConfirmed={cutoffScaleUnconfirmed > 0 ? false : null} />
      </div>
    </ChartCard>
  );
}