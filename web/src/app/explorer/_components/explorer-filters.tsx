"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

// Không dùng usePathname/useSearchParams (URL data) — giá trị lọc hiện tại
// được truyền từ Server Component qua props để an toàn với Cache Components.

type UniversityOption = {
  university_code: string;
  short_name: string | null;
  university_name: string;
};

export function ExplorerFilters({
  universities,
  khoiNganhList,
  initialUniversity,
  initialKhoi,
  initialQ,
}: {
  universities: UniversityOption[];
  khoiNganhList: string[];
  initialUniversity: string;
  initialKhoi: string;
  initialQ: string;
}) {
  const router = useRouter();

  const [university, setUniversity] = useState(initialUniversity);
  const [khoi, setKhoi] = useState(initialKhoi);
  const [q, setQ] = useState(initialQ);

  function apply(next: { university?: string; khoi?: string; q?: string }) {
    const params = new URLSearchParams();
    const u = next.university !== undefined ? next.university : university;
    const k = next.khoi !== undefined ? next.khoi : khoi;
    const s = next.q !== undefined ? next.q : q;
    if (u) params.set("university", u);
    if (k) params.set("khoi", k);
    if (s) params.set("q", s);
    router.push(`/explorer${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
    >
      <Select
        aria-label="Lọc theo trường"
        value={university}
        onChange={(e) => {
          setUniversity(e.target.value);
          apply({ university: e.target.value });
        }}
        className="w-56"
      >
        <option value="">Tất cả trường</option>
        {universities.map((u) => (
          <option key={u.university_code} value={u.university_code}>
            {u.short_name ?? u.university_name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Lọc theo khối ngành"
        value={khoi}
        onChange={(e) => {
          setKhoi(e.target.value);
          apply({ khoi: e.target.value });
        }}
        className="w-56"
      >
        <option value="">Tất cả khối ngành</option>
        {khoiNganhList.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </Select>

      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tên ngành…"
          className="h-10 w-full rounded-lg border bg-card pl-9 pr-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" size="md">
        Tìm
      </Button>
      {university || khoi || q ? (
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => {
            setUniversity("");
            setKhoi("");
            setQ("");
            router.push("/explorer");
          }}
        >
          Xóa lọc
        </Button>
      ) : null}
    </form>
  );
}