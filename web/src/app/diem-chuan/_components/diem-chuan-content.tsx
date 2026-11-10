import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { filtersToSearchParams, isDefaultFilters, parseForecastFilters } from "@/lib/dss/forecast-filter";
import { getScaleOptions, getSchoolOptions, searchForecastSeries } from "@/lib/queries/forecast-search";
import { ForecastFilterBar } from "./forecast-filter-bar";
import { ForecastResults } from "./forecast-results";
import { ForecastPanel } from "./forecast-panel";

export type DiemChuanSearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export async function DiemChuanContent({ searchParams }: { searchParams: DiemChuanSearchParams }) {
  const sp = await searchParams;
  const { filters } = parseForecastFilters(sp);

  const [schools, scales, series] = await Promise.all([
    getSchoolOptions().catch(() => []),
    getScaleOptions(),
    searchForecastSeries(filters).catch(() => null),
  ]);

  const linkQuery = filtersToSearchParams(filters).toString();
  const toolbar = (
    <ForecastFilterBar schools={schools} scales={scales} initial={filters} resultCount={series?.length ?? 0} />
  );

  if (series == null) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="Không đọc được dữ liệu dự báo"
          description="Kiểm tra kết nối Supabase và đã chạy 02_method_aware_cutoff.sql + etl/generated/parts/03_part_*.sql."
        />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="Không có chuỗi điểm chuẩn nào khớp bộ lọc"
          description={
            isDefaultFilters(filters)
              ? "Bảng fact_cutoff_forecast chưa có dữ liệu."
              : "Thử bỏ bớt điều kiện hoặc bấm “Đặt lại”. Lưu ý: Holt chỉ có ở chuỗi đủ ≥ 3 năm liên tiếp; nhóm kết hợp và năng khiếu không có dự báo."
          }
        />
      </div>
    );
  }

  // Chuỗi đang xem: theo URL nếu còn nằm trong kết quả, nếu không thì dòng đầu tiên.
  const requestedProgram = one(sp.program);
  const requestedSeries = one(sp.series);
  const selected =
    series.find((s) => s.seriesKey === requestedSeries) ??
    series.find((s) => s.programId === requestedProgram) ??
    series[0];

  return (
    <div className="space-y-4">
      {toolbar}

      <ForecastResults
        series={series}
        linkQuery={linkQuery}
        selectedKey={selected.seriesKey}
        modelType={filters.modelType}
      />

      <section id="chi-tiet" className="scroll-mt-4">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          }
        >
          <ForecastPanel
            programId={selected.programId}
            programLabel={`${selected.schoolName ?? selected.schoolCode} — ${selected.majorName ?? selected.programId}`}
            seriesKey={selected.seriesKey}
            model={filters.modelType}
            linkQuery={linkQuery}
          />
        </Suspense>
      </section>
    </div>
  );
}
