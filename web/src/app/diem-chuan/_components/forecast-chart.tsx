"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartPalette } from "@/components/charts/palette";

export type ChartRow = {
  year: number;
  actual: number | null;
  naive: number | null;
  ma2: number | null;
  bandLow: number | null;
  bandHigh: number | null;
};

type RenderRow = ChartRow & { band: [number, number] | null };

export function ForecastChart({ data, mae }: { data: ChartRow[]; mae: number | null }) {
  const rows: RenderRow[] = data.map((d) => ({
    ...d,
    band:
      d.bandLow != null && d.bandHigh != null
        ? ([d.bandLow, d.bandHigh] as [number, number])
        : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={chartPalette.grid} />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke={chartPalette.neutral} />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fontSize: 12 }}
          stroke={chartPalette.neutral}
          width={48}
        />
        <Tooltip />
        <Legend />
        {mae != null ? (
          <Area
            type="monotone"
            dataKey="band"
            name={`Dải ±MAE quanh MA2 (${mae.toFixed(2)})`}
            stroke="none"
            fill={chartPalette.band}
            fillOpacity={0.15}
            isAnimationActive={false}
          />
        ) : null}
        <Line
          type="monotone"
          dataKey="actual"
          name="Thực tế"
          stroke={chartPalette.actual}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="naive"
          name="NAIVE (năm trước)"
          stroke={chartPalette.naive}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="ma2"
          name="MA2 (TB 2 năm trước)"
          stroke={chartPalette.ma2}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}