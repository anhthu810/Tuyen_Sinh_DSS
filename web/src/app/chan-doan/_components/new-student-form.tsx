"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sliders, RotateCcw } from "lucide-react";

export type NewStudentInitial = {
  score: number;
  combination: string;
  industry: string;
  holland: string;
  budgetMillions: number;
  count: number;
};

export function NewStudentForm({
  combinations,
  industries,
  initial,
}: {
  combinations: string[];
  industries: string[];
  initial: NewStudentInitial;
}) {
  const router = useRouter();
  const [score, setScore] = useState(String(initial.score));
  const [combination, setCombination] = useState(initial.combination);
  const [industry, setIndustry] = useState(initial.industry);
  const [holland, setHolland] = useState(initial.holland);
  const [budgetMillions, setBudgetMillions] = useState(String(initial.budgetMillions));
  const [count, setCount] = useState(String(initial.count));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (score.trim()) qs.set("score", score.trim());
    if (combination) qs.set("combination", combination);
    if (industry) qs.set("industry", industry);
    if (holland.trim()) qs.set("holland", holland.trim().toUpperCase());
    if (budgetMillions.trim()) qs.set("budgetM", budgetMillions.trim());
    if (count) qs.set("count", count);
    router.push(`/chan-doan?${qs.toString()}`);
  }

  function reset() {
    setScore("25");
    setCombination("");
    setIndustry("");
    setHolland("");
    setBudgetMillions("100");
    setCount("9");
    router.push("/chan-doan");
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Sliders className="size-3.5 text-indigo-600" />
          Hồ sơ học sinh mới — Nhập thông số để xếp nguyện vọng &amp; chẩn đoán
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <RotateCcw className="size-3" />
          Mặc định (25đ · 100tr)
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Điểm (thang 30)
          </span>
          <input
            type="number"
            min={0}
            max={30}
            step={0.05}
            required
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="h-9 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Tổ hợp môn
          </span>
          <select
            value={combination}
            onChange={(e) => setCombination(e.target.value)}
            className="h-9 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
          >
            <option value="">Tất cả tổ hợp</option>
            {combinations.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Nhóm nghề
          </span>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="h-9 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
          >
            <option value="">Tất cả nhóm nghề</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Holland (RIASEC)
          </span>
          <input
            type="text"
            maxLength={3}
            pattern="[RIASECriasec]{0,3}"
            placeholder="VD: IRC"
            value={holland}
            onChange={(e) => setHolland(e.target.value.toUpperCase())}
            className="h-9 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 text-sm uppercase text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Ngân sách (tr/năm)
          </span>
          <input
            type="number"
            min={10}
            max={1000}
            step={5}
            value={budgetMillions}
            onChange={(e) => setBudgetMillions(e.target.value)}
            className="h-9 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Số NV gợi ý
          </span>
          <select
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="h-9 rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
          >
            {[6, 9, 12, 15].map((n) => (
              <option key={n} value={n}>
                {n} nguyện vọng
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            className="h-9 w-full rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-600"
          >
            Chẩn đoán &amp; Xếp NV
          </button>
        </div>
      </div>
    </form>
  );
}

