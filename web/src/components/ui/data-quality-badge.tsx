import { Badge } from "@/components/ui/badge";

// Hiển thị độ tin cậy / nguồn dữ liệu (confidence: 'Cao' | 'Trung bình' | 'Thấp').
export function DataQualityBadge({
  confidence,
  scaleConfirmed,
}: {
  confidence?: string | null;
  scaleConfirmed?: boolean | null;
}) {
  if (scaleConfirmed === false) {
    return <Badge tone="warning">Thang điểm chưa xác nhận</Badge>;
  }
  const map: Record<string, "success" | "warning" | "danger"> = {
    Cao: "success",
    "Trung bình": "warning",
    Thấp: "danger",
  };
  const tone = confidence ? map[confidence] ?? "neutral" : "neutral";
  return <Badge tone={tone}>Độ tin cậy: {confidence ?? "—"}</Badge>;
}
