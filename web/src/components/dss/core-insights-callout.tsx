import { Lightbulb, ShieldAlert, Scale, Layers, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ConfidenceLevel,
  CoreInsightPoint,
  CoreInsightTone,
  IfThenRule,
} from "@/lib/dss/insights";

const TONE_BADGE: Record<CoreInsightTone, "success" | "warning" | "danger" | "neutral"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
};

const TONE_BORDER: Record<CoreInsightTone, string> = {
  success: "border-l-4 border-l-success",
  warning: "border-l-4 border-l-warning",
  danger: "border-l-4 border-l-danger",
  neutral: "border-l-4 border-l-primary",
};

const CONFIDENCE_TONE: Record<ConfidenceLevel, "success" | "warning" | "danger"> = {
  Cao: "success",
  "Trung bình": "warning",
  Thấp: "danger",
};

const CATEGORY_ICON = [Layers, ShieldAlert, Scale];

/**
 * Callout box đặt đầu trang, tóm tắt 3 kết luận cốt lõi từ hồ sơ/kịch bản:
 * (1) Cấu trúc nguyện vọng, (2) Ngưỡng an toàn tài chính, (3) Đánh đổi cơ hội.
 */
export function CoreInsightsCallout({
  points,
  subtitle,
}: {
  points: [CoreInsightPoint, CoreInsightPoint, CoreInsightPoint];
  subtitle?: string;
}) {
  return (
    <Card className="border-l-4 border-l-primary bg-primary/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4 text-primary" />
            Insight &amp; Khuyến nghị cốt lõi
          </CardTitle>
          {subtitle ? <Badge tone="neutral">{subtitle}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {points.map((pt, idx) => {
          const Icon = CATEGORY_ICON[idx] ?? Lightbulb;
          return (
            <div
              key={pt.category}
              className={`rounded-lg border bg-card p-3.5 ${TONE_BORDER[pt.tone]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-3.5" />
                  {pt.category}
                </span>
                <Badge tone={TONE_BADGE[pt.tone]}>
                  {pt.tone === "success"
                    ? "Ổn định"
                    : pt.tone === "warning"
                      ? "Lưu ý"
                      : pt.tone === "danger"
                        ? "Rủi ro cao"
                        : "Cân bằng"}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-semibold leading-snug">{pt.headline}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{pt.detail}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Thẻ quy tắc khuyến nghị hành động dạng IF–THEN kèm mức độ tin cậy (Confidence Level).
 */
export function IfThenRulesCard({
  rules,
  title = "Khuyến nghị DSS",
}: {
  rules: IfThenRule[];
  title?: string;
}) {
  if (!rules.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="size-4 text-primary" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Quy tắc hành động dạng IF–THEN kèm mức độ tự tin (Confidence) tính từ sai số dự báo và
          dữ liệu lịch sử.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border bg-muted/20 p-3.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="default">IF</Badge>
                <span className="font-medium">{r.condition}</span>
              </div>
              <Badge tone={CONFIDENCE_TONE[r.confidenceLabel]}>
                Confidence: {r.confidenceLabel} ({r.confidencePct}%)
              </Badge>
            </div>

            <div className="mt-2 flex items-start gap-2">
              <Badge tone="success" className="mt-0.5 shrink-0">
                THEN
              </Badge>
              <div>
                <p className="font-medium leading-snug">{r.action}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Tác động dự kiến:</span> {r.impact}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Căn cứ: {r.basis}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
