"use client";

import { useEffect, useId, useState } from "react";
import { ChartLine, Layers, LoaderCircle, RotateCcw, Ruler, School, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL,
  DEFAULT_FILTERS,
  DEFAULT_SCALES,
  METHOD_GROUPS,
  METHOD_GROUP_LABEL,
  MODEL_LABEL,
  MODEL_TYPES,
  isDefaultFilters,
  type ForecastFilters,
  type SchoolOption,
} from "@/lib/dss/forecast-filter";
import type { MethodGroup } from "@/types/database.types";

export type ForecastFilterToolbarProps = {
  /** Danh sách N trường — lấy động từ DB/API, KHÔNG hardcode. */
  schools: SchoolOption[];
  /** Thang điểm gốc có trong dữ liệu; mặc định 30, 40, 100, 150. */
  scales?: readonly number[];
  value: ForecastFilters;
  onChange: (next: ForecastFilters) => void;
  /** Mặc định: onChange(DEFAULT_FILTERS). */
  onReset?: () => void;
  /** Số chuỗi khớp bộ lọc hiện tại (hiển thị bên phải). */
  resultCount?: number;
  /** Đang tải kết quả mới. */
  pending?: boolean;
  /** Độ trễ (ms) trước khi áp dụng từ khóa đang gõ. */
  debounceMs?: number;
  className?: string;
};

const SCALE_HINT: Record<number, string> = {
  30: "THPT / học bạ",
  40: "môn nhân đôi",
  100: "TSA",
  110: "XTTN",
  150: "HSA",
  1200: "V-ACT",
  1600: "SAT",
};

function Field({
  id,
  label,
  icon: Icon,
  children,
  className,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Thanh lọc dự báo điểm chuẩn: từ khóa ngành/mã ngành · trường · nhóm phương thức ·
 * thang điểm · mô hình dự báo · Đặt lại. Component điều khiển (controlled) — trạng thái
 * do parent giữ (URL, state, store…).
 */
export function ForecastFilterToolbar({
  schools,
  scales = DEFAULT_SCALES,
  value,
  onChange,
  onReset,
  resultCount,
  pending = false,
  debounceMs = 400,
  className,
}: ForecastFilterToolbarProps) {
  const uid = useId();
  const ids = {
    keyword: `${uid}-kw`,
    school: `${uid}-school`,
    group: `${uid}-group`,
    scale: `${uid}-scale`,
    model: `${uid}-model`,
  };

  // Từ khóa gõ tự do → áp dụng sau debounce hoặc khi Enter.
  const [keyword, setKeyword] = useState(value.keyword);
  const [syncedKeyword, setSyncedKeyword] = useState(value.keyword);
  if (value.keyword !== syncedKeyword) {
    // parent đổi từ khóa (Đặt lại, Back…) → đồng bộ ô nhập
    setSyncedKeyword(value.keyword);
    setKeyword(value.keyword);
  }

  useEffect(() => {
    if (keyword.trim() === value.keyword.trim()) return;
    const t = setTimeout(() => onChange({ ...value, keyword: keyword.trim() }), debounceMs);
    return () => clearTimeout(t);
  }, [keyword, value, onChange, debounceMs]);

  const set = <K extends keyof ForecastFilters>(k: K, v: ForecastFilters[K]) =>
    onChange({ ...value, keyword: keyword.trim(), [k]: v });

  const scaleOptions = [...new Set([...scales, ...(value.scoreScale !== ALL ? [value.scoreScale] : [])])].sort(
    (a, b) => a - b,
  );
  const dirty = !isDefaultFilters({ ...value, keyword });

  return (
    <form
      role="search"
      aria-label="Bộ lọc dự báo điểm chuẩn"
      className={cn("rounded-xl border bg-card p-3 shadow-sm sm:p-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (keyword.trim() !== value.keyword) onChange({ ...value, keyword: keyword.trim() });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field id={ids.keyword} label="Ngành / mã ngành" icon={Search} className="sm:col-span-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id={ids.keyword}
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="vd: khoa hoc may tinh, 7480101, BKA_IT1"
              autoComplete="off"
              className="h-10 w-full rounded-lg border bg-card pl-9 pr-9 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {keyword ? (
              <button
                type="button"
                aria-label="Xóa từ khóa"
                onClick={() => {
                  setKeyword("");
                  onChange({ ...value, keyword: "" });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </Field>

        <Field id={ids.school} label="Trường" icon={School}>
          <Select
            id={ids.school}
            value={value.schoolCode}
            onChange={(e) => set("schoolCode", e.target.value)}
            className="w-full"
          >
            <option value={ALL}>Tất cả trường ({schools.length})</option>
            {schools.map((s) => (
              <option key={s.code} value={s.code} title={s.name}>
                {s.shortName ? `${s.shortName} — ${s.name}` : s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field id={ids.group} label="Phương thức xét tuyển" icon={Layers}>
          <Select
            id={ids.group}
            value={value.methodGroup}
            onChange={(e) => set("methodGroup", e.target.value as MethodGroup | typeof ALL)}
            className="w-full"
          >
            <option value={ALL}>Tất cả 5 nhóm</option>
            {METHOD_GROUPS.map((g, i) => (
              <option key={g} value={g}>
                {i + 1}. {METHOD_GROUP_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id={ids.scale} label="Thang điểm" icon={Ruler}>
          <Select
            id={ids.scale}
            value={String(value.scoreScale)}
            onChange={(e) => set("scoreScale", e.target.value === ALL ? ALL : Number(e.target.value))}
            className="w-full"
          >
            <option value={ALL}>Mọi thang</option>
            {scaleOptions.map((s) => (
              <option key={s} value={s}>
                Thang {s}
                {SCALE_HINT[s] ? ` (${SCALE_HINT[s]})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field id={ids.model} label="Mô hình dự báo" icon={ChartLine}>
          <Select
            id={ids.model}
            value={value.modelType}
            onChange={(e) => set("modelType", e.target.value as ForecastFilters["modelType"])}
            className="w-full"
          >
            <option value={ALL}>So sánh cả 3</option>
            {MODEL_TYPES.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
          {pending
            ? "Đang lọc…"
            : resultCount != null
              ? `${resultCount.toLocaleString("vi-VN")} chuỗi điểm chuẩn phù hợp`
              : null}
          {value.modelType === "HOLT" && !pending ? " · Holt chỉ có ở chuỗi ≥ 3 năm" : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!dirty}
          onClick={() => {
            setKeyword("");
            if (onReset) onReset();
            else onChange(DEFAULT_FILTERS);
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Đặt lại
        </Button>
      </div>
    </form>
  );
}
