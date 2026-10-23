"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { tsaTo30, hsaTo30 } from "@/lib/dss/scale";

export function ScoreForm({
  industries,
  universities,
  subjectCombinations,
  initial,
}: {
  industries: string[];
  universities: {
    university_code: string;
    short_name: string | null;
    university_name: string;
  }[];
  subjectCombinations: string[];
  initial: {
    score?: string;
    holland?: string;
    industry?: string;
    university?: string;
    combination?: string;
    budget?: string;
  };
}) {
  const router = useRouter();
  const [score, setScore] = useState(initial.score ?? "");
  const [holland, setHolland] = useState(initial.holland ?? "");
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [university, setUniversity] = useState(initial.university ?? "");
  const [combination, setCombination] = useState(initial.combination ?? "");
  const [budget, setBudget] = useState(initial.budget ?? "");

  // tiện ích quy đổi nhanh TSA/HSA → thang 30
  const [conv, setConv] = useState("");
  const [convType, setConvType] = useState<"TSA" | "HSA">("TSA");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (score) p.set("score", score);
    if (holland) p.set("holland", holland);
    if (industry) p.set("industry", industry);
    if (university) p.set("university", university);
    if (combination) p.set("combination", combination);
    if (budget) p.set("budget", budget);
    router.push(`/tu-van?${p.toString()}`);
  }

  const convResult =
    conv && !Number.isNaN(Number(conv))
      ? (convType === "TSA"
          ? tsaTo30(Number(conv))
          : hsaTo30(Number(conv))
        ).toFixed(2)
      : null;

  return (
    <Card>
      <CardContent className="p-5">
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">
              Điểm của bạn (thang 30) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={30}
              step={0.01}
              required
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="VD: 25.5"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Mã Holland (tùy chọn)
            </label>
            <input
              type="text"
              maxLength={3}
              value={holland}
              onChange={(e) => setHolland(e.target.value.toUpperCase())}
              placeholder="VD: IRC"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              3 chữ RIASEC theo sở thích/tính cách.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Ngân sách/năm (tùy chọn)
            </label>
            <input
              type="number"
              min={0}
              step={1000000}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="VD: 100000000"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Nhóm nghề quan tâm (tùy chọn)
            </label>
            <Select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full"
            >
              <option value="">Tất cả nhóm nghề</option>
              {industries.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Trường (tùy chọn)
            </label>
            <Select
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="w-full"
            >
              <option value="">Tất cả trường</option>
              {universities.map((u) => (
                <option key={u.university_code} value={u.university_code}>
                  {u.short_name ?? u.university_code} — {u.university_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Tổ hợp xét tuyển (tùy chọn)
            </label>
            <Select
              value={combination}
              onChange={(e) => setCombination(e.target.value)}
              className="w-full"
            >
              <option value="">Tất cả tổ hợp</option>
              {subjectCombinations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Phân tích & tư vấn
            </Button>
          </div>
        </form>

        {/* Quy đổi nhanh TSA/HSA → thang 30 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
          <span className="text-muted-foreground">Quy đổi nhanh:</span>
          <Select
            value={convType}
            onChange={(e) => setConvType(e.target.value as "TSA" | "HSA")}
            className="h-9"
          >
            <option value="TSA">TSA</option>
            <option value="HSA">HSA</option>
          </Select>
          <input
            type="number"
            value={conv}
            onChange={(e) => setConv(e.target.value)}
            placeholder="điểm gốc"
            className="h-9 w-28 rounded-lg border bg-card px-3 text-sm"
          />
          <span className="text-muted-foreground">→ thang 30:</span>
          <span className="font-medium">{convResult ?? "—"}</span>
          {convResult ? (
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => setScore(convResult)}
            >
              dùng điểm này
            </button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
