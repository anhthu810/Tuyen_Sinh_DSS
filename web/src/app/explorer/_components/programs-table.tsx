"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProgramRow } from "@/lib/queries/programs";

// Dùng <a> thay <Link> để tránh URL data (usePathname) trong Client Component
// khi Cache Components bật.

const PAGE_SIZE = 25;

type Row = Pick<
  ProgramRow,
  | "program_id"
  | "major_name"
  | "university_name"
  | "short_name"
  | "university_code"
  | "khoi_nganh"
  | "industry_group"
  | "program_type"
  | "duration_years"
>;

export function ProgramsTable({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visible = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Trường</th>
              <th className="px-4 py-3 font-medium">Tên ngành</th>
              <th className="px-4 py-3 font-medium">Khối</th>
              <th className="px-4 py-3 font-medium">Nhóm nghề</th>
              <th className="px-4 py-3 font-medium">Loại CT</th>
              <th className="px-4 py-3 font-medium">Số năm</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.program_id}
                className="border-b last:border-b-0 transition-colors hover:bg-muted/40"
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <a
                    href={`/explorer/${encodeURIComponent(r.program_id)}`}
                    className="font-medium hover:underline"
                  >
                    {r.short_name ?? r.university_name ?? r.university_code}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/explorer/${encodeURIComponent(r.program_id)}`}
                    className="hover:underline"
                  >
                    {r.major_name}
                  </a>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {r.khoi_nganh ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.industry_group ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.program_type ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {r.duration_years ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Hiển thị {visible.length} / {rows.length} ngành (mỗi trang tối đa {PAGE_SIZE})
        </p>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" />
              Trang trước
            </Button>
            <span className="text-xs text-muted-foreground">
              {safePage + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Trang sau
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}