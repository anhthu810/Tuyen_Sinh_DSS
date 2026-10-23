"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Loader2, Sparkles, GraduationCap } from "lucide-react";
import { formatVndShort } from "@/lib/format";

type Rec = {
  program_id: string;
  major_name: string;
  university: string;
  why_fit: string;
  career_outlook: string;
  admit_note: string;
  data?: {
    bucket: "reach" | "match" | "safety" | null;
    admitProb: number;
    employmentRate: number | null;
    estTotalCost: number | null;
    refCutoff30: number;
    subjectCombinations: string[];
  };
};
type Result = {
  overall: string;
  recommendations: Rec[];
  caution: string;
  source: "ai" | "fallback";
  note?: string;
  error?: string;
};

const BUCKET: Record<string, { label: string; tone: "danger" | "warning" | "success" }> = {
  reach: { label: "Với cao", tone: "danger" },
  match: { label: "Vừa sức", tone: "warning" },
  safety: { label: "Chắc đỗ", tone: "success" },
};

export function AiAdvisorForm({ subjectCombinations }: { subjectCombinations: string[] }) {
  const [score, setScore] = useState("");
  const [personality, setPersonality] = useState("");
  const [holland, setHolland] = useState("");
  const [budget, setBudget] = useState("");
  const [combination, setCombination] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tu-van-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, personality, holland, budget, subjectCombination: combination }),
      });
      const json: Result = await res.json();
      if (json.error) setErr(json.error);
      else setResult(json);
    } catch {
      setErr("Không gọi được dịch vụ tư vấn. Thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Điểm (thang 30) <span className="text-danger">*</span>
                </label>
                <input
                  type="number" min={0} max={30} step={0.01} required
                  value={score} onChange={(e) => setScore(e.target.value)}
                  placeholder="VD: 25.5"
                  className="h-10 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Mã Holland (tùy chọn)</label>
                <input
                  type="text" maxLength={3} value={holland}
                  onChange={(e) => setHolland(e.target.value.toUpperCase())}
                  placeholder="VD: IRC"
                  className="h-10 w-full rounded-lg border bg-card px-3 text-sm uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Ngân sách/năm (tùy chọn)</label>
                <input
                  type="number" min={0} step={1000000} value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="VD: 100000000"
                  className="h-10 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Tổ hợp xét tuyển (tùy chọn)</label>
                <Select value={combination} onChange={(e) => setCombination(e.target.value)} className="w-full">
                  <option value="">Tất cả tổ hợp</option>
                  {subjectCombinations.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Mô tả bản thân — tính cách, sở thích, môn giỏi, mong muốn nghề nghiệp
              </label>
              <textarea
                value={personality} onChange={(e) => setPersonality(e.target.value)} rows={4}
                placeholder="VD: Em hướng nội, thích logic và máy tính, giỏi Toán–Lý, muốn làm kỹ sư phần mềm, ngại giao tiếp đông người..."
                className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading ? "GLM đang phân tích…" : "Tư vấn bằng AI"}
              </Button>
              {loading ? (
                <span className="text-xs text-muted-foreground">
                  AI đang suy luận (~20–50 giây), vui lòng đợi…
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {err ? (
        <Card className="border-danger-bg bg-danger-bg/30">
          <CardContent className="p-4 text-sm">{err}</CardContent>
        </Card>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={result.source === "ai" ? "default" : "warning"}>
                  {result.source === "ai" ? "Phân tích bởi GLM-5.3" : "Gợi ý theo thuật toán"}
                </Badge>
              </div>
              {result.note ? (
                <p className="mb-2 text-xs text-muted-foreground">{result.note}</p>
              ) : null}
              <p className="text-sm">{result.overall}</p>
              {result.caution ? (
                <p className="mt-2 text-xs text-warning">⚠ {result.caution}</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.recommendations.map((r, i) => {
              const b = r.data?.bucket ? BUCKET[r.data.bucket] : null;
              return (
                <Card key={r.program_id}>
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between">
                      <Badge tone="neutral">Gợi ý {i + 1}</Badge>
                      {b ? <Badge tone={b.tone}>{b.label}</Badge> : null}
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <GraduationCap className="size-4 shrink-0 text-primary" />
                      {r.major_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.university}</div>
                    {r.data?.subjectCombinations.length ? (
                      <div className="text-xs text-muted-foreground">
                        Tổ hợp: {r.data.subjectCombinations.join(", ")}
                      </div>
                    ) : null}
                    {r.data ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>P(đỗ) ~{Math.round(r.data.admitProb * 100)}%</span>
                        {r.data.employmentRate != null ? <span>việc làm {Math.round(r.data.employmentRate)}%</span> : null}
                        {r.data.estTotalCost != null ? <span>chi phí {formatVndShort(r.data.estTotalCost)}</span> : null}
                      </div>
                    ) : null}
                    <div className="mt-1 space-y-1 text-sm">
                      <p><span className="font-medium">Vì sao hợp: </span>{r.why_fit}</p>
                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Triển vọng: </span>{r.career_outlook}</p>
                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Khả năng đỗ: </span>{r.admit_note}</p>
                    </div>
                    <Link
                      href={`/explorer/${r.program_id}`}
                      className="mt-1 text-xs text-primary underline"
                    >
                      Xem chi tiết ngành →
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
