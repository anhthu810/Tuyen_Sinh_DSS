export type CutoffScope = "hust_neu" | "top1" | "all";

export type WhatIfParams = {
  scoreBonus: number;
  cutoffDelta: number;
  cutoffScope: CutoffScope;
  quotaDeltaPct: number;
  budgetDeltaPct: number;
  costDeltaPct: number;
  cohortYear: number | "all";
};

export type WhatIfPreset = {
  id: string;
  label: string;
  assumption: string;
  formulaSummary: string;
  params: Omit<WhatIfParams, "cohortYear">;
};

export type WhatIfApplication = {
  nv_order: number;
  university_code: string;
  best_method: string | null;
  best_margin_30: number | null;
  is_eligible: boolean;
  est_total_cost_vnd: number | null;
  family_budget_vnd_year: number | null;
  duration_years: number | null;
  affordability_index_pct: number | null;
};

export type WhatIfStudent = {
  student_id: string;
  cohort_year: number;
  is_thpt_graduated: boolean;
  family_budget_vnd_year: number;
  applications: WhatIfApplication[];
};

export type WhatIfUniversity = {
  university_code: string;
  short_name: string | null;
  university_name: string;
  tier: string | null;
};

export type WhatIfDataset = {
  students: WhatIfStudent[];
  universities: WhatIfUniversity[];
  totalApplications: number;
};

export type UniversityImpact = {
  university_code: string;
  label: string;
  tier: string | null;
  admittedCount: number;
  overBudgetCount: number;
};

export type SimulationResult = {
  totalStudents: number;
  admittedTop3Count: number; // K01
  admittedNv1Count: number;
  admittedNv23Count: number;
  admittedFallbackCount: number; // NV4+
  admittedTotalCount: number;
  rejectedCount: number;
  k01Pct: number;
  nv1Pct: number;
  admittedTotalPct: number;
  fallbackPct: number;
  overBudgetCount: number;
  costEvaluatedCount: number;
  k07Pct: number | null;
  k06AvgCostVnd: number | null;
  byUniversity: UniversityImpact[];
};

export type SensitivityPoint = {
  xLabel: string;
  xValue: number;
  k01Pct: number;
  nv1Pct: number;
  admittedTotalPct: number;
  k07Pct: number;
};

export const BASELINE_PARAMS: Omit<WhatIfParams, "cohortYear"> = {
  scoreBonus: 0,
  cutoffDelta: 0,
  cutoffScope: "hust_neu",
  quotaDeltaPct: 0,
  budgetDeltaPct: 0,
  costDeltaPct: 0,
};

export const WHAT_IF_PRESETS: WhatIfPreset[] = [
  {
    id: "base",
    label: "Cơ sở (dữ liệu hiện tại)",
    assumption: "Giữ nguyên điểm xét tuyển, điểm chuẩn, chỉ tiêu và ngân sách gia đình hiện tại.",
    formulaSummary: "Đánh giá trên từng NV theo thứ tự ưu tiên (NV1 → NVn); giữ nguyên baseline.",
    params: { ...BASELINE_PARAMS },
  },
  {
    id: "extra_exam",
    label: "1. Thi thêm bài thi phụ (TSA/HSA/IELTS) (+1,0đ)",
    assumption: "Bài thi phụ mang lại lợi thế quy đổi tương đương +1,0đ xét tuyển (thang 30).",
    formulaSummary:
      "Điểm_HS_mới = Điểm_gốc + 1,0 → xét lại điều kiện đỗ (margin ≥ 0) và đếm số HS đỗ NV1–NV3 (K01).",
    params: {
      scoreBonus: 1.0,
      cutoffDelta: 0,
      cutoffScope: "hust_neu",
      quotaDeltaPct: 0,
      budgetDeltaPct: 0,
      costDeltaPct: 0,
    },
  },
  {
    id: "top1_cutoff_up",
    label: "2. Điểm chuẩn Top 1 (HUST, NEU) tăng +1,0đ",
    assumption:
      "Điểm chuẩn nhóm Top 1 (HUST/BKA, NEU/KHA) tăng +1,0đ; HS giữ nguyên danh sách NV (kiểm tra vai trò NV lót).",
    formulaSummary:
      "Nếu trường ∈ {BKA, KHA}: Điểm_chuẩn_mới = Điểm_chuẩn_gốc + 1,0 → HS không đủ điểm ở NV1–NV3 bị đẩy xuống NV4+.",
    params: {
      scoreBonus: 0,
      cutoffDelta: 1.0,
      cutoffScope: "hust_neu",
      quotaDeltaPct: 0,
      budgetDeltaPct: 0,
      costDeltaPct: 0,
    },
  },
  {
    id: "budget_drop",
    label: "3. Dự trù ngân sách gia đình giảm 20%",
    assumption: "Thu nhập/ngân sách gia đình giảm 20% trong tương lai; học phí & sinh hoạt phí không đổi.",
    formulaSummary:
      "Ngân_sách_mới = Ngân_sách_hiện_tại × 0,8 → đếm HS trúng tuyển có Tổng_chi_phí > Ngân_sách_mới × Số_năm (K07).",
    params: {
      scoreBonus: 0,
      cutoffDelta: 0,
      cutoffScope: "hust_neu",
      quotaDeltaPct: 0,
      budgetDeltaPct: -20,
      costDeltaPct: 0,
    },
  },
  {
    id: "combined_stress",
    label: "4. Kịch bản kép: Top 1 +1,0đ & Ngân sách -20%",
    assumption: "Điểm chuẩn HUST & NEU tăng +1,0đ đồng thời ngân sách gia đình giảm 20%.",
    formulaSummary:
      "Kết hợp dịch chuyển biên điểm ở BKA/KHA (-1,0đ) và thu hẹp ngưỡng chi trả (×0,8) để kiểm tra rủi ro đồng thời.",
    params: {
      scoreBonus: 0,
      cutoffDelta: 1.0,
      cutoffScope: "hust_neu",
      quotaDeltaPct: 0,
      budgetDeltaPct: -20,
      costDeltaPct: 0,
    },
  },
  {
    id: "extreme_out_of_range",
    label: "5. Biến động cực đoan (+2,5đ chuẩn, -20% chỉ tiêu & -35% ngân sách)",
    assumption: "Biến động vượt ngưỡng giả định thông thường để kiểm thử cảnh báo của hệ thống.",
    formulaSummary:
      "Điểm chuẩn toàn hệ thống +2,5đ, chỉ tiêu -20% (+0,5đ cạnh tranh) và ngân sách -35% (ngoài ngưỡng an toàn).",
    params: {
      scoreBonus: 0,
      cutoffDelta: 2.5,
      cutoffScope: "all",
      quotaDeltaPct: -20,
      budgetDeltaPct: -35,
      costDeltaPct: 10,
    },
  },
];

const SCOPE_CODES: Record<CutoffScope, Set<string> | null> = {
  hust_neu: new Set(["BKA", "KHA"]),
  top1: new Set(["BKA", "KHA", "YHB"]),
  all: null,
};

function cutoffApplies(universityCode: string, scope: CutoffScope): boolean {
  const set = SCOPE_CODES[scope];
  return set === null ? true : set.has(universityCode);
}

function isApplicationEligible(
  student: WhatIfStudent,
  app: WhatIfApplication,
  params: WhatIfParams,
): boolean {
  if (!student.is_thpt_graduated) return false;
  if (app.best_margin_30 == null) return app.is_eligible;

  const applies = cutoffApplies(app.university_code, params.cutoffScope);
  const cutoffShift = applies ? params.cutoffDelta : 0;
  // Giả định độ co giãn chỉ tiêu: giảm 10% chỉ tiêu tạo áp lực tăng +0,25đ điểm chuẩn
  const quotaPressure = applies ? -(params.quotaDeltaPct / 10) * 0.25 : 0;
  const netDelta = params.scoreBonus - cutoffShift - quotaPressure;

  if (netDelta === 0) return app.is_eligible;
  return app.best_margin_30 + netDelta >= 0;
}

function isApplicationOverBudget(
  student: WhatIfStudent,
  app: WhatIfApplication,
  params: WhatIfParams,
): { evaluated: boolean; overBudget: boolean; adjustedCost: number | null } {
  const costFactor = 1 + params.costDeltaPct / 100;
  const budgetFactor = 1 + params.budgetDeltaPct / 100;

  if (app.est_total_cost_vnd != null) {
    const adjustedCost = app.est_total_cost_vnd * costFactor;
    const annualBudget = app.family_budget_vnd_year ?? student.family_budget_vnd_year;
    const duration = app.duration_years && app.duration_years > 0 ? app.duration_years : 4;
    const adjustedBudgetTotal = annualBudget * budgetFactor * duration;
    const overBudget = adjustedBudgetTotal <= 0 ? true : adjustedCost > adjustedBudgetTotal;
    return { evaluated: true, overBudget, adjustedCost };
  }

  if (app.affordability_index_pct != null) {
    const adjustedRatio =
      budgetFactor <= 0 ? Infinity : (app.affordability_index_pct * costFactor) / budgetFactor;
    return { evaluated: true, overBudget: adjustedRatio > 100, adjustedCost: null };
  }

  return { evaluated: false, overBudget: false, adjustedCost: null };
}

/**
 * Mô phỏng kết quả tuyển sinh (K01, NV1, trúng tuyển chung) và áp lực tài chính (K06, K07)
 * cho tập học sinh theo bộ tham số What-if.
 */
export function simulateWhatIf(
  dataset: WhatIfDataset,
  params: WhatIfParams,
): SimulationResult {
  const students =
    params.cohortYear === "all"
      ? dataset.students
      : dataset.students.filter((s) => s.cohort_year === params.cohortYear);

  const uniStats = new Map<string, { admitted: number; overBudget: number }>();
  for (const u of dataset.universities) {
    uniStats.set(u.university_code, { admitted: 0, overBudget: 0 });
  }

  let admittedTop3Count = 0;
  let admittedNv1Count = 0;
  let admittedNv23Count = 0;
  let admittedFallbackCount = 0;
  let admittedTotalCount = 0;
  let rejectedCount = 0;
  let overBudgetCount = 0;
  let costEvaluatedCount = 0;
  let costSum = 0;
  let costCount = 0;

  for (const student of students) {
    const admittedApp = student.applications.find((app) =>
      isApplicationEligible(student, app, params),
    );

    if (!admittedApp) {
      rejectedCount += 1;
      continue;
    }

    admittedTotalCount += 1;
    if (admittedApp.nv_order === 1) {
      admittedNv1Count += 1;
      admittedTop3Count += 1;
    } else if (admittedApp.nv_order <= 3) {
      admittedNv23Count += 1;
      admittedTop3Count += 1;
    } else {
      admittedFallbackCount += 1;
    }

    const uBucket = uniStats.get(admittedApp.university_code) ?? {
      admitted: 0,
      overBudget: 0,
    };
    uBucket.admitted += 1;

    const costCheck = isApplicationOverBudget(student, admittedApp, params);
    if (costCheck.evaluated) {
      costEvaluatedCount += 1;
      if (costCheck.overBudget) {
        overBudgetCount += 1;
        uBucket.overBudget += 1;
      }
      if (costCheck.adjustedCost != null) {
        costSum += costCheck.adjustedCost;
        costCount += 1;
      }
    }
    uniStats.set(admittedApp.university_code, uBucket);
  }

  const totalStudents = students.length;
  const pctOf = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  const byUniversity: UniversityImpact[] = dataset.universities.map((u) => {
    const st = uniStats.get(u.university_code) ?? { admitted: 0, overBudget: 0 };
    return {
      university_code: u.university_code,
      label: u.short_name ? `${u.short_name} (${u.university_code})` : u.university_code,
      tier: u.tier,
      admittedCount: st.admitted,
      overBudgetCount: st.overBudget,
    };
  });

  return {
    totalStudents,
    admittedTop3Count,
    admittedNv1Count,
    admittedNv23Count,
    admittedFallbackCount,
    admittedTotalCount,
    rejectedCount,
    k01Pct: pctOf(admittedTop3Count, totalStudents),
    nv1Pct: pctOf(admittedNv1Count, totalStudents),
    admittedTotalPct: pctOf(admittedTotalCount, totalStudents),
    fallbackPct: pctOf(admittedFallbackCount, totalStudents),
    overBudgetCount,
    costEvaluatedCount,
    k07Pct: costEvaluatedCount > 0 ? (overBudgetCount / costEvaluatedCount) * 100 : null,
    k06AvgCostVnd: costCount > 0 ? costSum / costCount : null,
    byUniversity,
  };
}

/**
 * Tạo chuỗi độ nhạy của K01 theo biến động điểm xét tuyển (-2.0 → +2.5)
 * và của K07 theo biến động ngân sách (-40% → +30%), giữ các tham số khác theo trạng thái hiện tại.
 */
export function buildSensitivitySeries(
  dataset: WhatIfDataset,
  params: WhatIfParams,
): {
  scoreCurve: SensitivityPoint[];
  budgetCurve: SensitivityPoint[];
} {
  const scoreSteps = [-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 2.5];
  const scoreCurve = scoreSteps.map((delta) => {
    const sim = simulateWhatIf(dataset, { ...params, scoreBonus: delta });
    return {
      xLabel: `${delta > 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")}đ`,
      xValue: delta,
      k01Pct: Number(sim.k01Pct.toFixed(1)),
      nv1Pct: Number(sim.nv1Pct.toFixed(1)),
      admittedTotalPct: Number(sim.admittedTotalPct.toFixed(1)),
      k07Pct: Number((sim.k07Pct ?? 0).toFixed(1)),
    };
  });

  const budgetSteps = [-40, -30, -20, -10, 0, 10, 20, 30];
  const budgetCurve = budgetSteps.map((pct) => {
    const sim = simulateWhatIf(dataset, { ...params, budgetDeltaPct: pct });
    return {
      xLabel: `${pct > 0 ? "+" : ""}${pct}%`,
      xValue: pct,
      k01Pct: Number(sim.k01Pct.toFixed(1)),
      nv1Pct: Number(sim.nv1Pct.toFixed(1)),
      admittedTotalPct: Number(sim.admittedTotalPct.toFixed(1)),
      k07Pct: Number((sim.k07Pct ?? 0).toFixed(1)),
    };
  });

  return { scoreCurve, budgetCurve };
}

