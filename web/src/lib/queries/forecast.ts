import { createClient } from "@/lib/supabase/server";
import type { FactCutoffForecast } from "@/types/database.types";

export type ForecastPoint = FactCutoffForecast;

/** Mọi dòng dự báo (NAIVE + MA2) của 1 ngành, sắp theo năm. */
export async function getForecast(programId: string): Promise<ForecastPoint[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("fact_cutoff_forecast")
    .select("*")
    .eq("program_id", programId)
    .order("target_year")
    .order("method");
  return (data ?? []) as ForecastPoint[];
}

/** MAE theo phương pháp MA2 cho từng ngành (K03 ở cấp ngành). */
export async function getForecastAccuracy(): Promise<
  { programId: string; mae: number; n: number }[]
> {
  const sb = await createClient();
  const { data } = await sb
    .from("fact_cutoff_forecast")
    .select("program_id, abs_error, method")
    .ilike("method", "MA2%")
    .not("abs_error", "is", null);
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const r of (data ?? []) as { program_id: string; abs_error: number }[]) {
    (acc[r.program_id] ??= { sum: 0, n: 0 });
    acc[r.program_id].sum += r.abs_error;
    acc[r.program_id].n += 1;
  }
  return Object.entries(acc).map(([programId, v]) => ({
    programId,
    mae: v.sum / v.n,
    n: v.n,
  }));
}

/** MAE tổng thể (K03) — trung bình abs_error của MA2 trên mọi ngành có actual. */
export async function getOverallMae(): Promise<number | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("fact_cutoff_forecast")
    .select("abs_error")
    .ilike("method", "MA2%")
    .not("actual_cutoff", "is", null);
  const xs = (data ?? [])
    .map((r) => (r as { abs_error: number }).abs_error)
    .filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
