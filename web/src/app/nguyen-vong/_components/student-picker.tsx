"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/select";

export function StudentPicker({
  options,
  selected,
}: {
  options: { student_id: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm font-medium text-muted-foreground">Hồ sơ học sinh:</label>
      <Select
        value={selected}
        onChange={(e) => router.push(`${pathname}?student=${e.target.value}`)}
        className="min-w-72"
      >
        {options.map((o) => (
          <option key={o.student_id} value={o.student_id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
