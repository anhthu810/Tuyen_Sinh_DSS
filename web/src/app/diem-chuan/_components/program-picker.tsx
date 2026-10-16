"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

export type PickerProgram = {
  program_id: string;
  major_name: string;
  university_name: string | null;
  short_name: string | null;
  university_code: string;
};

export function ProgramPicker({
  programs,
  selected,
}: {
  programs: PickerProgram[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="program-select" className="text-sm font-medium text-muted-foreground">
        Chọn ngành
      </label>
      <Select
        id="program-select"
        className="w-full max-w-xl sm:w-auto"
        value={selected}
        onChange={(e) => {
          const id = e.target.value;
          if (id) router.push(`${pathname}?program=${id}`);
        }}
      >
        {programs.map((p) => (
          <option key={p.program_id} value={p.program_id}>
            {`${p.short_name ?? p.university_code} — ${p.major_name}`}
          </option>
        ))}
      </Select>
    </div>
  );
}