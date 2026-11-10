"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_FILTERS,
  filtersToSearchParams,
  type ForecastFilters,
  type SchoolOption,
} from "@/lib/dss/forecast-filter";
import { ForecastFilterToolbar } from "./forecast-filter-toolbar";

/**
 * Gắn ForecastFilterToolbar với URL của /diem-chuan: mỗi thay đổi → ?keyword=&schoolCode=…
 * Giá trị hiện tại do Server Component truyền xuống (không dùng useSearchParams — an toàn
 * với Cache Components); đổi bộ lọc sẽ bỏ chọn ngành/chuỗi cũ.
 */
export function ForecastFilterBar({
  schools,
  scales,
  initial,
  resultCount,
}: {
  schools: SchoolOption[];
  scales: number[];
  initial: ForecastFilters;
  resultCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState(initial);
  const initialKey = filtersToSearchParams(initial).toString();
  const [syncedKey, setSyncedKey] = useState(initialKey);
  if (initialKey !== syncedKey) {
    // URL đổi từ bên ngoài (Back/Forward, link) → lấy giá trị từ URL.
    setSyncedKey(initialKey);
    setFilters(initial);
  }

  const apply = useCallback(
    (next: ForecastFilters) => {
      setFilters(next);
      const qs = filtersToSearchParams(next).toString();
      startTransition(() => router.push(`/diem-chuan${qs ? `?${qs}` : ""}`, { scroll: false }));
    },
    [router],
  );

  return (
    <ForecastFilterToolbar
      schools={schools}
      scales={scales}
      value={filters}
      onChange={apply}
      onReset={() => apply(DEFAULT_FILTERS)}
      resultCount={resultCount}
      pending={pending}
    />
  );
}
