import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getStudentOptions, getStudent } from "@/lib/queries/students";
import { getStudentApplications } from "@/lib/queries/applications";
import { getForecastAccuracy } from "@/lib/queries/forecast";
import {
  scoreNv,
  recommendOrder,
  probAtLeastOne,
  BUCKET_LABEL,
  BUCKET_TONE,
  type NvInput,
  type NvScored,
  type Bucket,
} from "@/lib/dss/recommend";
import { StudentPicker } from "./_components/student-picker";

const K01_BASELINE = 64.8; // % — tỷ lệ đỗ NV1–3 toàn hệ (tham chiếu)

function fmtMargin(m: number | null) {
  if (m == null) return "—";
  const s = m.toFixed(2).replace(".", ",");
  return m >= 0 ? `+${s}` : s;
}
function fmtProb(p: number | null) {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}

export default function Q1Page({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Xếp nguyện vọng"
        description="Chọn hồ sơ học sinh → phân loại từng nguyện vọng thành Với cao / Vừa sức / Chắc đỗ dựa trên biên điểm (thang 30) và sai số dự báo điểm chuẩn, kèm xác suất đỗ và thứ tự NV khuyến nghị."
        badge="Engine DSS · reach / match / safety"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Q1Content searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-xs text-muted-foreground">
        Biên điểm (margin) = điểm HS − điểm chuẩn (thang 30) của nguyện vọng đó; band co giãn theo
        MAE dự báo của ngành (tối thiểu 1,35). Với cao: margin &lt; −0,4×band · Vừa sức: −0,4×band
        ≤ margin &lt; 1,1×band · Chắc đỗ: margin ≥ 1,1×band. Xác suất đỗ = Φ(margin / band).
      </p>
    </div>
  );
}

async function Q1Content({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const sp = await searchParams;
  const options = await getStudentOptions();
  if (!options.length) {
    return <EmptyState title="Chưa có hồ sơ học sinh" description="Không đọc được dim_student." />;
  }
  const studentId =
    sp.student && options.some((o) => o.student_id === sp.student)
      ? sp.student
      : options[0].student_id;

  const [student, apps, acc] = await Promise.all([
    getStudent(studentId),
    getStudentApplications(studentId),
    getForecastAccuracy(),
  ]);
  const maeMap = Object.fromEntries(acc.map((a) => [a.programId, a.mae]));

  const inputs: NvInput[] = apps.map((a) => ({
    programId: a.program_id,
    majorName: a.major_name,
    universityCode: a.university_code,
    shortName: a.short_name,
    nvOrder: a.nv_order,
    bestMethod: a.best_method,
    margin30: a.best_margin_30,
    programMae: maeMap[a.program_id] ?? null,
    hollandMatchPct: a.holland_match_pct,
    affordabilityIndexPct: a.affordability_index_pct,
    employmentRatePct: null,
    estTotalCostVnd: a.est_total_cost_vnd,
    isAdmitted: a.is_admitted,
  }));
  const scored = inputs.map(scoreNv);
  const recommended = recommendOrder(scored);
  const probAny = probAtLeastOne(scored.map((s) => s.admitProb ?? 0)) * 100;

  const counts: Record<Bucket, number> = { reach: 0, match: 0, safety: 0 };
  scored.forEach((s) => {
    if (s.bucket) counts[s.bucket]++;
  });
  const top3 = [...scored].sort((a, b) => a.nvOrder - b.nvOrder).slice(0, 3);
  const top3AllReach = top3.length >= 3 && top3.every((s) => s.bucket === "reach");

  return (
    <div className="space-y-4">
      <StudentPicker options={options} selected={studentId} />

      {/* Thẻ thông tin HS */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-5 text-sm">
          <span className="font-medium">{studentId}</span>
          <span className="text-muted-foreground">Khóa {student?.cohort_year ?? "—"}</span>
          <span className="text-muted-foreground">Sở thích: {student?.interest_industry ?? "—"}</span>
          <span className="text-muted-foreground">Holland: {student?.holland_code ?? "—"}</span>
          {student?.special_case && student.special_case !== "NORMAL" ? (
            <Badge tone="warning">{student.special_case}</Badge>
          ) : null}
          <Badge tone={student?.admission_status === "Trúng tuyển" ? "success" : "neutral"}>
            {student?.admission_status ?? "—"}
          </Badge>
        </CardContent>
      </Card>

      {/* Tóm tắt */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Tổng nguyện vọng" value={`${scored.length}`} />
        <SummaryTile
          label="Phân bố"
          value={`${counts.reach} / ${counts.match} / ${counts.safety}`}
          hint="Với cao / Vừa sức / Chắc đỗ"
        />
        <SummaryTile
          label="P(đỗ ít nhất 1 NV)"
          value={`${Math.round(probAny)}%`}
          tone={probAny >= 90 ? "success" : probAny >= 70 ? "warning" : "danger"}
        />
        <SummaryTile
          label="Baseline K01 (toàn hệ)"
          value={`${K01_BASELINE.toFixed(1).replace(".", ",")}%`}
          hint="Tỷ lệ đỗ NV1–3 trung bình"
        />
      </div>

      {/* Cảnh báo */}
      {top3AllReach ? (
        <Card className="border-danger-bg bg-danger-bg/30">
          <CardContent className="p-4 text-sm">
            ⚠ Cả 3 nguyện vọng đầu đều thuộc nhóm <strong>Với cao</strong> — rủi ro trượt cao. Nên
            chèn ít nhất một NV <strong>Vừa sức</strong>/<strong>Chắc đỗ</strong> vào nhóm ưu tiên.
          </CardContent>
        </Card>
      ) : counts.safety === 0 ? (
        <Card className="border-warning-bg bg-warning-bg/30">
          <CardContent className="p-4 text-sm">
            ⚠ Chưa có nguyện vọng nào thuộc nhóm <strong>Chắc đỗ</strong> — cân nhắc bổ sung 1–2
            ngành an toàn để đảm bảo đỗ.
          </CardContent>
        </Card>
      ) : null}

      {/* Danh sách NV khuyến nghị */}
      <Card>
        <div className="p-5 pb-0">
          <h3 className="text-base font-semibold">Thứ tự nguyện vọng khuyến nghị</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ladder: ngành mơ ước (Với cao) ưu tiên trên, xen Vừa sức, chốt bằng Chắc đỗ.
          </p>
        </div>
        <CardContent className="p-5">
          {scored.length === 0 ? (
            <EmptyState title="Học sinh này chưa có nguyện vọng" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">NV đề xuất</th>
                    <th className="py-2 pr-3 font-medium">Ngành</th>
                    <th className="py-2 pr-3 font-medium">Trường</th>
                    <th className="py-2 pr-3 font-medium">Phân loại</th>
                    <th className="py-2 pr-3 text-right font-medium">Biên điểm</th>
                    <th className="py-2 pr-3 text-right font-medium">P(đỗ)</th>
                    <th className="py-2 pr-3 font-medium">Phương thức</th>
                    <th className="py-2 text-right font-medium">NV gốc</th>
                  </tr>
                </thead>
                <tbody>
                  {recommended.map((s, i) => (
                    <Row key={s.programId} s={s} order={i + 1} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Xem độ tin cậy dự báo từng ngành ở{" "}
        <Link href="/diem-chuan" className="underline">
          Dự báo điểm chuẩn
        </Link>
        , chi phí ở{" "}
        <Link href="/chi-phi" className="underline">
          Chi phí
        </Link>
        .
      </p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneText =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${toneText}`}>{value}</div>
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function Row({ s, order }: { s: NvScored; order: number }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-3 font-medium">NV{order}</td>
      <td className="py-2 pr-3">{s.majorName ?? s.programId}</td>
      <td className="py-2 pr-3 text-muted-foreground">{s.shortName ?? s.universityCode}</td>
      <td className="py-2 pr-3">
        {s.bucket ? <Badge tone={BUCKET_TONE[s.bucket]}>{BUCKET_LABEL[s.bucket]}</Badge> : "—"}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{fmtMargin(s.margin30)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{fmtProb(s.admitProb)}</td>
      <td className="py-2 pr-3 text-muted-foreground">{s.bestMethod ?? "—"}</td>
      <td className="py-2 text-right text-muted-foreground">NV{s.nvOrder}</td>
    </tr>
  );
}
