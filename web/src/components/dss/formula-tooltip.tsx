"use client";

import { useState } from "react";
import { Info } from "lucide-react";

/**
 * Tooltip định nghĩa công thức tính (Knowledge Base ngay trên UI).
 * Hỗ trợ cả hover lẫn click/focus, chặn sự kiện lan lên thẻ cha (như Link trong KpiCard).
 */
export function FormulaTooltip({
  title,
  formula,
  source,
  threshold,
}: {
  title: string;
  formula: string;
  source?: string;
  threshold?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Xem công thức tính ${title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" />
      </button>

      {open ? (
        <div
          role="tooltip"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute right-0 top-6 z-30 w-72 rounded-lg border bg-card p-3 text-left text-xs text-card-foreground shadow-lg"
        >
          <div className="font-semibold text-foreground">{title}</div>
          <div className="mt-1.5 rounded bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed">
            {formula}
          </div>
          {threshold ? (
            <div className="mt-1.5 text-muted-foreground">
              <span className="font-medium text-foreground">Ngưỡng:</span> {threshold}
            </div>
          ) : null}
          {source ? (
            <div className="mt-1 text-muted-foreground">
              <span className="font-medium text-foreground">Nguồn:</span> {source}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

