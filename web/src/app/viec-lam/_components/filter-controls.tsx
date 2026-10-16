"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import type { DimUniversity } from "@/types/database.types";

export function FilterControls({
  universities,
  industryGroups,
  university,
  industry,
}: {
  universities: DimUniversity[];
  industryGroups: string[];
  university: string;
  industry: string;
}) {
  const router = useRouter();

  function update(key: "university" | "industry", value: string) {
    const nextUniversity = key === "university" ? value : university;
    const nextIndustry = key === "industry" ? value : industry;
    const params = new URLSearchParams();
    if (nextUniversity) params.set("university", nextUniversity);
    if (nextIndustry) params.set("industry", nextIndustry);
    const qs = params.toString();
    router.push(qs ? `/viec-lam?${qs}` : "/viec-lam");
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <Select
        aria-label="Lọc theo trường"
        value={university}
        onChange={(e) => update("university", e.target.value)}
        className="min-w-56"
      >
        <option value="">Tất cả trường</option>
        {universities.map((u) => (
          <option key={u.university_code} value={u.university_code}>
            {u.short_name ?? u.university_name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Lọc theo nhóm nghề"
        value={industry}
        onChange={(e) => update("industry", e.target.value)}
        className="min-w-56"
      >
        <option value="">Tất cả nhóm nghề</option>
        {industryGroups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </Select>
    </div>
  );
}