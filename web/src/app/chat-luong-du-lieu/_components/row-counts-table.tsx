import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Dữ kiện về gói dữ liệu: bảng nào là dữ liệu THẬT, bảng nào là MÔ PHỎNG.
const TABLE_META: { table: string; label: string; simulated: boolean }[] = [
  { table: "dim_university", label: "Danh mục trường ĐH", simulated: false },
  { table: "dim_program", label: "Danh mục ngành học", simulated: false },
  { table: "fact_cutoff_score", label: "Điểm chuẩn theo năm", simulated: false },
  { table: "fact_quota", label: "Chỉ tiêu tuyển sinh", simulated: false },
  { table: "fact_tuition", label: "Học phí", simulated: false },
  { table: "fact_employment", label: "Việc làm sau tốt nghiệp", simulated: false },
  { table: "fact_labor_demand", label: "Nhu cầu nhân lực", simulated: false },
  { table: "fact_salary", label: "Mức lương", simulated: false },
  { table: "fact_cutoff_forecast", label: "Dự báo điểm chuẩn", simulated: false },
  { table: "dim_student", label: "Hồ sơ học sinh", simulated: true },
  { table: "fact_exam_score", label: "Điểm thi / học bạ", simulated: true },
  { table: "main_dataset", label: "Tập chính (nguyện vọng × HS)", simulated: true },
  { table: "fact_application_method", label: "Phương thức xét tuyển", simulated: true },
];

export function RowCountsTable({
  rowCounts,
}: {
  rowCounts: Record<string, number>;
}) {
  const rows = TABLE_META.map((m) => ({
    ...m,
    count: rowCounts[m.table] ?? 0,
  }));
  const nReal = rows.filter((r) => !r.simulated).length;
  const nSim = rows.length - nReal;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Số dòng & nguồn gốc</CardTitle>
        <CardDescription>
          {rows.length} bảng — {nReal} bảng dữ liệu THẬT, {nSim} bảng MÔ PHỎNG (500 học sinh).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Bảng</th>
                <th className="py-2 pr-4 font-medium">Nội dung</th>
                <th className="py-2 pr-4 text-right font-medium">Số dòng</th>
                <th className="py-2 font-medium">Nguồn gốc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.table} className="border-b last:border-b-0">
                  <td className="py-2.5 pr-4 font-mono text-xs">{r.table}</td>
                  <td className="py-2.5 pr-4">{r.label}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {r.count.toLocaleString("vi-VN")}
                  </td>
                  <td className="py-2.5">
                    {r.simulated ? (
                      <Badge tone="warning">MÔ PHỎNG</Badge>
                    ) : (
                      <Badge tone="success">THẬT</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}