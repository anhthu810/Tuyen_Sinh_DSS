import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const KPI_SCOPE: { code: string; scope: string }[] = [
  { code: "K01", scope: "Tỷ lệ đỗ NV1–NV3 — tính trên toàn bộ 500 học sinh mô phỏng." },
  { code: "K02", scope: "Độ lệch dự báo vs thực tế — tính trên nguyện vọng đủ điểm (có actual_cutoff)." },
  { code: "K03", scope: "MAE (thang 30) của phương pháp MA2 — trung bình trên các năm có actual." },
  { code: "K04", scope: "Việc làm sau tốt nghiệp — tính theo từng nhóm nghề." },
  { code: "K05", scope: "Tỷ lệ có việc làm — bình quân các dòng fact_employment." },
  { code: "K06", scope: "Chi phí toàn khóa — tính trên nguyện vọng trúng tuyển." },
  { code: "K07", scope: "Chỉ số chi trả — tính trên nguyện vọng trúng tuyển." },
];

export function KpiScope() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phạm vi tính KPI</CardTitle>
        <CardDescription>
          K01–K07 chỉ được tính trên đúng tập con dữ liệu tương ứng, tránh so sánh sai giữa THẬT và MÔ PHỎNG.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {KPI_SCOPE.map((k) => (
            <li key={k.code} className="flex items-start gap-3 text-sm">
              <Badge tone="neutral" className="mt-0.5 shrink-0 font-mono">
                {k.code}
              </Badge>
              <span>{k.scope}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}