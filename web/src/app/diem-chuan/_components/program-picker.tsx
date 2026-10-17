"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerProgram = {
  program_id: string;
  major_name: string;
  university_name: string | null;
  short_name: string | null;
  university_code: string;
};

const labelOf = (p: PickerProgram) => `${p.short_name ?? p.university_code} — ${p.major_name}`;

export function ProgramPicker({
  programs,
  selected,
}: {
  programs: PickerProgram[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedProg = programs.find((p) => p.program_id === selected);

  const [query, setQuery] = useState(selectedProg ? labelOf(selectedProg) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!open) return [];
    const list = programs.filter((p) => {
      if (!q) return true;
      return (
        labelOf(p).toLowerCase().includes(q) ||
        (p.major_name ?? "").toLowerCase().includes(q) ||
        (p.university_name ?? "").toLowerCase().includes(q) ||
        p.program_id.toLowerCase().includes(q)
      );
    });
    return list.slice(0, 40);
  }, [programs, q, open]);

  function choose(p: PickerProgram) {
    setQuery(labelOf(p));
    setOpen(false);
    if (p.program_id !== selected) router.push(`${pathname}?program=${p.program_id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-muted-foreground">Tìm & chọn ngành</label>
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder="Gõ tên ngành hoặc trường… (vd: Khoa học máy tính, NEU)"
          className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={(e) => {
            setOpen(true);
            setActive(0);
            e.target.select();
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => {
              setOpen(false);
              // nếu bỏ dở, trả lại nhãn ngành đang chọn
              setQuery(selectedProg ? labelOf(selectedProg) : "");
            }, 150);
          }}
          onKeyDown={onKeyDown}
        />

        {open && matches.length > 0 ? (
          <ul
            className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-card py-1 shadow-lg"
            onMouseDown={(e) => {
              // giữ focus để click chọn fire trước blur
              e.preventDefault();
              if (blurTimer.current) clearTimeout(blurTimer.current);
            }}
          >
            {matches.map((p, i) => {
              const isSel = p.program_id === selected;
              return (
                <li key={p.program_id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(p)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                      i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.major_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.short_name ?? p.university_code}
                        {p.university_name ? ` · ${p.university_name}` : ""} · {p.program_id}
                      </span>
                    </span>
                    {isSel ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {open && q && matches.length === 0 ? (
          <div className="absolute z-20 mt-1 w-full rounded-lg border bg-card px-3 py-3 text-sm text-muted-foreground shadow-lg">
            Không tìm thấy ngành khớp “{query}”.
          </div>
        ) : null}
      </div>
    </div>
  );
}
