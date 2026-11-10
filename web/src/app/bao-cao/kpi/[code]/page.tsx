import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

type Report = {
  title: string;
  description: string;
  formula: string;
  metrics: { label: string; value: string }[];
  headers: string[];
  rows: string[][];
  note?: string;
};

const KPI_NAMES: Record<string, string> = {
  K01: "Tỷ lệ đỗ NV1–NV3",
  K02: "Lợi thế từ phương thức xét tuyển phụ",
  K03: "Sai số dự báo điểm chuẩn MA2",
  K04: "Tăng trưởng nhu cầu nhân lực",
  K05: "Tỷ lệ có việc làm sau 1 năm",
  K06: "Chi phí ước tính toàn khóa",
  K07: "Tỷ lệ trúng tuyển vượt ngân sách",
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const formatNumber = (value: number | null, digits = 1) =>
  value == null ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });

const formatPercent = (value: number | null) =>
  value == null ? "—" : `${formatNumber(value)}%`;

const formatVnd = (value: number | null) =>
  value == null ? "—" : `${Math.round(value).toLocaleString("vi-VN")} ₫`;

async function loadReport(code: string): Promise<Report | null> {
  const supabase = await createClient();

  if (code === "K01") {
    const { data, error } = await supabase
      .from("dim_student")
      .select("cohort_year, admission_status, admitted_nv_order");
    if (error) throw new Error(`Không tải được dữ liệu K01: ${error.message}`);
    const students = data ?? [];
    const groups = new Map<number, { total: number; admitted: number }>();
    for (const student of students) {
      const current = groups.get(student.cohort_year) ?? { total: 0, admitted: 0 };
      current.total++;
      if (student.admission_status === "Trúng tuyển" && (student.admitted_nv_order ?? 99) <= 3) {
        current.admitted++;
      }
      groups.set(student.cohort_year, current);
    }
    const admitted = students.filter(
      (student) =>
        student.admission_status === "Trúng tuyển" &&
        (student.admitted_nv_order ?? 99) <= 3,
    ).length;
    return {
      title: KPI_NAMES.K01,
      description: "Phân tích số học sinh trúng tuyển ở một trong ba nguyện vọng đầu, phân theo khóa.",
      formula: "Số học sinh trúng tuyển NV1–NV3 ÷ tổng số học sinh × 100%.",
      metrics: [
        { label: "Tổng học sinh", value: students.length.toLocaleString("vi-VN") },
        { label: "Trúng tuyển NV1–NV3", value: admitted.toLocaleString("vi-VN") },
        { label: "Tỷ lệ chung", value: formatPercent(students.length ? (admitted / students.length) * 100 : null) },
      ],
      headers: ["Khóa", "Tổng học sinh", "Trúng tuyển NV1–NV3", "Tỷ lệ"],
      rows: [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([year, group]) => [
          String(year),
          String(group.total),
          String(group.admitted),
          formatPercent(group.total ? (group.admitted / group.total) * 100 : null),
        ]),
      note: "Chỉ dùng trạng thái Trúng tuyển và thứ tự nguyện vọng được nhận không lớn hơn 3.",
    };
  }

  if (code === "K02") {
    const { data, error } = await supabase
      .from("main_dataset")
      .select("best_method, score_eligible")
      .gt("score_eligible", 0);
    if (error) throw new Error(`Không tải được dữ liệu K02: ${error.message}`);
    const eligible = data ?? [];
    const byMethod = new Map<string, number>();
    for (const row of eligible) {
      const method = row.best_method ?? "(Chưa xác định)";
      byMethod.set(method, (byMethod.get(method) ?? 0) + 1);
    }
    const secondary = eligible.filter((row) => row.best_method != null && row.best_method !== "THPT").length;
    return {
      title: KPI_NAMES.K02,
      description: "Thống kê các nguyện vọng đủ điều kiện điểm và phương thức xét tuyển tốt nhất được ghi nhận.",
      formula: "Số nguyện vọng đủ điểm có best_method khác THPT ÷ tổng nguyện vọng đủ điểm × 100%.",
      metrics: [
        { label: "Nguyện vọng đủ điểm", value: eligible.length.toLocaleString("vi-VN") },
        { label: "Dùng phương thức khác THPT", value: secondary.toLocaleString("vi-VN") },
        { label: "Tỷ lệ", value: formatPercent(eligible.length ? (secondary / eligible.length) * 100 : null) },
      ],
      headers: ["Phương thức tốt nhất", "Số nguyện vọng", "Tỷ lệ trong nhóm đủ điểm"],
      rows: [...byMethod.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([method, count]) => [
          method,
          count.toLocaleString("vi-VN"),
          formatPercent(eligible.length ? (count / eligible.length) * 100 : null),
        ]),
      note: "Đơn vị thống kê là nguyện vọng trong main_dataset, không phải số thí sinh duy nhất.",
    };
  }

  if (code === "K03") {
    const { data, error } = await supabase
      .from("fact_cutoff_forecast")
      .select("program_id, target_year, method, admission_method, score_scale, forecast_cutoff, actual_cutoff, abs_error, dim_program(major_name)")
      .eq("is_primary", true)
      .ilike("method", "MA2%")
      .not("actual_cutoff", "is", null)
      .limit(2000);
    if (error) throw new Error(`Không tải được dữ liệu K03: ${error.message}`);
    const forecasts = (data ?? []) as unknown as {
      program_id: string;
      target_year: number;
      method: string | null;
      admission_method: string | null;
      score_scale: number | null;
      forecast_cutoff: number | null;
      actual_cutoff: number | null;
      abs_error: number | null;
      dim_program: { major_name?: string } | null;
    }[];
    const errors = forecasts
      .map((item) => item.abs_error)
      .filter((value): value is number => value != null);
    return {
      title: KPI_NAMES.K03,
      description: "Sai số tuyệt đối giữa dự báo MA2 và điểm chuẩn thực tế trên chuỗi chính của từng ngành (cùng trường + ngành + phương thức + thang điểm).",
      formula: "MAE = trung bình |điểm dự báo MA2 − điểm thực tế|, chỉ trên chuỗi THPT / quy đổi chung (is_primary), dòng có actual_cutoff.",
      metrics: [
        { label: "Dòng có điểm thực tế", value: forecasts.length.toLocaleString("vi-VN") },
        { label: "Sai số MAE", value: errors.length ? `${formatNumber(average(errors), 2)} điểm` : "—" },
      ],
      headers: ["Ngành", "Mã ngành", "Phương thức", "Thang", "Năm", "Dự báo MA2", "Thực tế", "Sai số tuyệt đối"],
      rows: forecasts
        .sort((a, b) => b.target_year - a.target_year || (a.dim_program?.major_name ?? "").localeCompare(b.dim_program?.major_name ?? "", "vi"))
        .map((item) => [
          item.dim_program?.major_name ?? "—",
          item.program_id,
          item.admission_method ?? "—",
          item.score_scale != null ? String(item.score_scale) : "—",
          String(item.target_year),
          formatNumber(item.forecast_cutoff, 2),
          formatNumber(item.actual_cutoff, 2),
          formatNumber(item.abs_error, 2),
        ]),
      note: "Sai số tính trên thang gốc của chuỗi (đa số thang 30; một số ngành thang 40). Phương thức khác (học bạ, TSA, HSA…) xem ở trang Dự báo điểm chuẩn. Bảng chi tiết hiển thị tối đa 2.000 dòng.",
    };
  }

  if (code === "K04") {
    const { data, error } = await supabase
      .from("fact_labor_demand")
      .select("industry_group, period_end_year, metric, value, unit, note")
      .order("industry_group")
      .order("period_end_year")
      .limit(2000);
    if (error) throw new Error(`Không tải được dữ liệu K04: ${error.message}`);
    const demand = data ?? [];
    const series = new Map<string, typeof demand>();
    for (const row of demand) {
      const key = `${row.industry_group}|||${row.metric ?? ""}`;
      series.set(key, [...(series.get(key) ?? []), row]);
    }
    const rows = [...series.entries()].flatMap(([key, points]) => {
      const [industry, metric] = key.split("|||");
      const sorted = [...points].sort((a, b) => (a.period_end_year ?? 0) - (b.period_end_year ?? 0));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const growth =
        sorted.length > 1 && first.value != null && first.value !== 0 && last.value != null
          ? ((last.value - first.value) / Math.abs(first.value)) * 100
          : null;
      return sorted.map((point, index) => [
        industry,
        metric || "—",
        String(point.period_end_year ?? "—"),
        formatNumber(point.value, 2),
        point.unit ?? "—",
        index === sorted.length - 1 ? formatPercent(growth) : "—",
      ]);
    });
    return {
      title: KPI_NAMES.K04,
      description: "Theo dõi các chỉ số nhu cầu nhân lực qua các kỳ theo nhóm nghề. KPI này được xem theo chuỗi thời gian, không phải một tỷ lệ toàn hệ thống duy nhất.",
      formula: "Tăng trưởng kỳ đầu–cuối = (giá trị kỳ gần nhất − kỳ đầu) ÷ |giá trị kỳ đầu| × 100%, theo từng nhóm nghề và chỉ số.",
      metrics: [
        { label: "Bản ghi nhu cầu", value: demand.length.toLocaleString("vi-VN") },
        { label: "Nhóm nghề", value: new Set(demand.map((row) => row.industry_group)).size.toLocaleString("vi-VN") },
      ],
      headers: ["Nhóm nghề", "Chỉ số", "Năm", "Giá trị", "Đơn vị", "Tăng trưởng kỳ đầu–cuối"],
      rows,
      note: "Tăng trưởng chỉ tính khi chuỗi có ít nhất hai kỳ và giá trị kỳ đầu khác 0.",
    };
  }

  if (code === "K05") {
    const { data, error } = await supabase
      .from("fact_employment")
      .select("program_id, university_code, graduation_year, survey_year, employment_rate_pct, n_graduates, n_responses, dim_program(major_name)")
      .not("employment_rate_pct", "is", null)
      .limit(2000);
    if (error) throw new Error(`Không tải được dữ liệu K05: ${error.message}`);
    const employment = (data ?? []) as unknown as {
      program_id: string;
      university_code: string;
      graduation_year: number | null;
      survey_year: number | null;
      employment_rate_pct: number | null;
      n_graduates: number | null;
      n_responses: number | null;
      dim_program: { major_name?: string } | null;
    }[];
    const rates = employment
      .map((row) => row.employment_rate_pct)
      .filter((value): value is number => value != null);
    return {
      title: KPI_NAMES.K05,
      description: "Tỷ lệ có việc làm sau một năm tốt nghiệp, hiển thị theo ngành, trường và kỳ khảo sát.",
      formula: "Trung bình số học employment_rate_pct trên các dòng fact_employment có dữ liệu.",
      metrics: [
        { label: "Dòng dữ liệu", value: rates.length.toLocaleString("vi-VN") },
        { label: "Tỷ lệ bình quân", value: formatPercent(average(rates)) },
      ],
      headers: ["Ngành", "Mã ngành", "Trường", "Năm tốt nghiệp", "Năm khảo sát", "SV tốt nghiệp", "Phản hồi", "Tỷ lệ có việc làm"],
      rows: employment
        .sort((a, b) => (b.employment_rate_pct ?? 0) - (a.employment_rate_pct ?? 0))
        .map((row) => [
          row.dim_program?.major_name ?? "—",
          row.program_id,
          row.university_code,
          String(row.graduation_year ?? "—"),
          String(row.survey_year ?? "—"),
          row.n_graduates?.toLocaleString("vi-VN") ?? "—",
          row.n_responses?.toLocaleString("vi-VN") ?? "—",
          formatPercent(row.employment_rate_pct),
        ]),
      note: "Chỉ bao gồm bản ghi có employment_rate_pct; tỷ lệ bình quân là trung bình các dòng, không trọng số theo số phản hồi.",
    };
  }

  if (code === "K06" || code === "K07") {
    const { data, error } = await supabase
      .from("main_dataset")
      .select("program_id, major_name, university_code, est_total_cost_vnd, affordability_index_pct")
      .eq("is_admitted", true)
      .limit(5000);
    if (error) throw new Error(`Không tải được dữ liệu ${code}: ${error.message}`);
    const admitted = data ?? [];
    if (code === "K06") {
      const costs = admitted
        .map((row) => row.est_total_cost_vnd)
        .filter((value): value is number => value != null);
      const groups = new Map<string, { major: string; university: string; sum: number; count: number }>();
      for (const row of admitted) {
        if (row.est_total_cost_vnd == null) continue;
        const key = `${row.program_id}|||${row.university_code}`;
        const group = groups.get(key) ?? {
          major: row.major_name ?? row.program_id,
          university: row.university_code,
          sum: 0,
          count: 0,
        };
        group.sum += row.est_total_cost_vnd;
        group.count++;
        groups.set(key, group);
      }
      return {
        title: KPI_NAMES.K06,
        description: "Phân bố chi phí toàn khóa của các nguyện vọng trúng tuyển, nhóm theo ngành và trường.",
        formula: "Chi phí toàn khóa trung bình = trung bình est_total_cost_vnd trên các nguyện vọng trúng tuyển có dữ liệu.",
        metrics: [
          { label: "Nguyện vọng trúng tuyển", value: admitted.length.toLocaleString("vi-VN") },
          { label: "Có dữ liệu chi phí", value: costs.length.toLocaleString("vi-VN") },
          { label: "Chi phí bình quân", value: formatVnd(average(costs)) },
        ],
        headers: ["Ngành", "Trường", "Số nguyện vọng", "Chi phí bình quân", "Chi phí thấp nhất", "Chi phí cao nhất"],
        rows: [...groups.entries()]
          .map(([key, group]) => {
            const [programId] = key.split("|||");
            const values = admitted
              .filter((row) => row.program_id === programId && row.est_total_cost_vnd != null)
              .map((row) => row.est_total_cost_vnd!);
            return [
              group.major,
              group.university,
              String(group.count),
              formatVnd(group.sum / group.count),
              formatVnd(Math.min(...values)),
              formatVnd(Math.max(...values)),
            ];
          })
          .sort((a, b) => (Number(a[3].replace(/[^\d]/g, "")) || 0) - (Number(b[3].replace(/[^\d]/g, "")) || 0)),
        note: "KPI tổng quan lấy trung bình theo từng dòng nguyện vọng trúng tuyển có chi phí; bảng nhóm theo ngành/trường.",
      };
    }

    const aboveBudget = admitted.filter((row) => (row.affordability_index_pct ?? 0) > 100).length;
    const groups = new Map<
      string,
      { programId: string; major: string; university: string; total: number; above: number }
    >();
    for (const row of admitted) {
      const key = `${row.program_id}|||${row.university_code}`;
      const group = groups.get(key) ?? {
        programId: row.program_id,
        major: row.major_name ?? row.program_id,
        university: row.university_code,
        total: 0,
        above: 0,
      };
      group.total++;
      if ((row.affordability_index_pct ?? 0) > 100) group.above++;
      groups.set(key, group);
    }
    return {
      title: KPI_NAMES.K07,
      description: "Tỷ lệ nguyện vọng trúng tuyển có chỉ số chi phí/ngân sách lớn hơn 100%, nhóm theo ngành và trường.",
      formula: "Số nguyện vọng trúng tuyển có affordability_index_pct > 100 ÷ tổng nguyện vọng trúng tuyển × 100%.",
      metrics: [
        { label: "Nguyện vọng trúng tuyển", value: admitted.length.toLocaleString("vi-VN") },
        { label: "Vượt ngưỡng 100%", value: aboveBudget.toLocaleString("vi-VN") },
        { label: "Tỷ lệ chung", value: formatPercent(admitted.length ? (aboveBudget / admitted.length) * 100 : null) },
      ],
      headers: ["Ngành", "Trường", "Số trúng tuyển", "Vượt 100%", "Tỷ lệ vượt", "Chỉ số chi trả bình quân"],
      rows: [...groups.values()]
        .map((group) => {
          const matching = admitted.filter(
            (row) =>
              row.program_id === group.programId &&
              row.university_code === group.university,
          );
          const indexes = matching
            .map((row) => row.affordability_index_pct)
            .filter((value): value is number => value != null);
          return [
            group.major,
            group.university,
            String(group.total),
            String(group.above),
            formatPercent(group.total ? (group.above / group.total) * 100 : null),
            formatPercent(average(indexes)),
          ];
        })
        .sort((a, b) => Number(b[4].replace(",", ".")) - Number(a[4].replace("%", "").replace(",", "."))),
      note: "Theo công thức KPI hiện tại, affordability_index_pct bị thiếu được tính vào mẫu số nhưng không tính là vượt ngân sách.",
    };
  }

  return null;
}

export default function KpiReportPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <KpiReportContent params={params} />
    </Suspense>
  );
}

async function KpiReportContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const name = KPI_NAMES[code];
  if (!name) {
    return (
      <div className="space-y-4">
        <PageHeader title="Không tìm thấy báo cáo KPI" description="Mã KPI không hợp lệ." />
        <Link href="/" className="text-sm text-primary underline">Quay lại Tổng quan</Link>
      </div>
    );
  }
  const report = await loadReport(code);
  if (!report) return null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/" className="text-sm text-primary underline">← Quay lại Tổng quan</Link>
      </div>
      <PageHeader
        title={`${code} · ${report.title}`}
        description={report.description}
        badge="Báo cáo thống kê chi tiết"
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="neutral">{code}</Badge>
        <Badge tone="neutral">Công thức</Badge>
      </div>
      <Card className="mb-4">
        <CardContent className="p-5">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Cách tính</div>
          <p className="mt-1 text-sm">{report.formula}</p>
        </CardContent>
      </Card>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground">{metric.label}</div>
              <div className="mt-1 text-2xl font-semibold">{metric.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5">
          {report.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    {report.headers.map((header) => (
                      <th key={header} className="whitespace-nowrap py-2 pr-4 font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, index) => (
                    <tr key={`${index}-${row[0]}`} className="border-b last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={`${index}-${cellIndex}`} className="whitespace-nowrap py-2 pr-4">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có dữ liệu chi tiết cho KPI này.</p>
          )}
          {report.note ? <p className="mt-4 text-xs text-muted-foreground">{report.note}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
