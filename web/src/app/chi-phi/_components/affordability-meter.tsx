import { chartPalette } from "@/components/charts/palette";
import { formatPct } from "@/lib/format";

// Thước đo K07: ≤100% khả năng chi trả tốt, 100–150% căng, >150% vượt ngân sách.
// Thang hiển thị 0–200%, có vạch mốc tại 100% (giữa thước).
export function AffordabilityMeter({ value }: { value: number | null }) {
  if (value == null) {
    return <div className="text-sm text-muted-foreground">—</div>;
  }

  const clamped = Math.min(Math.max(value, 0), 200);
  const widthPct = clamped / 2;
  const tone =
    value <= 100
      ? { color: chartPalette.positive, className: "text-success", label: "Trong khả năng chi trả" }
      : value <= 150
        ? { color: chartPalette.warning, className: "text-warning", label: "Vượt ngân sách ở mức căng" }
        : { color: chartPalette.negative, className: "text-danger", label: "Vượt ngân sách" };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={`text-3xl font-semibold tracking-tight ${tone.className}`}>
          {formatPct(value)}
        </span>
        <span className={`text-sm font-medium ${tone.className}`}>{tone.label}</span>
      </div>

      <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width]"
          style={{ width: `${widthPct}%`, backgroundColor: tone.color }}
        />
        <div
          className="absolute inset-y-[-2px] w-0.5 bg-foreground/50"
          style={{ left: "50%" }}
          aria-hidden
        />
      </div>

      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span>0%</span>
        <span>100% – ngân sách</span>
        <span>200%</span>
      </div>
    </div>
  );
}