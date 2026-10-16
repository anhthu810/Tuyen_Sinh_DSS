"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type ProgramOption = {
  value: string;
  label: string;
};

export function CostControls({
  options,
  program,
  budget,
}: {
  options: ProgramOption[];
  program: string;
  budget: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [budgetInput, setBudgetInput] = useState(String(budget));

  useEffect(() => {
    setBudgetInput(String(budget));
  }, [budget]);

  function parsedBudget(): number | null {
    const v = Number(budgetInput);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  }

  function navigate(nextProgram: string, nextBudget: number) {
    const params = new URLSearchParams({
      program: nextProgram,
      budget: String(nextBudget),
    });
    startTransition(() => {
      router.push(`/chi-phi?${params.toString()}`);
    });
  }

  function apply(nextProgram: string = program) {
    const b = parsedBudget();
    if (b != null) navigate(nextProgram, b);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end">
        <div className="flex-1">
          <label
            htmlFor="chi-phi-program"
            className="mb-1.5 block text-sm font-medium"
          >
            Ngành học
          </label>
          <Select
            id="chi-phi-program"
            className="w-full"
            value={program}
            disabled={pending}
            onChange={(e) => {
              const b = parsedBudget();
              if (b != null) navigate(e.target.value, b);
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label
            htmlFor="chi-phi-budget"
            className="mb-1.5 block text-sm font-medium"
          >
            Ngân sách gia đình (VND/năm)
          </label>
          <input
            id="chi-phi-budget"
            type="number"
            min={0}
            step={10_000_000}
            inputMode="numeric"
            className="h-10 w-full rounded-lg border bg-card px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-64"
            value={budgetInput}
            disabled={pending}
            onChange={(e) => setBudgetInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
          />
        </div>

        <Button onClick={() => apply()} disabled={pending || parsedBudget() == null}>
          <Calculator className="size-4" />
          {pending ? "Đang tính…" : "Tính lại"}
        </Button>
      </CardContent>
    </Card>
  );
}