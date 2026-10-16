"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartPalette } from "@/components/charts/palette";

export type EmploymentDatum = {
  label: string;
  rate: number;
};

function colorFor(rate: number): string {
  if (rate >= 90) return chartPalette.positive;
  if (rate >= 80) return chartPalette.warning;
  return chartPalette.negative;
}

function shorten(s: string, max = 30): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function EmploymentChart({ data }: { data: EmploymentDatum[] }) {
  const height = Math.max(280, data.length * 30 + 40);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={chartPalette.grid} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={200}
            tickFormatter={(v: string) => shorten(v)}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => [
              `${Number(value).toFixed(1).replace(".", ",")}%`,
              "Tỷ lệ việc làm",
            ]}
            labelFormatter={(label) => String(label ?? "")}
          />
          <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d.rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}