"use client";

import { StudentCombobox } from "@/components/dss/student-combobox";

export function StudentPicker({
  options,
  selected,
}: {
  options: { student_id: string; label: string }[];
  selected: string;
}) {
  return <StudentCombobox options={options} selected={selected} />;
}
