import { Suspense } from "react";
import { AlertTriangle, GraduationCap, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getPrograms } from "@/lib/queries/programs";
import { estimateCost, COST_PARAMS } from "@/lib/dss/cost";
import { formatVnd, formatVndShort, formatPct } from "@/lib/format";
import { CostControls } from "./_components/cost-controls";
import { AffordabilityMeter } from "./_components/affordability-meter";

const DEFAULT_BUDGET = 100_000_000;

export default function ChiPhiPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; budget?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Chi phí & khả năng chi trả"
        description="Ước tính tổng chi phí toàn khóa học (K06) và chỉ số khả năng chi trả (K07) theo ngân sách gia đình — dựa trên học phí thực tế từ Supabase, chi phí sinh hoạt và hỗ trợ theo Nghị định 116 cho ngành sư phạm (giả định từ KPI_Sheet – THAM SỐ)."
        badge="Dữ liệu trực tiếp từ Supabase"
      />
      <Suspense fallback={<PageSkeleton />}>
        <ChiPhiContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ChiPhiContent({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; budget?: string }>;
}) {
  const sp = await searchParams;
  const programs = await getPrograms();

  if (!programs.length) {
    return (
      <EmptyState
        title="Chưa có dữ liệu ngành học"
        description="Không đọc được danh sách ngành từ dim_program. Kiểm tra kết nối Supabase và policy RLS đọc công khai."
      />
    );
  }

  const parsedBudget = Number(sp.budget);
  const budget =
    Number.isFinite(parsedBudget) && parsedBudget > 0 ? Math.round(parsedBudget) : DEFAULT_BUDGET;

  const programId =
    sp.program && programs.some((p) => p.program_id === sp.program)
      ? sp.program
      : programs[0].program_id;
  const program = programs.find((p) => p.program_id === programId)!;

  const cost = await estimateCost({ programId, budgetVndYear: budget });

  const options = programs.map((p) => ({
    value: p.program_id,
    label: `${p.major_name} · ${p.short_name ?? p.university_name ?? p.university_code}`,
  }));

  const affordability = cost.affordabilityIndexPct;
  const livingNetPerYear = COST_PARAMS.livingVndYear - cost.livingSupportVndYear;
  const livingTotal = livingNetPerYear * cost.durationYears;
  const tuitionTotal = cost.totalCostVnd != null ? cost.totalCostVnd - livingTotal : null;
  const budgetTotal = budget * cost.durationYears;

  return (
    <div className="space-y-4">
      <CostControls options={options} program={programId} budget={budget} />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-5 text-sm">
          <span className="font-medium">{program.major_name}</span>
          <span className="text-muted-foreground">
            {program.university_name ?? program.university_code}
          </span>
          {program.program_type ? (
            <Badge tone="neutral">{program.program_type}</Badge>
          ) : null}
          <span className="text-muted-foreground">
            Mã ngành: {program.major_code ?? program.program_id}
          </span>
        </CardContent>
      </Card>

      {cost.totalCostVnd == null ? (
        <EmptyState
          title="Chưa có dữ liệu học phí cho ngành này"
          description="Không tìm thấy học phí của ngành (kể cả mức học phí chung 'ALL' của trường) trong fact_tuition. Hãy chọn ngành khác hoặc bổ sung dữ liệu học phí."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="size-4" /> Chỉ số khả năng chi trả (K07)
                </CardTitle>
                <CardDescription>
                  Tổng chi phí toàn khóa / tổng ngân sách gia đình × 100. Mốc 100% nghĩa là chi phí
                  đúng bằng khả năng chi trả.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AffordabilityMeter value={affordability} />
                <div className="mt-5 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tổng chi phí toàn khóa (K06)</span>
                    <span className="font-medium">{formatVnd(cost.totalCostVnd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Tổng ngân sách ({cost.durationYears} năm)
                    </span>
                    <span className="font-medium">{formatVnd(budgetTotal)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="size-4" /> Bóc tách chi phí toàn khóa (K06)
                </CardTitle>
                <CardDescription>
                  Học phí tăng {formatPct(COST_PARAMS.tuitionGrowthPerYear * 100)} mỗi năm theo
                  giả định của bảng tham số.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      Học phí năm đầu
                      {cost.tuitionIsImputed ? (
                        <Badge tone="warning">ước lượng – học phí chung của trường</Badge>
                      ) : (
                        <Badge tone="success">theo ngành</Badge>
                      )}
                    </span>
                  }
                  value={formatVnd(cost.firstYearTuitionVnd)}
                />
                <Row
                  label={`Tổng học phí ${cost.durationYears} năm (đã cộng dồn tăng hằng năm)`}
                  value={tuitionTotal != null ? formatVnd(tuitionTotal) : "—"}
                />
                <Row
                  label={`Chi phí sinh hoạt (${formatVndShort(COST_PARAMS.livingVndYear)}/năm)`}
                  value={formatVnd(livingTotal)}
                />
                {cost.livingSupportVndYear > 0 ? (
                  <Row
                    label={
                      <span className="flex flex-wrap items-center gap-2">
                        Hỗ trợ sinh hoạt theo Nghị định 116 (ngành sư phạm)
                        <Badge tone="success">đã trừ</Badge>
                      </span>
                    }
                    value={`− ${formatVnd(cost.livingSupportVndYear * cost.durationYears)}`}
                  />
                ) : null}
                <div className="border-t pt-3">
                  <Row
                    label={<span className="font-semibold">Tổng chi phí toàn khóa (K06)</span>}
                    value={<span className="font-semibold">{formatVnd(cost.totalCostVnd)}</span>}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {affordability != null && affordability > 100 ? (
            <div className="flex items-start gap-3 rounded-xl border border-dashed p-5">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={affordability > 150 ? "danger" : "warning"}>
                    Vượt ngân sách {formatPct(affordability)}
                  </Badge>
                  <span className="text-sm font-medium">
                    Vượt ngân sách — cân nhắc học bổng, ngành học phí thấp hơn, hoặc vay tín dụng
                    SV.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Chênh lệch so với tổng ngân sách:{" "}
                  {formatVnd(Math.abs(cost.totalCostVnd - budgetTotal))} trên{" "}
                  {cost.durationYears} năm học.
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Giả định chi phí: sinh hoạt {formatVnd(COST_PARAMS.livingVndYear)}/năm; học phí tăng{" "}
        {formatPct(COST_PARAMS.tuitionGrowthPerYear * 100)}/năm; hỗ trợ{" "}
        {formatVnd(COST_PARAMS.teacherSupportVndYear)}/năm cho ngành sư phạm theo Nghị định 116.
        Học phí lấy từ fact_tuition (ưu tiên theo ngành, fallback mức chung của trường).
      </p>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="whitespace-nowrap text-right font-medium">{value}</span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}