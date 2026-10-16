"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  weightedScore,
  BUCKET_LABEL,
  BUCKET_TONE,
  type AxisScores,
  type Weights,
  type Bucket,
} from "@/lib/dss/recommend";

export type SigmaItem = {
  programId: string;
  majorName: string | null;
  shortName: string | null;
  universityCode: string;
  bucket: Bucket | null;
  admitProb: number | null;
  axes: AxisScores;
};

const AXES: { key: keyof Weights; label: string }[] = [
  { key: "fit", label: "Phù hợp (Holland)" },
  { key: "prob", label: "Khả năng đỗ" },
  { key: "job", label: "Cơ hội việc làm" },
  { key: "afford", label: "Khả năng chi trả" },
];

function reason(it: SigmaItem): string {
  const parts: { label: string; v: number }[] = [
    { label: "phù hợp sở thích", v: it.axes.fit },
    { label: "khả năng đỗ", v: it.axes.prob },
    { label: "cơ hội việc làm", v: it.axes.job ?? -1 },
    { label: "khả năng chi trả", v: it.axes.afford },
  ].filter((p) => p.v >= 0);
  const top = [...parts].sort((a, b) => b.v - a.v).slice(0, 2);
  return top.map((p) => `${p.label} ${Math.round(p.v)}%`).join(" · ");
}

export function RecommendationBoard({
  options,
  selected,
  items,
}: {
  options: { student_id: string; label: string }[];
  selected: string;
  items: SigmaItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [w, setW] = useState<Weights>({ fit: 25, prob: 25, job: 25, afford: 25 });

  const ranked = useMemo(() => {
    return items
      .map((it) => ({ it, score: weightedScore(it.axes, w) }))
      .sort((a, b) => b.score - a.score);
  }, [items, w]);

  return (
    <div className="space-y-4">
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

      {/* Trọng số */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {AXES.map((a) => (
            <div key={a.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{a.label}</span>
                <span className="font-medium tabular-nums">{w[a.key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={w[a.key]}
                onChange={(e) => setW((prev) => ({ ...prev, [a.key]: Number(e.target.value) }))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {ranked.length === 0 ? (
        <EmptyState title="Học sinh này chưa có nguyện vọng để xếp hạng" />
      ) : (
        <>
          {/* Top 3 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ranked.slice(0, 3).map(({ it, score }, i) => (
              <Card key={it.programId} className={i === 0 ? "border-primary" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <Badge tone={i === 0 ? "success" : "neutral"}>Hạng {i + 1}</Badge>
                    {it.bucket ? (
                      <Badge tone={BUCKET_TONE[it.bucket]}>{BUCKET_LABEL[it.bucket]}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-snug">
                    {it.majorName ?? it.programId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.shortName ?? it.universityCode}
                  </div>
                  <div className="mt-3 text-3xl font-semibold tracking-tight">
                    {Math.round(score)}
                    <span className="text-base font-normal text-muted-foreground"> /100</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{reason(it)}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Bảng đầy đủ */}
          <Card>
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Ngành</th>
                      <th className="py-2 pr-3 font-medium">Trường</th>
                      <th className="py-2 pr-3 text-right font-medium">Điểm Σ</th>
                      <th className="py-2 pr-3 text-right font-medium">Phù hợp</th>
                      <th className="py-2 pr-3 text-right font-medium">Đỗ</th>
                      <th className="py-2 pr-3 text-right font-medium">Việc làm</th>
                      <th className="py-2 text-right font-medium">Chi trả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map(({ it, score }, i) => (
                      <tr key={it.programId} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-3">{it.majorName ?? it.programId}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {it.shortName ?? it.universityCode}
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                          {Math.round(score)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round(it.axes.fit)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round(it.axes.prob)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {it.axes.job == null ? "—" : Math.round(it.axes.job)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {Math.round(it.axes.afford)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
