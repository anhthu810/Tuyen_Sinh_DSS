"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ieltsAdmissionBonus } from "@/lib/dss/scale";

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

  const [ieltsBand, setIeltsBand] = useState("");

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

  const ieltsValue = Number(ieltsBand);
  const validIeltsBand =
    ieltsBand !== "" &&
    Number.isFinite(ieltsValue) &&
    ieltsValue >= 0 &&
    ieltsValue <= 9;
  const ieltsBonus = validIeltsBand ? ieltsAdmissionBonus(ieltsValue) : null;
  const baseScore = Number(score);
  const validBaseScore =
    score !== "" && Number.isFinite(baseScore) && baseScore >= 0 && baseScore <= 30;
  const adjustedScore =
    validBaseScore && ieltsBonus != null
      ? Math.min(30, baseScore + ieltsBonus)
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium">
                Mã Holland (tùy chọn)
              </label>
              <a
                href="https://jobsgo.vn/trac-nghiem-holland.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                Làm trắc nghiệm
              </a>
            </div>
            <input
              type="text"
              maxLength={3}
              value={holland}
              onChange={(e) => setHolland(e.target.value.toUpperCase())}
              placeholder="VD: IRC"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Làm trắc nghiệm rồi nhập mã Holland 3 chữ cái (RIASEC) nhận được.
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

        <div className="mt-4 space-y-2 border-t pt-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="quick-ielts-band" className="font-medium">
              Ước tính điểm cộng IELTS:
            </label>
            <input
              id="quick-ielts-band"
              type="number"
              min={0}
              max={9}
              step={0.5}
              value={ieltsBand}
              onChange={(e) => setIeltsBand(e.target.value)}
              placeholder="Band 0–9"
              className="h-9 w-28 rounded-lg border bg-card px-3 text-sm"
            />
            <span className="text-muted-foreground">
              Điểm cộng: <strong className="text-foreground">
                {ieltsBonus == null ? "—" : `+${ieltsBonus.toFixed(2)}`}
              </strong>
            </span>
            <span className="text-muted-foreground">
              Điểm sau cộng: <strong className="text-foreground">
                {adjustedScore == null ? "—" : `${adjustedScore.toFixed(2)}/30`}
              </strong>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={adjustedScore == null || ieltsBonus == null}
              onClick={() => {
                if (adjustedScore != null) setScore(adjustedScore.toFixed(2));
              }}
            >
              Dùng điểm sau cộng
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mức điểm cộng theo giả định của hệ thống; điểm tổng không vượt quá 30.
            Việc quy đổi IELTS thực tế tùy đề án và phương thức tuyển sinh của từng trường.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
