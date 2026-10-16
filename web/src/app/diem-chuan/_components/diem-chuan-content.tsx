import { Suspense } from "react";
import { getPrograms } from "@/lib/queries/programs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgramPicker } from "./program-picker";
import { ForecastPanel } from "./forecast-panel";

export async function DiemChuanContent({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const sp = await searchParams;
  const programs = await getPrograms();

  if (programs.length === 0) {
    return (
      <EmptyState
        title="Chưa có ngành nào"
        description="Không đọc được danh sách ngành từ dim_program. Kiểm tra kết nối Supabase và policy RLS đọc công khai."
      />
    );
  }

  const requested = sp.program ?? null;
  const selectedId = requested && programs.some((p) => p.program_id === requested)
    ? requested
    : programs[0].program_id;
  const selected = programs.find((p) => p.program_id === selectedId);

  return (
    <div className="space-y-4">
      <ProgramPicker
        programs={programs.map((p) => ({
          program_id: p.program_id,
          major_name: p.major_name,
          university_name: p.university_name,
          short_name: p.short_name,
          university_code: p.university_code,
        }))}
        selected={selectedId}
      />

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        {selected ? (
          <ForecastPanel
            programId={selected.program_id}
            programLabel={`${selected.short_name ?? selected.university_code} — ${selected.major_name}`}
          />
        ) : (
          <EmptyState title="Chưa có dữ liệu dự báo cho ngành này" />
        )}
      </Suspense>
    </div>
  );
}