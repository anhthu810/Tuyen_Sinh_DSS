import { Suspense } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { FormulaTooltip } from "@/components/dss/formula-tooltip";
import { adviseFromScore, type AdviseItem } from "@/lib/dss/advise";
import { getIndustryGroups } from "@/lib/queries/filters";
import { getSubjectCombinationOptions } from "@/lib/queries/signals";
import {
  BUCKET_LABEL,
  probAtLeastOne,
  recommendOrder,
  scoreNv,
  type Bucket,
  type NvInput,
} from "@/lib/dss/recommend";
import { buildStudentProfileInsights } from "@/lib/dss/insights";
import { formatPct, formatVndShort } from "@/lib/format";
import {
  DiagnosticCharts,
  type DiagnosticNvDatum,
} from "./_components/diagnostic-charts";
import {
  DiagnosticRecommendations,
  KeyInsightBanner,
} from "./_components/diagnostic-bento";
import { NewStudentForm } from "./_components/new-student-form";

const BUCKET_PASTEL: Record<Bucket, string> = {
  reach: "bg-rose-50 text-rose-700 border border-rose-200/60",
  match: "bg-amber-50 text-amber-700 border border-amber-200/60",
  safety: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
};

const BAR_COLOR: Record<Bucket, string> = {
  reach: "bg-rose-500",
  match: "bg-amber-500",
  safety: "bg-emerald-500",
};

type SearchParams = Promise<{
  score?: string;
  combination?: string;
  industry?: string;
  holland?: string;
  budgetM?: string;
  count?: string;
}>;

/**
 * Chọn danh sách NV cân bằng bậc thang (Với cao / Vừa sức / Chắc đỗ) từ kết quả quét 380 ngành
 * để học sinh mới có chiến lược an toàn thay vì dồn toàn bộ vào 1 nhóm.
 */
function pickBalancedLadder(candidates: AdviseItem[], count: number): AdviseItem[] {
  if (candidates.length <= count) return candidates;

  const targetReach = Math.max(1, Math.round(count * 0.25));
  const targetMatch = Math.max(2, Math.round(count * 0.45));
  const targetSafety = Math.max(1, count - targetReach - targetMatch);

  const picked: AdviseItem[] = [];
  const used = new Set<string>();

  const takeFrom = (bucket: Bucket, limit: number) => {
    let taken = 0;
    for (const c of candidates) {
      if (taken >= limit) break;
      if (c.bucket === bucket && !used.has(c.programId)) {
        picked.push(c);
        used.add(c.programId);
        taken++;
      }
    }
  };

  takeFrom("reach", targetReach);
  takeFrom("match", targetMatch);
  takeFrom("safety", targetSafety);

  for (const c of candidates) {
    if (picked.length >= count) break;
    if (!used.has(c.programId)) {
      picked.push(c);
      used.add(c.programId);
    }
  }

  return picked;
}

export default function ChanDoanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="-mx-5 -my-6 min-h-screen bg-slate-50 px-5 py-6 md:-mx-8 md:-my-8 md:px-8 md:py-8">
      <Suspense fallback={<DiagnosticSkeleton />}>
        <ChanDoanContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ChanDoanContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [combinations, industries] = await Promise.all([
    getSubjectCombinationOptions(),
    getIndustryGroups(),
  ]);

  const parsedScore = sp.score != null && sp.score !== "" ? Number(sp.score) : 25;
  const score =
    Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= 30
      ? parsedScore
      : 25;

  const parsedBudgetM = sp.budgetM != null && sp.budgetM !== "" ? Number(sp.budgetM) : 100;
  const budgetMillions =
    Number.isFinite(parsedBudgetM) && parsedBudgetM > 0 ? parsedBudgetM : 100;
  const budgetYear = budgetMillions * 1_000_000;

  const parsedCount = Number(sp.count);
  const count = [6, 9, 12, 15].includes(parsedCount) ? parsedCount : 9;

  const combination =
    sp.combination && combinations.includes(sp.combination.toUpperCase())
      ? sp.combination.toUpperCase()
      : "";
  const industry =
    sp.industry && industries.includes(sp.industry) ? sp.industry : "";
  const holland =
    sp.holland && /^[RIASEC]{1,3}$/i.test(sp.holland)
      ? sp.holland.toUpperCase()
      : "";

  const candidates = await adviseFromScore({
    score30: score,
    hollandCode: holland || undefined,
    industryGroup: industry || undefined,
    subjectCombination: combination || undefined,
    budgetVndYear: budgetYear,
  });

  const selected = pickBalancedLadder(candidates, count);
  const byProgram = new Map(selected.map((c) => [c.programId, c]));

  const inputs: NvInput[] = selected.map((c, idx) => ({
    programId: c.programId,
    majorName: c.majorName,
    universityCode: c.universityCode,
    shortName: c.shortName,
    nvOrder: idx + 1,
    bestMethod: c.refSource === "forecast" ? `Dự báo ${c.refYear ?? ""}` : `Điểm ${c.refYear ?? ""}`,
    margin30: c.margin,
    programMae: c.band,
    hollandMatchPct: c.fit,
    affordabilityIndexPct: c.affordabilityIndexPct,
    employmentRatePct: c.employmentRate,
    estTotalCostVnd: c.estTotalCost,
    isAdmitted: null,
  }));

  const scored = inputs.map(scoreNv);
  const recommended = recommendOrder(scored);
  const probAny = probAtLeastOne(scored.map((s) => s.admitProb ?? 0)) * 100;

  const counts: Record<Bucket, number> = { reach: 0, match: 0, safety: 0 };
  scored.forEach((s) => {
    if (s.bucket) counts[s.bucket]++;
  });

  const insights = buildStudentProfileInsights({
    scored,
    familyBudgetYear: budgetYear,
  });

  const chartItems: DiagnosticNvDatum[] = recommended.map((s, idx) => ({
    nvLabel: `NV${idx + 1}`,
    programId: s.programId,
    majorName: s.majorName ?? s.programId,
    university: s.shortName ?? s.universityCode,
    bucket: s.bucket,
    margin30: s.margin30,
    admitProbPct: Math.round((s.admitProb ?? 0) * 100),
    affordabilityPct: s.affordabilityIndexPct,
    estTotalCostVnd: s.estTotalCostVnd,
    employmentRatePct: s.employmentRatePct,
  }));

  const bottlenecks: string[] = [];
  const top3 = recommended.slice(0, 3);
  if (top3.length >= 3 && top3.every((s) => s.bucket === "reach")) {
    bottlenecks.push("Cả 3 NV đầu đều thuộc nhóm Với cao");
  }
  if (counts.safety === 0 && recommended.length > 0) {
    bottlenecks.push("Chưa có NV Chắc đỗ để chốt an toàn");
  }
  const missingEmp = scored.filter((s) => s.employmentRatePct == null).length;
  if (missingEmp > 0) {
    bottlenecks.push(`${missingEmp}/${scored.length} ngành thiếu dữ liệu việc làm`);
  }
  const overBudgetNvs = scored.filter((s) => (s.affordabilityIndexPct ?? 0) > 100);
  if (overBudgetNvs.length > 0) {
    bottlenecks.push(`${overBudgetNvs.length}/${scored.length} NV vượt ngân sách`);
  }

  const topCandidate = selected[0];
  const ladderTitle = recommended.length
    ? `Chiến lược ${counts.reach} Với / ${counts.match} Vừa / ${counts.safety} Chắc đỗ bảo đảm ${Math.round(probAny)}% xác suất trúng tuyển (${overBudgetNvs.length}/${scored.length} NV vượt ngân sách)`
    : "Không tìm thấy ngành khớp bộ lọc hiện tại";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header gọn gàng cùng dòng với badge trạng thái hồ sơ mới */}
      <header className="flex flex-col gap-2 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[11px] font-medium text-white">
              2. Diagnostic · Học sinh mới
            </span>
            <span className="text-xs text-slate-500">
              Điểm {score.toFixed(2).replace(".", ",")}/30 · Ngân sách {budgetMillions} tr/năm ·{" "}
              {combination || "Mọi tổ hợp"}
              {industry ? ` · ${industry}` : ""}
              {holland ? ` · Holland ${holland}` : ""}
            </span>
          </div>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
            Insight &amp; Chẩn đoán xếp nguyện vọng
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <Link href="/tu-van" className="font-medium text-indigo-600 hover:underline">
            Tra cứu toàn bộ 380 ngành →
          </Link>
          <Link href="/nguyen-vong" className="hover:text-slate-800 hover:underline">
            Đối chiếu mẫu 500 HS →
          </Link>
        </div>
      </header>

      {/* Form nhập trực tiếp thông số cho học sinh mới */}
      <NewStudentForm
        combinations={combinations}
        industries={industries}
        initial={{
          score,
          combination,
          industry,
          holland,
          budgetMillions,
          count,
        }}
      />

      {candidates.length === 0 ? (
        <EmptyState
          title="Không có ngành phù hợp bộ lọc"
          description="Thử chọn 'Tất cả tổ hợp' hoặc 'Tất cả nhóm nghề' để mở rộng danh sách xét tuyển."
        />
      ) : (
        <>
          {/* Hàng Metric Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Xác suất đỗ ≥ 1 NV
                </span>
                <FormulaTooltip
                  title="Xác suất đỗ tổ hợp NV"
                  formula="1 − Π(1 − Φ(margin_i / band_i))"
                  threshold="≥ 90% An toàn · 70–89% Lưu ý · < 70% Rủi ro"
                  source="Dự báo MA2 & điểm chuẩn"
                />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums text-slate-900">
                  {Math.round(probAny)}%
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    probAny >= 90
                      ? "bg-emerald-50 text-emerald-700"
                      : probAny >= 70
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {probAny >= 90 ? "An toàn" : probAny >= 70 ? "Lưu ý" : "Rủi ro"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Quét từ {candidates.length} ngành khớp điều kiện
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Cấu trúc Với / Vừa / Chắc
                </span>
                <FormulaTooltip
                  title="Phân loại nhóm nguyện vọng"
                  formula="Với: margin < −0,4×band · Vừa: [−0,4; 1,1)×band · Chắc: ≥ 1,1×band"
                  threshold="Khuyến nghị giữ tối thiểu 1–2 NV Chắc đỗ"
                  source="Engine DSS"
                />
              </div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                {counts.reach} / {counts.match} / {counts.safety}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Trong {recommended.length} NV xếp bậc thang
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  NV vượt ngân sách
                </span>
                <FormulaTooltip
                  title="Áp lực tài chính (K07)"
                  formula="Tổng_chi_phí / (Ngân_sách_năm × Số_năm) × 100%"
                  threshold="≤ 80% An toàn · > 100% Vượt NS"
                  source="fact_tuition & tham số sinh hoạt"
                />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums text-slate-900">
                  {overBudgetNvs.length}/{scored.length}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    overBudgetNvs.length === 0
                      ? "bg-emerald-50 text-emerald-700"
                      : overBudgetNvs.length <= scored.length / 2
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {overBudgetNvs.length === 0 ? "Trong ngưỡng" : "Vượt ngưỡng"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Ngân sách: {formatVndShort(budgetYear)}/năm
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Ngành tối ưu nhất (Σ)
                </span>
                <FormulaTooltip
                  title="Điểm tổng hợp 4 trục Σ"
                  formula="Trung bình của Xác suất đỗ · Holland · Việc làm · Khả năng chi trả"
                  source="adviseFromScore"
                />
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tabular-nums text-slate-900">
                  {topCandidate ? `${Math.round(topCandidate.composite)}/100` : "—"}
                </span>
                <span className="truncate text-xs font-medium text-indigo-600">
                  {topCandidate?.shortName ?? topCandidate?.universityCode ?? ""}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {topCandidate?.majorName ?? "—"}
              </p>
            </div>
          </div>

          {/* Hàng 1: Key Insight Banner (Bento Grid 3 cột bằng nhau) */}
          <KeyInsightBanner points={insights.points} bottlenecks={bottlenecks} />

          {/* Hàng 2: 2 Biểu đồ song song tỷ lệ 5:7 */}
          <DiagnosticCharts items={chartItems} probAnyPct={probAny} />

          {/* Hàng 3: Bảng danh sách nguyện vọng Full-width */}
          <section className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                {ladderTitle}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Sắp xếp tự động theo bậc thang Với cao → Vừa sức → Chắc đỗ dựa trên điểm chuẩn dự
                báo/gần nhất, biên an toàn ±MAE và chi phí toàn khóa.
              </p>
            </div>

            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/95 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400 backdrop-blur">
                  <tr>
                    <th className="px-5 py-3">Đề xuất</th>
                    <th className="px-3 py-3">Ngành &amp; Trường</th>
                    <th className="px-3 py-3">Trạng thái</th>
                    <th className="px-3 py-3 text-right">ĐC tham chiếu</th>
                    <th className="px-3 py-3 text-right">Biên điểm</th>
                    <th className="px-3 py-3">Xác suất P(đỗ)</th>
                    <th className="px-3 py-3 text-right">Chi phí khóa</th>
                    <th className="px-5 py-3 text-right">Áp lực NS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recommended.map((s, i) => {
                    const meta = byProgram.get(s.programId);
                    const probPct = s.admitProb != null ? Math.round(s.admitProb * 100) : 0;
                    const bucketKey = s.bucket ?? "match";
                    const overBudget = (s.affordabilityIndexPct ?? 0) > 100;
                    return (
                      <tr
                        key={s.programId}
                        className="transition-colors hover:bg-slate-50/80"
                      >
                        <td className="px-5 py-3 font-semibold tabular-nums text-slate-900">
                          NV{i + 1}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={`/explorer/${s.programId}`}
                            className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                          >
                            {s.majorName ?? s.programId}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {s.shortName ?? s.universityCode}
                            {meta?.subjectCombinations.length
                              ? ` · ${meta.subjectCombinations.slice(0, 3).join(", ")}`
                              : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {s.bucket ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BUCKET_PASTEL[s.bucket]}`}
                            >
                              {BUCKET_LABEL[s.bucket]}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-600">
                          {meta ? (
                            <>
                              <span className="font-medium text-slate-800">
                                {meta.refCutoff30.toFixed(2).replace(".", ",")}
                              </span>
                              <span className="ml-1 text-[11px] text-slate-400">
                                ({meta.refSource === "forecast" ? "dự báo" : "thực"}{" "}
                                {meta.refYear ?? ""})
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-700">
                          {s.margin30 != null
                            ? `${s.margin30 >= 0 ? "+" : ""}${s.margin30.toFixed(2).replace(".", ",")}`
                            : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${BAR_COLOR[bucketKey]}`}
                                style={{ width: `${Math.min(100, Math.max(0, probPct))}%` }}
                              />
                            </div>
                            <span className="w-9 text-right text-xs font-semibold tabular-nums text-slate-700">
                              {s.admitProb != null ? `${probPct}%` : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-xs tabular-nums text-slate-700">
                          {formatVndShort(s.estTotalCostVnd)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                              s.affordabilityIndexPct == null
                                ? "bg-slate-100 text-slate-500"
                                : overBudget
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {formatPct(s.affordabilityIndexPct, 0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Hàng 4: Khối Khuyến nghị DSS (IF-THEN) dạng thẻ tương tác Accordion */}
          <DiagnosticRecommendations rules={insights.rules} />
        </>
      )}
    </div>
  );
}

function DiagnosticSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-xl lg:col-span-5" />
        <Skeleton className="h-80 rounded-xl lg:col-span-7" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
