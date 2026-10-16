import { createClient } from "@/lib/supabase/server";

export type KpiTone = "good" | "warn" | "bad" | "neutral";

export type Kpi = {
  code: string; // K01..K07
  name: string;
  question: string; // Q1..Q4
  display: string; // chuỗi hiển thị
  meaning: string;
  tone: KpiTone;
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

  // K03 — MAE dự báo MA2 (thang 30), chỉ các dòng đã có actual
  const k03 = await safe<number | null>(async () => {
    const { data } = await supabase
      .from("fact_cutoff_forecast")
      .select("abs_error")
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
      question: "Q1",
      display: pct(k01),
      meaning: "Thấp → danh sách quá mạo hiểm, cần bổ sung NV an toàn.",
      tone: k01 == null ? "neutral" : k01 >= 65 ? "good" : k01 >= 50 ? "warn" : "bad",
    },
    {
      code: "K02",
      name: "Lợi thế từ phương thức xét tuyển phụ",
      question: "Q1",
      display: pct(k02),
      meaning: "Cao → tận dụng ĐGNL/ĐGTD/học bạ để tăng cơ hội đỗ.",
      tone: k02 == null ? "neutral" : k02 >= 35 ? "good" : "neutral",
    },
    {
      code: "K03",
      name: "Biên độ sai số dự báo điểm chuẩn (MAE, MA2)",
      question: "Q2",
      display: k03 == null ? "—" : k03.toFixed(2).replace(".", ",") + " điểm",
      meaning: "Nhỏ → yên tâm chốt NV; lớn → giữ khoảng an toàn rộng hơn.",
      tone: k03 == null ? "neutral" : k03 <= 1.5 ? "good" : k03 <= 2.5 ? "warn" : "bad",
    },
    {
      code: "K04",
      name: "Tốc độ tăng trưởng nhu cầu ngành",
      question: "Q3",
      display: "Theo ngành",
      meaning: "Tính theo từng nhóm nghề ở màn Q3 (dữ liệu nhu cầu tuyển dụng).",
      tone: "neutral",
    },
    {
      code: "K05",
      name: "Tỷ lệ sinh viên có việc làm sau 1 năm",
      question: "Q3",
      display: pct(k05),
      meaning: "≥ 90% → đầu ra ổn định.",
      tone: k05 == null ? "neutral" : k05 >= 90 ? "good" : k05 >= 80 ? "warn" : "bad",
    },
    {
      code: "K06",
      name: "Tổng chi phí ước tính toàn khóa",
      question: "Q4",
      display: vnd,
      meaning: "Số tiền gia đình cần chuẩn bị cho toàn khóa (bình quân NV trúng tuyển).",
      tone: "neutral",
    },
    {
      code: "K07",
      name: "Tỷ lệ HS trúng tuyển vượt ngân sách gia đình",
      question: "Q4",
      display: pct(k07),
      meaning: "> 100% chi phí/ngân sách → cần học bổng, tín dụng, hoặc ngành học phí thấp hơn.",
      tone: k07 == null ? "neutral" : k07 <= 30 ? "good" : k07 <= 50 ? "warn" : "bad",
    },
  ];
}
