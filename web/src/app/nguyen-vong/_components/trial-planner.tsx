import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { adviseFromScore } from "@/lib/dss/advise";
import {
  BUCKET_LABEL,
  BUCKET_TONE,
  probAtLeastOne,
  recommendOrder,
  scoreNv,
  type Bucket,
  type NvInput,
} from "@/lib/dss/recommend";
import { getSubjectCombinationOptions } from "@/lib/queries/signals";

type TrialSearchParams = {
  score?: string;
  holland?: string;
  combination?: string;
  budget?: string;
  count?: string;
};

function parseCount(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 12;
}

function fmtMargin(value: number | null) {
  if (value == null) return "—";
  const formatted = value.toFixed(2).replace(".", ",");
  return value >= 0 ? `+${formatted}` : formatted;
}

function fmtProbability(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export async function TrialPlanner({
  searchParams,
}: {
  searchParams: TrialSearchParams;
}) {
  const combinations = await getSubjectCombinationOptions();
  const score =
    searchParams.score != null && searchParams.score !== ""
      ? Number(searchParams.score)
      : null;
  const scoreValid =
    score != null && Number.isFinite(score) && score >= 0 && score <= 30;
  const holland =
    searchParams.holland && /^[RIASEC]{1,3}$/i.test(searchParams.holland)
      ? searchParams.holland.toUpperCase()
      : undefined;
  const combination =
    searchParams.combination &&
    combinations.includes(searchParams.combination.toUpperCase())
      ? searchParams.combination.toUpperCase()
      : undefined;
  const budget =
    searchParams.budget != null && searchParams.budget !== ""
      ? Number(searchParams.budget)
      : undefined;
  const validBudget =
    budget == null || (Number.isFinite(budget) && budget >= 0);
  const count = parseCount(searchParams.count);

  const candidates =
    scoreValid && validBudget
      ? await adviseFromScore({
          score30: score,
          hollandCode: holland,
          subjectCombination: combination,
          budgetVndYear: budget,
        })
      : [];
  const inputs: NvInput[] = candidates.slice(0, count).map((item, index) => ({
    programId: item.programId,
    majorName: item.majorName,
    universityCode: item.universityCode,
    shortName: item.shortName,
    nvOrder: index + 1,
    bestMethod: null,
    margin30: item.margin,
    programMae: item.band,
    hollandMatchPct: item.fit,
    affordabilityIndexPct:
      item.afford == null ? null : 200 - item.afford,
    employmentRatePct: item.employmentRate,
    estTotalCostVnd: item.estTotalCost,
    isAdmitted: null,
  }));
  const scored = inputs.map(scoreNv);
  const recommended = recommendOrder(scored);
  const probabilityAtLeastOne =
    probAtLeastOne(scored.map((item) => item.admitProb ?? 0)) * 100;
  const counts: Record<Bucket, number> = {
    reach: 0,
    match: 0,
    safety: 0,
  };
  scored.forEach((item) => {
    if (item.bucket) counts[item.bucket]++;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Chế độ thử: nhập hồ sơ của bạn để tạo danh sách nguyện vọng mẫu. Hồ sơ
          không được lưu vào cơ sở dữ liệu.
        </p>
        <Link
          href="/nguyen-vong"
          className="text-sm font-medium text-primary underline"
        >
          Chọn học sinh trong dữ liệu
        </Link>
      </div>

      <Card>
        <CardContent className="p-5">
          <form
            action="/nguyen-vong"
            method="get"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="mode" value="trial" />
            <div>
              <label className="mb-1 block text-sm font-medium">
                Điểm xét tuyển (thang 30) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                name="score"
                min={0}
                max={30}
                step={0.01}
                required
                defaultValue={searchParams.score}
                placeholder="VD: 25.5"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="trial-holland" className="text-sm font-medium">
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
                id="trial-holland"
                type="text"
                name="holland"
                maxLength={3}
                pattern="[RIASEC]{1,3}"
                title="Nhập 1–3 chữ cái R, I, A, S, E, C"
                defaultValue={searchParams.holland?.toUpperCase()}
                placeholder="VD: IRC"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="trial-combination" className="mb-1 block text-sm font-medium">
                Tổ hợp xét tuyển (tùy chọn)
              </label>
              <Select
                id="trial-combination"
                name="combination"
                defaultValue={combination ?? ""}
                className="w-full"
              >
                <option value="">Tất cả tổ hợp</option>
                {combinations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Ngân sách/năm (VND, tùy chọn)
              </label>
              <input
                type="number"
                name="budget"
                min={0}
                step={1000000}
                defaultValue={searchParams.budget}
                placeholder="VD: 100000000"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Số nguyện vọng gợi ý
              </label>
              <Select name="count" defaultValue={String(count)} className="w-full">
                {[5, 10, 12, 15, 20, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} ngành
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Tạo danh sách nguyện vọng thử
              </button>
            </div>
          </form>
          {!validBudget ? (
            <p className="mt-3 text-sm text-danger">
              Ngân sách phải là số không âm.
            </p>
          ) : null}
          {searchParams.score && !scoreValid ? (
            <p className="mt-3 text-sm text-danger">
              Điểm phải nằm trong khoảng 0–30.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!scoreValid || !validBudget ? null : !recommended.length ? (
        <EmptyState
          title="Chưa có ngành phù hợp dữ liệu"
          description="Không tìm thấy ngành có điểm chuẩn/dự báo phù hợp với bộ lọc. Hãy thử đổi tổ hợp hoặc bỏ bộ lọc."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Nguyện vọng mẫu" value={`${recommended.length}`} />
            <SummaryTile
              label="Với cao / Vừa sức / Chắc đỗ"
              value={`${counts.reach} / ${counts.match} / ${counts.safety}`}
            />
            <SummaryTile
              label="P(đỗ ít nhất 1 NV)"
              value={`${Math.round(probabilityAtLeastOne)}%`}
            />
            <SummaryTile
              label="Điểm dùng mô phỏng"
              value={`${score!.toFixed(2).replace(".", ",")}/30`}
            />
          </div>

          <Card>
            <div className="p-5 pb-0">
              <h3 className="text-base font-semibold">
                Thứ tự nguyện vọng gợi ý
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Danh sách được chọn từ các ngành trong dữ liệu và sắp theo nhóm
                Với cao → Vừa sức → Chắc đỗ. Đây là mô phỏng, chưa lưu vào hệ
                thống.
              </p>
            </div>
            <CardContent className="p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Thứ tự gợi ý</th>
                      <th className="py-2 pr-3 font-medium">Ngành</th>
                      <th className="py-2 pr-3 font-medium">Trường</th>
                      <th className="py-2 pr-3 font-medium">Phân loại</th>
                      <th className="py-2 pr-3 text-right font-medium">Biên điểm</th>
                      <th className="py-2 pr-3 text-right font-medium">P(đỗ)</th>
                      <th className="py-2 pr-3 font-medium">Phương thức</th>
                      <th className="py-2 text-right font-medium">Vị trí ban đầu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommended.map((item, index) => (
                      <tr key={item.programId} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">NV{index + 1}</td>
                        <td className="py-2 pr-3">
                          <Link
                            href={`/explorer/${item.programId}`}
                            className="hover:underline"
                          >
                            {item.majorName ?? item.programId}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {item.shortName ?? item.universityCode}
                        </td>
                        <td className="py-2 pr-3">
                          {item.bucket ? (
                            <Badge tone={BUCKET_TONE[item.bucket]}>
                              {BUCKET_LABEL[item.bucket]}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {fmtMargin(item.margin30)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {fmtProbability(item.admitProb)}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">—</td>
                        <td className="py-2 text-right text-muted-foreground">
                          #{item.nvOrder}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Tỷ lệ đỗ là ước tính dựa trên điểm chuẩn tham chiếu và sai số dự báo,
            không phải cam kết trúng tuyển.{" "}
            {holland ? `Đã dùng mã Holland ${holland}.` : ""}
          </p>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
