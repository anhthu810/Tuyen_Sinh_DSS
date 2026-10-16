import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DataQualityBadge } from "@/components/ui/data-quality-badge";
import { getProgramDetail } from "@/lib/queries/programs";
import { BackToExplorerLink, ProgramAnalysisLinks } from "../_components/program-links";

type ProgramParams = Promise<{ programId: string }>;

// Cache Components: toàn bộ truy cập params/DB nằm trong <Suspense>;
// trang không chứa Client Component nào đọc URL data (không Link/usePathname).
export default function ProgramDetailPage({ params }: { params: ProgramParams }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={params} />
    </Suspense>
  );
}

async function DetailContent({ params }: { params: ProgramParams }) {
  const { programId } = await params;
  const { program, cutoffs, quotas, tuition, employment } = await getProgramDetail(
    programId,
  );

  if (!program) {
    return (
      <div className="space-y-4">
        <BackToExplorerLink />
        <EmptyState
          title="Không tìm thấy ngành"
          description={`Không có ngành với mã "${programId}" trong dữ liệu. Quay lại trang tra cứu để chọn ngành khác.`}
        />
      </div>
    );
  }

  const uni = program.university;
  const cutoffsByYear = [...cutoffs].sort((a, b) => b.admission_year - a.admission_year);

  return (
    <div className="space-y-4">
      <BackToExplorerLink />
      <PageHeader
        title={program.major_name}
        description={`${uni?.university_name ?? program.university_code}${
          uni?.short_name ? ` (${uni.short_name})` : ""
        }${program.major_code ? ` · Mã ngành: ${program.major_code}` : ""}`}
        badge={program.in_simulation ? "Trong mô phỏng" : "Ngoài mô phỏng"}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin ngành</CardTitle>
            <CardDescription>Thuộc tính từ danh mục ngành</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Mã xét tuyển" value={program.admission_code} />
            <InfoRow label="Khối ngành" value={program.khoi_nganh_name ?? program.khoi_nganh} />
            <InfoRow label="Nhóm nghề" value={program.industry_group} />
            <InfoRow label="Tổ hợp môn" value={program.subject_combinations} />
            <InfoRow label="Mã Holland" value={program.holland_code} />
            <InfoRow
              label="Thời gian đào tạo"
              value={program.duration_years ? `${program.duration_years} năm` : null}
            />
            <InfoRow label="Các năm tuyển sinh" value={program.years_offered} />
            {uni?.tier ? <InfoRow label="Hạng trường" value={uni.tier} /> : null}
            {uni?.field_focus ? <InfoRow label="Định hướng" value={uni.field_focus} /> : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Liên kết phân tích</CardTitle>
            <CardDescription>Xem sâu hơn tại các màn hình chuyên biệt</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgramAnalysisLinks programId={programId} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Điểm chuẩn qua các năm</CardTitle>
          <CardDescription>
            Theo từng năm và phương thức xét tuyển — kèm nhãn độ tin cậy nguồn
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cutoffsByYear.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu điểm chuẩn" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Năm</th>
                    <th className="px-4 py-3 font-medium">Phương thức</th>
                    <th className="px-4 py-3 font-medium">Tổ hợp</th>
                    <th className="px-4 py-3 text-right font-medium">Điểm chuẩn</th>
                    <th className="px-4 py-3 text-right font-medium">Thang điểm</th>
                    <th className="px-4 py-3 font-medium">Độ tin cậy</th>
                  </tr>
                </thead>
                <tbody>
                  {cutoffsByYear.map((c) => (
                    <tr key={c.cutoff_id} className="border-b last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        {c.admission_year}
                      </td>
                      <td className="px-4 py-3">{c.admission_method ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {c.subject_combination ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {c.is_missing ? (
                          <Badge tone="warning">Thiếu dữ liệu</Badge>
                        ) : c.cutoff_score != null ? (
                          c.cutoff_score
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {c.score_scale ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <DataQualityBadge
                          confidence={c.confidence}
                          scaleConfirmed={c.scale_confirmed}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chỉ tiêu tuyển sinh</CardTitle>
            <CardDescription>Theo năm và phương thức</CardDescription>
          </CardHeader>
          <CardContent>
            {quotas.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu chỉ tiêu" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Năm</th>
                      <th className="px-4 py-3 font-medium">Phương thức</th>
                      <th className="px-4 py-3 text-right font-medium">Chỉ tiêu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...quotas]
                      .sort((a, b) => b.admission_year - a.admission_year)
                      .map((q) => (
                        <tr key={q.quota_id} className="border-b last:border-b-0">
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {q.admission_year}
                          </td>
                          <td className="px-4 py-3">{q.admission_method ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {q.quota != null ? q.quota.toLocaleString("vi-VN") : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Học phí</CardTitle>
            <CardDescription>Theo năm học (VND/năm)</CardDescription>
          </CardHeader>
          <CardContent>
            {tuition.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu học phí" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Năm học</th>
                      <th className="px-4 py-3 text-right font-medium">Thấp nhất</th>
                      <th className="px-4 py-3 text-right font-medium">Cao nhất</th>
                      <th className="px-4 py-3 text-right font-medium">Trung bình</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tuition.map((t) => (
                      <tr key={t.tuition_id} className="border-b last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-3">
                          {t.academic_year ?? "—"}
                          {t.is_converted_from_credit ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (quy đổi từ tín chỉ)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatVnd(t.tuition_min_vnd_year)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatVnd(t.tuition_max_vnd_year)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatVnd(t.tuition_mid_vnd_year)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tỷ lệ có việc làm sau tốt nghiệp</CardTitle>
          <CardDescription>Theo kết quả khảo sát của trường</CardDescription>
        </CardHeader>
        <CardContent>
          {employment.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu việc làm" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Khóa tốt nghiệp</th>
                    <th className="px-4 py-3 font-medium">Năm khảo sát</th>
                    <th className="px-4 py-3 text-right font-medium">Tỷ lệ có việc làm</th>
                    <th className="px-4 py-3 text-right font-medium">Số SV tốt nghiệp</th>
                    <th className="px-4 py-3 text-right font-medium">Số phản hồi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...employment]
                    .sort((a, b) => (b.graduation_year ?? 0) - (a.graduation_year ?? 0))
                    .map((e) => (
                      <tr key={e.employment_id} className="border-b last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {e.graduation_year ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                          {e.survey_year ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {e.employment_rate_pct != null ? `${e.employment_rate_pct}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {e.n_graduates != null ? e.n_graduates.toLocaleString("vi-VN") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {e.n_responses != null ? e.n_responses.toLocaleString("vi-VN") : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function formatVnd(v: number | null): string {
  if (v == null) return "—";
  return `${v.toLocaleString("vi-VN")} ₫`;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-10 w-2/3" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full lg:col-span-2" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}