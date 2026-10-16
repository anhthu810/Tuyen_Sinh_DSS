import { getProgramSignals } from "@/lib/queries/signals";
import { effectiveBand, classify, admitProbability, type Bucket } from "./recommend";
import { hollandMatch } from "./holland";
import { clamp } from "./scale";
import { COST_PARAMS } from "./cost";

export type AdviseInput = {
  score30: number; // điểm HS quy về thang 30
  hollandCode?: string;
  industryGroup?: string;
  universityCode?: string;
  budgetVndYear?: number;
};

export type AdviseItem = {
  programId: string;
  majorName: string | null;
  universityCode: string;
  shortName: string | null;
  industryGroup: string | null;
  refCutoff30: number;
  refSource: "forecast" | "actual";
  refYear: number | null;
  margin: number;
  band: number;
  bucket: Bucket;
  admitProb: number; // 0..1
  fit: number | null;
  employmentRate: number | null;
  afford: number | null; // điểm 0..100
  estTotalCost: number | null;
  composite: number; // 0..100
};

/**
 * Tư vấn chọn ngành/trường khi HS nhập điểm (thang 30).
 * Quét toàn bộ ngành có điểm chuẩn/dự báo, phân loại reach/match/safety,
 * tính xác suất đỗ + phù hợp Holland + việc làm + chi phí, rồi chấm điểm tổng hợp.
 */
export async function adviseFromScore(input: AdviseInput): Promise<AdviseItem[]> {
  const sigs = await getProgramSignals();
  const items: AdviseItem[] = [];

  for (const s of sigs) {
    if (input.industryGroup && s.industryGroup !== input.industryGroup) continue;
    if (input.universityCode && s.universityCode !== input.universityCode) continue;

    const ref = s.forecast30 ?? s.latestCutoff30;
    if (ref == null) continue; // không có căn cứ điểm chuẩn -> bỏ qua

    const refSource: "forecast" | "actual" = s.forecast30 != null ? "forecast" : "actual";
    const refYear = s.forecast30 != null ? s.forecastYear : s.latestCutoffYear;
    const band = effectiveBand(s.mae);
    const margin = input.score30 - ref;
    const bucket = classify(margin, band);
    const admitProb = admitProbability(margin, band);
    const fit = input.hollandCode ? hollandMatch(input.hollandCode, s.hollandCode) : null;

    let estTotalCost: number | null = null;
    let afford: number | null = null;
    if (s.tuitionMid != null && s.durationYears != null) {
      const dur = Math.max(1, Math.round(s.durationYears));
      let t = 0;
      for (let k = 0; k < dur; k++) t += s.tuitionMid * Math.pow(1 + COST_PARAMS.tuitionGrowthPerYear, k);
      estTotalCost = Math.round(t + COST_PARAMS.livingVndYear * dur);
      if (input.budgetVndYear && input.budgetVndYear > 0) {
        const idx = (estTotalCost / (input.budgetVndYear * dur)) * 100;
        afford = clamp(200 - idx);
      }
    }

    const parts: number[] = [admitProb * 100];
    if (fit != null) parts.push(fit);
    if (s.employmentRate != null) parts.push(clamp(s.employmentRate));
    if (afford != null) parts.push(afford);
    const composite = parts.reduce((a, b) => a + b, 0) / parts.length;

    items.push({
      programId: s.programId,
      majorName: s.majorName,
      universityCode: s.universityCode,
      shortName: s.shortName,
      industryGroup: s.industryGroup,
      refCutoff30: ref,
      refSource,
      refYear,
      margin,
      band,
      bucket,
      admitProb,
      fit,
      employmentRate: s.employmentRate,
      afford,
      estTotalCost,
      composite,
    });
  }

  items.sort((a, b) => b.composite - a.composite);
  return items;
}
