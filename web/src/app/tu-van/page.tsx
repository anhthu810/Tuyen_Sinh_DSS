import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { getIndustryGroups, getUniversities } from "@/lib/queries/filters";
import { adviseFromScore } from "@/lib/dss/advise";
import { BUCKET_LABEL, BUCKET_TONE, type Bucket } from "@/lib/dss/recommend";
import { formatVndShort } from "@/lib/format";
import { getSubjectCombinationOptions } from "@/lib/queries/signals";
import { ScoreForm } from "./_components/score-form";

type SP = Promise<{
  score?: string;
  holland?: string;
  industry?: string;
  university?: string;
  combination?: string;
  budget?: string;
}>;

function fmtMargin(m: number) {
  const s = m.toFixed(2).replace(".", ",");
  return m >= 0 ? `+${s}` : s;
}

export default function TuVanPage({ searchParams }: { searchParams: SP }) {
  return (
    <div>
      <PageHeader
        title="Tư vấn chọn ngành & trường"
        description="Nhập điểm của bạn (thang 30) → hệ thống quét toàn bộ ngành của 7 trường, phân loại cơ hội đỗ (Với cao / Vừa sức / Chắc đỗ) và gợi ý ngành phù hợp theo sở thích, việc làm và chi phí."
        badge="Engine DSS · nhập điểm → tư vấn"
      />
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
        <TuVanContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-xs text-muted-foreground">
        Điểm chuẩn tham chiếu ưu tiên dùng <strong>dự báo</strong> (MA2) cho năm
        tới; nếu ngành chưa có dự báo thì dùng điểm chuẩn thực tế gần nhất. Biên
        điểm = điểm bạn − điểm chuẩn tham chiếu. Kết quả mang tính tham khảo.
      </p>
    </div>
  );
}

async function TuVanContent({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [industries, universities, subjectCombinations] = await Promise.all([
    getIndustryGroups(),
    getUniversities(),
    getSubjectCombinationOptions(),
  ]);

  const score = sp.score != null && sp.score !== "" ? Number(sp.score) : null;
  const scoreValid =
    score != null && Number.isFinite(score) && score >= 0 && score <= 30;

  return (
    <div className="space-y-4">
      <ScoreForm
        industries={industries}
        universities={universities.map((u) => ({
          university_code: u.university_code,
          short_name: u.short_name,
          university_name: u.university_name,
        }))}
        subjectCombinations={subjectCombinations}
        initial={{
          score: sp.score,
          holland: sp.holland,
          industry: sp.industry,
          university: sp.university,
          combination: sp.combination,
          budget: sp.budget,
        }}
      />

      {!scoreValid ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nhập điểm thang 30 của bạn ở trên rồi bấm{" "}
            <strong>Phân tích &amp; tư vấn</strong> để nhận gợi ý ngành/trường
            phù hợp.
          </CardContent>
        </Card>
      ) : (
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <Results
            score={score!}
            holland={sp.holland}
            industry={sp.industry}
            university={sp.university}
            subjectCombination={sp.combination}
            budget={sp.budget ? Number(sp.budget) : undefined}
          />
        </Suspense>
      )}
    </div>
  );
}

async function Results({
  score,
  holland,
  industry,
  university,
  subjectCombination,
  budget,
}: {
  score: number;
  holland?: string;
  industry?: string;
  university?: string;
  subjectCombination?: string;
  budget?: number;
}) {
  const items = await adviseFromScore({
    score30: score,
    hollandCode: holland || undefined,
    industryGroup: industry || undefined,
    universityCode: university || undefined,
    subjectCombination: subjectCombination || undefined,
    budgetVndYear: budget,
  });

  if (!items.length) {
    return (
      <EmptyState
        title="Không có ngành phù hợp dữ liệu"
        description="Không tìm thấy ngành nào có điểm chuẩn/dự báo khớp bộ lọc. Thử bỏ bớt lọc nhóm nghề/trường."
      />
    );
  }

  const counts: Record<Bucket, number> = { reach: 0, match: 0, safety: 0 };
  items.forEach((it) => counts[it.bucket]++);
  const top = items.slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Ngành xét"
          value={`${items.length}`}
          hint="có điểm chuẩn/dự báo khớp bộ lọc"
        />
        <Tile label="Chắc đỗ" value={`${counts.safety}`} tone="success" />
        <Tile label="Vừa sức" value={`${counts.match}`} tone="warning" />
        <Tile label="Với cao" value={`${counts.reach}`} tone="danger" />
      </div>

      <Card>
        <div className="p-5 pb-0">
          <h3 className="text-base font-semibold">
            Top ngành gợi ý (điểm bạn nhập: {score.toFixed(2).replace(".", ",")}
            )
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Sắp theo điểm tổng hợp (đỗ + phù hợp{holland ? " Holland" : ""} +
            việc làm
            {budget ? " + chi trả" : ""}). Hiển thị tối đa 50/{items.length}{" "}
            ngành.
          </p>
        </div>
        <CardContent className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Ngành</th>
                  <th className="py-2 pr-3 font-medium">Tổ hợp</th>
                  <th className="py-2 pr-3 font-medium">Trường</th>
                  <th className="py-2 pr-3 font-medium">Phân loại</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    ĐC tham chiếu
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">Biên</th>
                  <th className="py-2 pr-3 text-right font-medium">P(đỗ)</th>
                  <th className="py-2 pr-3 text-right font-medium">Phù hợp</th>
                  <th className="py-2 pr-3 text-right font-medium">Việc làm</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Chi phí khóa
                  </th>
                  <th className="py-2 text-right font-medium">Σ</th>
                </tr>
              </thead>
              <tbody>
                {top.map((it, i) => (
                  <tr key={it.programId} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/explorer/${it.programId}`}
                        className="hover:underline"
                      >
                        {it.majorName ?? it.programId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {it.subjectCombinations.length
                        ? it.subjectCombinations.join(", ")
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {it.shortName ?? it.universityCode}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={BUCKET_TONE[it.bucket]}>
                        {BUCKET_LABEL[it.bucket]}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {it.refCutoff30.toFixed(2).replace(".", ",")}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {it.refSource === "forecast"
                          ? `dự báo ${it.refYear}`
                          : `thực ${it.refYear}`}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmtMargin(it.margin)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {Math.round(it.admitProb * 100)}%
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {it.fit == null ? "—" : Math.round(it.fit)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {it.employmentRate == null
                        ? "—"
                        : `${it.employmentRate.toFixed(0)}%`}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {it.estTotalCost == null
                        ? "—"
                        : formatVndShort(it.estTotalCost)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {Math.round(it.composite)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const t =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${t}`}>{value}</div>
        {hint ? (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
