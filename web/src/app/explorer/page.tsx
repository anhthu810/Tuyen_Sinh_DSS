import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { getPrograms } from "@/lib/queries/programs";
import { getUniversities, getKhoiNganhList } from "@/lib/queries/filters";
import { ExplorerFilters } from "./_components/explorer-filters";
import { ProgramsTable } from "./_components/programs-table";

type ExplorerSearchParams = Promise<{
  university?: string;
  khoi?: string;
  q?: string;
}>;

export default function ExplorerPage({
  searchParams,
}: {
  searchParams: ExplorerSearchParams;
}) {
  return (
    <div>
      <PageHeader
        title="Tra cứu ngành"
        description="Tìm kiếm và tra cứu thông tin các ngành đào tạo (7 trường ĐH Hà Nội · 380 ngành · 2023–2026) — lọc theo trường, khối ngành hoặc từ khóa."
        badge="Dữ liệu trực tiếp từ Supabase"
      />
      <Suspense fallback={<ExplorerSkeleton />}>
        <ExplorerContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExplorerContent({
  searchParams,
}: {
  searchParams: ExplorerSearchParams;
}) {
  const sp = await searchParams;
  const [universities, khoiNganhList, programs] = await Promise.all([
    getUniversities(),
    getKhoiNganhList(),
    getPrograms({
      universityCode: sp.university || undefined,
      khoiNganh: sp.khoi || undefined,
      search: sp.q || undefined,
    }),
  ]);

  return (
    <div className="space-y-4">
      <ExplorerFilters
        universities={universities.map((u) => ({
          university_code: u.university_code,
          short_name: u.short_name,
          university_name: u.university_name,
        }))}
        khoiNganhList={khoiNganhList}
        initialUniversity={sp.university ?? ""}
        initialKhoi={sp.khoi ?? ""}
        initialQ={sp.q ?? ""}
      />
      {programs.length === 0 ? (
        <EmptyState
          title="Không tìm thấy ngành nào"
          description="Thử bỏ bớt điều kiện lọc hoặc đổi từ khóa tìm kiếm."
        />
      ) : (
        <ProgramsTable rows={programs} />
      )}
    </div>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}