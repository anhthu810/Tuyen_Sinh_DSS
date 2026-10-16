import { createClient } from "@/lib/supabase/server";

// Tham số/giả định từ KPI_Sheet (THAM SỐ).
export const COST_PARAMS = {
  livingVndYear: 54_000_000, // sinh hoạt Hà Nội (4,5tr × 12)
  tuitionGrowthPerYear: 0.1, // học phí +10%/năm
  teacherSupportVndYear: 36_300_000, // NĐ 116: hỗ trợ sinh hoạt SV sư phạm (3,63tr × 10)
};

export type CostEstimate = {
  programId: string;
  durationYears: number;
  firstYearTuitionVnd: number | null;
  tuitionIsImputed: boolean;
  livingSupportVndYear: number;
  totalCostVnd: number | null; // K06
  affordabilityIndexPct: number | null; // K07 (tổng chi phí / tổng ngân sách × 100)
};

function isTeacherTrack(program: {
  industry_group?: string | null;
  khoi_nganh?: string | null;
  major_name?: string | null;
}): boolean {
  const s = `${program.industry_group ?? ""} ${program.major_name ?? ""}`.toLowerCase();
  return s.includes("sư phạm") || s.includes("giáo dục");
}

/**
 * Ước tính chi phí toàn khóa (K06) và chỉ số chi trả (K07) cho 1 ngành với ngân sách HS.
 * Học phí lấy theo ngành; nếu không có thì fallback học phí "ALL" của trường.
 */
export async function estimateCost(input: {
  programId: string;
  budgetVndYear: number;
}): Promise<CostEstimate> {
  const sb = await createClient();
  const { data: prog } = await sb
    .from("dim_program")
    .select("program_id, university_code, duration_years, industry_group, khoi_nganh, major_name")
    .eq("program_id", input.programId)
    .maybeSingle();

  const duration = Math.max(1, Math.round((prog?.duration_years as number) ?? 4));
  const universityCode = (prog?.university_code as string) ?? null;

  // Học phí: ưu tiên theo ngành, fallback "ALL" của trường, lấy năm mới nhất.
  let firstYear: number | null = null;
  let imputed = false;
  const { data: byProgram } = await sb
    .from("fact_tuition")
    .select("tuition_mid_vnd_year, academic_year")
    .eq("program_id", input.programId)
    .order("academic_year", { ascending: false })
    .limit(1);
  if (byProgram && byProgram.length) {
    firstYear = byProgram[0].tuition_mid_vnd_year as number;
  } else if (universityCode) {
    const { data: byUni } = await sb
      .from("fact_tuition")
      .select("tuition_mid_vnd_year, academic_year")
      .eq("university_code", universityCode)
      .eq("program_id", "ALL")
      .order("academic_year", { ascending: false })
      .limit(1);
    if (byUni && byUni.length) {
      firstYear = byUni[0].tuition_mid_vnd_year as number;
      imputed = true;
    }
  }

  const support = prog && isTeacherTrack(prog) ? COST_PARAMS.teacherSupportVndYear : 0;

  let total: number | null = null;
  if (firstYear != null) {
    let tuitionSum = 0;
    for (let k = 0; k < duration; k++) {
      tuitionSum += firstYear * Math.pow(1 + COST_PARAMS.tuitionGrowthPerYear, k);
    }
    const livingNet = (COST_PARAMS.livingVndYear - support) * duration;
    total = Math.round(tuitionSum + livingNet);
  }

  const affordability =
    total != null && input.budgetVndYear > 0
      ? (total / (input.budgetVndYear * duration)) * 100
      : null;

  return {
    programId: input.programId,
    durationYears: duration,
    firstYearTuitionVnd: firstYear,
    tuitionIsImputed: imputed,
    livingSupportVndYear: support,
    totalCostVnd: total,
    affordabilityIndexPct: affordability,
  };
}
