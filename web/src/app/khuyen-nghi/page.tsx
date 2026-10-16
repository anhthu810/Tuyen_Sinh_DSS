import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { getStudentOptions } from "@/lib/queries/students";
import {
  getStudentApplications,
  getEmploymentRateByPrograms,
} from "@/lib/queries/applications";
import { getForecastAccuracy } from "@/lib/queries/forecast";
import { scoreNv, axisScores, type NvInput } from "@/lib/dss/recommend";
import { RecommendationBoard, type SigmaItem } from "./_components/recommendation-board";

export default function SigmaPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Σ · Khuyến nghị tổng hợp"
        description="Xếp hạng các ngành của học sinh theo 4 trục — phù hợp (Holland), khả năng đỗ, cơ hội việc làm, khả năng chi trả — với trọng số bạn tự điều chỉnh."
        badge="Engine DSS · đa tiêu chí"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <SigmaContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-xs text-muted-foreground">
        Mỗi trục chuẩn hóa về thang 0–100. Điểm Σ = trung bình có trọng số của 4 trục. Ngành thiếu
        dữ liệu việc làm được tính trung tính (50) ở trục đó.
      </p>
    </div>
  );
}

async function SigmaContent({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const sp = await searchParams;
  const options = await getStudentOptions();
  if (!options.length) {
    return <EmptyState title="Chưa có hồ sơ học sinh" description="Không đọc được dim_student." />;
  }
  const studentId =
    sp.student && options.some((o) => o.student_id === sp.student)
      ? sp.student
      : options[0].student_id;

  const [apps, acc] = await Promise.all([
    getStudentApplications(studentId),
    getForecastAccuracy(),
  ]);
  const maeMap = Object.fromEntries(acc.map((a) => [a.programId, a.mae]));
  const empMap = await getEmploymentRateByPrograms(apps.map((a) => a.program_id));

  const items: SigmaItem[] = apps.map((a) => {
    const input: NvInput = {
      programId: a.program_id,
      majorName: a.major_name,
      universityCode: a.university_code,
      shortName: a.short_name,
      nvOrder: a.nv_order,
      bestMethod: a.best_method,
      margin30: a.best_margin_30,
      programMae: maeMap[a.program_id] ?? null,
      hollandMatchPct: a.holland_match_pct,
      affordabilityIndexPct: a.affordability_index_pct,
      employmentRatePct: empMap[a.program_id] ?? null,
      estTotalCostVnd: a.est_total_cost_vnd,
      isAdmitted: a.is_admitted,
    };
    const s = scoreNv(input);
    return {
      programId: a.program_id,
      majorName: a.major_name,
      shortName: a.short_name,
      universityCode: a.university_code,
      bucket: s.bucket,
      admitProb: s.admitProb,
      axes: axisScores(s),
    };
  });

  return <RecommendationBoard options={options} selected={studentId} items={items} />;
}
