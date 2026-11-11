import { createClient } from "@/lib/supabase/server";

export type KpiTone = "good" | "warn" | "bad" | "neutral";

export type KpiBullet = {
  value: number;
  max: number;
  target: number;
  targetLabel: string;
  unit: string;
  /** true nếu giá trị càng nhỏ càng tốt (ví dụ MAE K03, chi phí K06, rủi ro K07) */
  invertRisk?: boolean;
};

export type Kpi = {
  code: string; // K01..K07
  name: string;
  question: string; // Q1..Q4
  display: string; // chuỗi hiển thị
  meaning: string;
  formula: string;
  threshold: string;
  source: string;
  rawValue: number | null;
  bullet?: KpiBullet;
  tone: KpiTone;
};

export type OutcomeBreakdown = {
  total: number;
  nv1Count: number;
  nv23Count: number;
  nv4PlusCount: number;
  rejectedCount: number;
  nv1Pct: number;
  nv23Pct: number;
  nv4PlusPct: number;
  rejectedPct: number;
};

export type UniCostMatrixRow = {
  universityCode: string;
  university: string;
  cnttCostM: number | null;
  cnttCutoff: number | null;
  otherCostM: number | null;
  otherCutoff: number | null;
};

export type ExecutiveChartData = {
  outcomes: OutcomeBreakdown;
  matrix: UniCostMatrixRow[];
};

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const pct = (n: number | null, d = 1) =>
  n == null ? "—" : n.toFixed(d).replace(".", ",") + "%";

/**
 * Tính 7 KPI tổng quan trực tiếp từ các bảng (thiết kế denormalized của DB).
 * Đa số dùng count(head) cho nhanh; vài KPI cần trung bình thì fetch 1 cột.
 * Công thức bám KPI_Sheet; lưu ý H1: K02 dùng score_eligible (NV đủ điểm), KHÔNG dùng is_eligible.
 */
export async function getOverviewKpis(): Promise<Kpi[]> {
  const supabase = await createClient();

  // K01 — Tỷ lệ đỗ NV1–NV3 trên toàn bộ HS
  const k01 = await safe<number | null>(async () => {
    const total = await supabase
      .from("dim_student")
      .select("*", { count: "exact", head: true });
    const hit = await supabase
      .from("dim_student")
      .select("*", { count: "exact", head: true })
      .eq("admission_status", "Trúng tuyển")
      .lte("admitted_nv_order", 3);
    const t = total.count ?? 0;
    return t ? ((hit.count ?? 0) / t) * 100 : null;
  }, null);

  // K02 — Lợi thế phương thức phụ: NV đủ điểm có best_method != THPT / tổng NV đủ điểm
  const k02 = await safe<number | null>(async () => {
    const denom = await supabase
      .from("main_dataset")
      .select("*", { count: "exact", head: true })
      .gt("score_eligible", 0);
    const num = await supabase
      .from("main_dataset")
      .select("*", { count: "exact", head: true })
      .gt("score_eligible", 0)
      .neq("best_method", "THPT");
    const d = denom.count ?? 0;
    return d ? ((num.count ?? 0) / d) * 100 : null;
  }, null);

  // K03 — MAE dự báo MA2 trên chuỗi chính (THPT / quy đổi chung, thang 30), chỉ dòng có actual.
  // Không trộn phương thức: học bạ, TSA, HSA... có thang và chuỗi riêng.
  const k03 = await safe<number | null>(async () => {
    const { data } = await supabase
      .from("fact_cutoff_forecast")
      .select("abs_error")
      .eq("is_primary", true)
      .ilike("method", "MA2%")
      .not("actual_cutoff", "is", null);
    return mean(
      (data ?? []).map((r) => r.abs_error).filter((v): v is number => v != null),
    );
  }, null);

  // K05 — Tỷ lệ việc làm sau 1 năm (bình quân các dòng fact_employment, đã là %)
  const k05 = await safe<number | null>(async () => {
    const { data } = await supabase
      .from("fact_employment")
      .select("employment_rate_pct");
    return mean(
      (data ?? [])
        .map((r) => r.employment_rate_pct)
        .filter((v): v is number => v != null),
    );
  }, null);

  // K06 & K07 — trên tập NV trúng tuyển
  const admitted = await safe<
    { est_total_cost_vnd: number | null; affordability_index_pct: number | null }[]
  >(async () => {
    const { data } = await supabase
      .from("main_dataset")
      .select("est_total_cost_vnd, affordability_index_pct")
      .eq("is_admitted", true);
    return data ?? [];
  }, []);

  const costs = admitted
    .map((r) => r.est_total_cost_vnd)
    .filter((v): v is number => v != null);
  const k06 = mean(costs);
  const k07 =
    admitted.length
      ? (admitted.filter((r) => (r.affordability_index_pct ?? 0) > 100).length /
          admitted.length) *
        100
      : null;

  const vnd =
    k06 == null ? "—" : Math.round(k06 / 1_000_000).toLocaleString("vi-VN") + " triệu ₫";

  return [
    {
      code: "K01",
      name: "Tỷ lệ đỗ nhóm nguyện vọng mục tiêu (NV1–NV3)",
      question: "Nguyện vọng",
      display: pct(k01),
      meaning: "Thấp → danh sách quá mạo hiểm, cần bổ sung NV an toàn.",
      formula: "COUNT(HS trúng tuyển với NV_đỗ ≤ 3) / COUNT(Tổng HS) × 100%",
      threshold: "≥ 65% Tốt · 50–64% Lưu ý · < 50% Rủi ro cao",
      source: "dim_student (500 HS mô phỏng)",
      rawValue: k01,
      bullet:
        k01 != null
          ? { value: k01, max: 100, target: 70, targetLabel: "Mục tiêu 70%", unit: "%" }
          : undefined,
      tone: k01 == null ? "neutral" : k01 >= 65 ? "good" : k01 >= 50 ? "warn" : "bad",
    },
    {
      code: "K02",
      name: "Lợi thế từ phương thức xét tuyển phụ",
      question: "Nguyện vọng",
      display: pct(k02),
      meaning: "Cao → tận dụng ĐGNL/ĐGTD/học bạ để tăng cơ hội đỗ.",
      formula: "COUNT(NV đủ điểm với best_method ≠ THPT) / COUNT(NV đủ điểm) × 100%",
      threshold: "≥ 35% Lợi thế rõ rệt",
      source: "main_dataset (score_eligible > 0)",
      rawValue: k02,
      bullet:
        k02 != null
          ? { value: k02, max: 100, target: 35, targetLabel: "Ngưỡng 35%", unit: "%" }
          : undefined,
      tone: k02 == null ? "neutral" : k02 >= 35 ? "good" : "neutral",
    },
    {
      code: "K03",
      name: "Biên độ sai số dự báo điểm chuẩn (MAE, MA2)",
      question: "Điểm chuẩn",
      display: k03 == null ? "—" : k03.toFixed(2).replace(".", ",") + " điểm",
      meaning: "Nhỏ → yên tâm chốt NV; lớn → giữ khoảng an toàn rộng hơn.",
      formula: "AVG(|Điểm_chuẩn_thực − Điểm_dự_báo_MA2|)",
      threshold: "≤ 1,5đ Tin cậy cao · 1,5–2,5đ Trung bình · > 2,5đ Thấp",
      source: "fact_cutoff_forecast (MA2)",
      rawValue: k03,
      bullet:
        k03 != null
          ? {
              value: k03,
              max: 3.0,
              target: 1.5,
              targetLabel: "Trần 1,5đ",
              unit: "đ",
              invertRisk: true,
            }
          : undefined,
      tone: k03 == null ? "neutral" : k03 <= 1.5 ? "good" : k03 <= 2.5 ? "warn" : "bad",
    },
    {
      code: "K04",
      name: "Tốc độ tăng trưởng nhu cầu ngành",
      question: "Việc làm",
      display: "Theo ngành",
      meaning: "Tính theo từng nhóm nghề ở mục Chẩn đoán & Việc làm.",
      formula: "(Giá_trị_kỳ_sau − Giá_trị_kỳ_trước) / Giá_trị_kỳ_trước × 100%",
      threshold: "> 0% Tăng trưởng · < 0% Thu hẹp",
      source: "fact_labor_demand",
      rawValue: null,
      tone: "neutral",
    },
    {
      code: "K05",
      name: "Tỷ lệ sinh viên có việc làm sau 1 năm",
      question: "Việc làm",
      display: pct(k05),
      meaning: "≥ 90% → đầu ra ổn định.",
      formula: "AVG(employment_rate_pct) trên fact_employment",
      threshold: "≥ 90% Ổn định · 80–89% Trung bình · < 80% Rủi ro",
      source: "fact_employment (34 bản ghi)",
      rawValue: k05,
      bullet:
        k05 != null
          ? { value: k05, max: 100, target: 90, targetLabel: "Ổn định 90%", unit: "%" }
          : undefined,
      tone: k05 == null ? "neutral" : k05 >= 90 ? "good" : k05 >= 80 ? "warn" : "bad",
    },
    {
      code: "K06",
      name: "Tổng chi phí ước tính toàn khóa",
      question: "Chi phí",
      display: vnd,
      meaning: "Số tiền gia đình cần chuẩn bị cho toàn khóa (bình quân NV trúng tuyển).",
      formula: "AVG(Σ Học_phí_năm + (Sinh_hoạt − Hỗ_trợ) × Số_năm)",
      threshold: "Đối chiếu với tổng ngân sách gia đình (ngưỡng 300 triệu ₫)",
      source: "main_dataset (is_admitted = true)",
      rawValue: k06,
      bullet:
        k06 != null
          ? {
              value: Math.round(k06 / 1_000_000),
              max: 500,
              target: 300,
              targetLabel: "Ngưỡng 300tr",
              unit: "tr",
              invertRisk: true,
            }
          : undefined,
      tone: "neutral",
    },
    {
      code: "K07",
      name: "Tỷ lệ HS trúng tuyển vượt ngân sách gia đình",
      question: "Chi phí",
      display: pct(k07),
      meaning: "> 100% chi phí/ngân sách → cần học bổng, tín dụng, hoặc ngành học phí thấp hơn.",
      formula: "COUNT(HS đỗ có Tổng_chi_phí / Tổng_ngân_sách > 100%) / COUNT(HS đỗ) × 100%",
      threshold: "≤ 30% An toàn · 31–50% Lưu ý · > 50% Báo động đỏ",
      source: "main_dataset (is_admitted = true)",
      rawValue: k07,
      bullet:
        k07 != null
          ? {
              value: k07,
              max: 100,
              target: 50,
              targetLabel: "Báo động 50%",
              unit: "%",
              invertRisk: true,
            }
          : undefined,
      tone: k07 == null ? "neutral" : k07 <= 30 ? "good" : k07 <= 50 ? "warn" : "bad",
    },
  ];
}

/**
 * Tải dữ liệu cho 2 biểu đồ chuyên sâu ở Trang 1 (Executive Overview):
 * (1) Phân bổ kết quả trúng tuyển 500 HS; (2) Ma trận Điểm chuẩn & Học phí 7 trường (CNTT vs Ngành khác).
 */
export async function getExecutiveChartData(): Promise<ExecutiveChartData> {
  const sb = await createClient();

  const [studentsRes, unisRes] = await Promise.all([
    sb
      .from("dim_student")
      .select("admission_status, admitted_nv_order")
      .limit(1000),
    sb
      .from("dim_university")
      .select("university_code, short_name")
      .order("university_code"),
  ]);

  const students = (studentsRes.data ?? []) as {
    admission_status: string;
    admitted_nv_order: number | null;
  }[];

  let nv1Count = 0;
  let nv23Count = 0;
  let nv4PlusCount = 0;
  let rejectedCount = 0;

  for (const s of students) {
    if (s.admission_status === "Trúng tuyển" && s.admitted_nv_order != null) {
      if (s.admitted_nv_order === 1) nv1Count++;
      else if (s.admitted_nv_order <= 3) nv23Count++;
      else nv4PlusCount++;
    } else {
      rejectedCount++;
    }
  }

  const total = students.length;
  const pctOf = (c: number) => (total > 0 ? Number(((c / total) * 100).toFixed(1)) : 0);

  // Phân trang lấy toàn bộ main_dataset để tính ma trận Điểm chuẩn & Chi phí 7 trường
  type AppCostRow = {
    university_code: string;
    industry_group: string | null;
    ref_cutoff_30: number | null;
    est_total_cost_vnd: number | null;
  };
  const apps: AppCostRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("main_dataset")
      .select("university_code, industry_group, ref_cutoff_30, est_total_cost_vnd")
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    apps.push(...(data as AppCostRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const uniBuckets = new Map<
    string,
    {
      cnttCosts: number[];
      cnttCutoffs: number[];
      otherCosts: number[];
      otherCutoffs: number[];
    }
  >();

  for (const r of apps) {
    const bucket = uniBuckets.get(r.university_code) ?? {
      cnttCosts: [],
      cnttCutoffs: [],
      otherCosts: [],
      otherCutoffs: [],
    };
    const isCntt = (r.industry_group ?? "").toUpperCase().includes("CNTT");
    if (isCntt) {
      if (r.est_total_cost_vnd != null) bucket.cnttCosts.push(r.est_total_cost_vnd);
      if (r.ref_cutoff_30 != null) bucket.cnttCutoffs.push(r.ref_cutoff_30);
    } else {
      if (r.est_total_cost_vnd != null) bucket.otherCosts.push(r.est_total_cost_vnd);
      if (r.ref_cutoff_30 != null) bucket.otherCutoffs.push(r.ref_cutoff_30);
    }
    uniBuckets.set(r.university_code, bucket);
  }

  const unis = (unisRes.data ?? []) as { university_code: string; short_name: string | null }[];
  const matrix: UniCostMatrixRow[] = unis.map((u) => {
    const b = uniBuckets.get(u.university_code);
    const avgCostM = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, v) => a + v, 0) / xs.length / 1_000_000) : null;
    const avgCut = (xs: number[]) =>
      xs.length ? Number((xs.reduce((a, v) => a + v, 0) / xs.length).toFixed(2)) : null;

    return {
      universityCode: u.university_code,
      university: u.short_name ?? u.university_code,
      cnttCostM: b ? avgCostM(b.cnttCosts) : null,
      cnttCutoff: b ? avgCut(b.cnttCutoffs) : null,
      otherCostM: b ? avgCostM(b.otherCosts) : null,
      otherCutoff: b ? avgCut(b.otherCutoffs) : null,
    };
  });

  return {
    outcomes: {
      total,
      nv1Count,
      nv23Count,
      nv4PlusCount,
      rejectedCount,
      nv1Pct: pctOf(nv1Count),
      nv23Pct: pctOf(nv23Count),
      nv4PlusPct: pctOf(nv4PlusCount),
      rejectedPct: pctOf(rejectedCount),
    },
    matrix,
  };
}
