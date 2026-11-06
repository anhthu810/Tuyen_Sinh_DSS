import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Kpi, KpiTone } from "@/lib/kpi";
import { cn } from "@/lib/utils";

const toneText: Record<KpiTone, string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
  neutral: "text-foreground",
};

const toneBadge: Record<KpiTone, "success" | "warning" | "danger" | "neutral"> = {
  good: "success",
  warn: "warning",
  bad: "danger",
  neutral: "neutral",
};

export function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <Link
      href={`/bao-cao/kpi/${kpi.code}`}
      aria-label={`Xem báo cáo chi tiết ${kpi.code}: ${kpi.name}`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex h-full flex-col transition-colors group-hover:border-primary/50 group-hover:bg-muted/20">
        <CardContent className="flex flex-1 flex-col gap-2 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {kpi.code}
            </span>
            <Badge tone={toneBadge[kpi.tone]}>{kpi.question}</Badge>
          </div>
          <div className={cn("text-3xl font-semibold tracking-tight", toneText[kpi.tone])}>
            {kpi.display}
          </div>
          <div className="text-sm font-medium leading-snug">{kpi.name}</div>
          <p className="mt-auto pt-2 text-xs text-muted-foreground">{kpi.meaning}</p>
          <span className="pt-1 text-xs font-medium text-primary">
            Xem báo cáo chi tiết →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
