"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudentComboboxOption = {
  student_id: string;
  label: string;
};

const MAX_VISIBLE = 15;

/**
 * Combobox tự động hoàn thành (Autocomplete) thay cho dropdown >100 học sinh.
 * Cho phép tìm theo mã HS, năm khóa, ngành yêu thích hoặc trạng thái trúng tuyển.
 */
export function StudentCombobox({
  options,
  selected,
  onSelect,
  label = "Hồ sơ học sinh:",
  align = "left",
}: {
  options: StudentComboboxOption[];
  selected: string;
  onSelect?: (studentId: string) => void;
  label?: string;
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.student_id === selected) ?? options[0],
    [options, selected],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.student_id.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function choose(studentId: string) {
    setOpen(false);
    setQuery("");
    if (onSelect) {
      onSelect(studentId);
    } else {
      router.push(`${pathname}?student=${encodeURIComponent(studentId)}`);
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2">
      {label ? (
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      ) : null}

      <div className="relative w-full sm:w-80">
        <div
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 text-sm shadow-xs transition-colors",
            open ? "border-indigo-500 ring-2 ring-indigo-500/15" : "hover:border-slate-300",
          )}
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="student-combobox-list"
            aria-label="Tìm kiếm mã học sinh hoặc ngành quan tâm"
            value={open ? query : selectedOption?.label ?? selected}
            placeholder="Gõ mã HS (VD: HS2024012) hoặc ngành..."
            onFocus={() => {
              setOpen(true);
              setQuery("");
              setActiveIndex(0);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActiveIndex((i) => Math.min(i + 1, Math.max(0, visible.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && open && visible[activeIndex]) {
                e.preventDefault();
                choose(visible[activeIndex].student_id);
              } else if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
              }
            }}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {open && query ? (
            <button
              type="button"
              aria-label="Xóa từ khóa"
              onClick={() => {
                setQuery("");
                setActiveIndex(0);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Mở danh sách học sinh"
              onClick={() => setOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="size-3.5" />
            </button>
          )}
        </div>

        {open ? (
          <div
            id="student-combobox-list"
            role="listbox"
            className={cn(
              "absolute top-10 z-40 w-full min-w-80 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-lg",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              Hiển thị {visible.length}/{filtered.length} hồ sơ khớp (tổng {options.length}) — gõ để
              lọc nhanh
            </div>
            {visible.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Không tìm thấy hồ sơ nào khớp &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto py-1">
                {visible.map((o, idx) => {
                  const isSelected = o.student_id === selected;
                  const isActive = idx === activeIndex;
                  return (
                    <li key={o.student_id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => choose(o.student_id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                          isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="truncate font-medium">{o.label}</span>
                        {isSelected ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

