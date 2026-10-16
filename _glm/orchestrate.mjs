// Orchestrator: Claude giao 1 module cho GLM-5.3 (z.ai), nhận code, ghi file
// (chỉ trong folder được phép), build, gửi lỗi lại cho GLM sửa — lặp tới khi pass.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // C:/Users/dat/Desktop/dss
const WEB = path.join(ROOT, "web");
const KEY = process.env.ZAI_API_KEY;
if (!KEY) { console.error("MISSING ZAI_API_KEY"); process.exit(2); }

const MODEL = "glm-5.3";
const MAX_ITERS = 4;

function readFileSafe(rel) {
  const p = path.join(WEB, rel);
  try { return fs.readFileSync(p, "utf8"); } catch { return `/* (chưa có ${rel}) */`; }
}

// ---- Context: các file hợp đồng GLM import (ground truth) ----
const CONTRACT_FILES = [
  "src/types/database.types.ts",
  "src/lib/queries/forecast.ts",
  "src/lib/queries/programs.ts",
  "src/lib/queries/filters.ts",
  "src/lib/queries/employment.ts",
  "src/lib/queries/tuition.ts",
  "src/lib/queries/students.ts",
  "src/lib/queries/quality.ts",
  "src/lib/dss/cost.ts",
  "src/components/charts/palette.ts",
  "src/components/charts/chart-card.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/badge.tsx",
  "src/components/ui/button.tsx",
  "src/components/ui/select.tsx",
  "src/components/ui/skeleton.tsx",
  "src/components/ui/empty-state.tsx",
  "src/components/ui/data-quality-badge.tsx",
  "src/components/page-header.tsx",
  "src/app/page.tsx", // ví dụ pattern Suspense + server component
];

const contractBlock = CONTRACT_FILES.map(
  (f) => `----- FILE (READ-ONLY, import được, KHÔNG sửa): web/${f} -----\n${readFileSafe(f)}`,
).join("\n\n");

const CONVENTIONS = `QUY ƯỚC DỰ ÁN (bắt buộc tuân theo):
- Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + Recharts (đã cài) + lucide-react.
- Cache Components ĐANG BẬT: KHÔNG dùng "export const revalidate". Mọi truy cập dữ liệu động (await query, searchParams) PHẢI nằm trong <Suspense fallback={...}>.
- Server Component mặc định; thêm "use client" ở đầu file cho component tương tác (Recharts, useState, useRouter).
- Tailwind dùng token: bg-card, text-card-foreground, text-muted-foreground, bg-muted, border, bg-primary, text-primary-foreground, rounded-xl, bg-success-bg/text-success, bg-warning-bg/text-warning, bg-danger-bg/text-danger. KHÔNG dùng màu tùy ý ngoài token + chartPalette.
- Nhãn tiếng Việt giữ NGUYÊN VĂN (en-dash – , ≤ , …). KHÔNG hardcode số liệu — lấy từ lib/queries.
- Import alias "@/..." = web/src/...
- searchParams là Promise: "{ searchParams }: { searchParams: Promise<{ program?: string }> }" rồi await.`;

const OUTPUT_FORMAT = `ĐỊNH DẠNG XUẤT (chỉ xuất đúng thế này, KHÔNG prose, KHÔNG markdown fence):
Mỗi file một khối:
<<<FILE path=web/src/app/diem-chuan/....>>>
<nội dung file đầy đủ>
<<<END>>>
CHỈ được tạo file dưới web/src/app/diem-chuan/ (trang + thư mục _components/). Tuyệt đối KHÔNG xuất file ngoài thư mục này.`;

const TASKS = {
  "diem-chuan": {
    allowedPrefix: "web/src/app/diem-chuan/",
    spec: `NHIỆM VỤ: Xây trang "Q2 · Dự báo điểm chuẩn" tại web/src/app/diem-chuan/page.tsx + component con trong web/src/app/diem-chuan/_components/.

Dữ liệu dùng (import từ hợp đồng):
- getPrograms() từ "@/lib/queries/programs" → danh sách ngành cho bộ chọn (mỗi ProgramRow có program_id, major_name, university_name, short_name, university_code).
- getForecast(programId) từ "@/lib/queries/forecast" → ForecastPoint[] (mỗi năm có 2 dòng: method bắt đầu "NAIVE" và "MA2"; trường: target_year, method, forecast_cutoff, actual_cutoff, abs_error). Năm 2027 chưa có actual_cutoff.
- getForecastAccuracy() từ "@/lib/queries/forecast" → [{programId, mae, n}] để lấy MAE của ngành đang chọn (K03 cấp ngành).

YÊU CẦU CHỨC NĂNG:
1. page.tsx (Server Component): đọc searchParams.program (await); mặc định = program_id đầu tiên của getPrograms(). Render <PageHeader title="Q2 · Dự báo điểm chuẩn" description="..."/> + bộ chọn ngành + phần biểu đồ. Bọc phần phụ thuộc dữ liệu trong <Suspense fallback> (skeleton). Tách phần fetch forecast vào 1 async server component con để Suspense hoạt động.
2. _components/program-picker.tsx ("use client"): <Select> liệt kê ngành (option label = \`\${short_name ?? university_code} — \${major_name}\`, value = program_id). onChange → dùng useRouter()/usePathname() của "next/navigation" đẩy ?program=<id> (router.push(pathname + "?program=" + id)). Nhận props: programs (mảng {program_id, major_name, university_name, short_name, university_code}) + selected.
3. _components/forecast-chart.tsx ("use client"): Recharts ComposedChart trong ResponsiveContainer (height 320). Trục X = target_year. Vẽ: Line actual (actual_cutoff, màu chartPalette.actual), Line NAIVE (màu chartPalette.naive, nét đứt), Line MA2 (màu chartPalette.ma2). Dải sai số: Area quanh MA2 = [ma2 - mae, ma2 + mae] (màu chartPalette.band, opacity thấp ~0.15). Có <Legend/>, <Tooltip/>, <CartesianGrid/>. Nhận props: data (đã gộp theo năm: {year, actual, naive, ma2, bandLow, bandHigh}) + mae.
4. Gộp dữ liệu: từ ForecastPoint[] → mảng theo năm {year, actual, naive, ma2, bandLow, bandHigh} (bandLow=ma2-mae, bandHigh=ma2+mae). Làm việc này ở server component rồi truyền xuống chart (client).
5. Dùng <ChartCard title=... description=... table={<bảng năm/phương pháp/dự báo/thực tế/|sai số|>}> bọc biểu đồ (ChartCard là client, nhận children + table).
6. Thẻ KPI MAE: hiện MAE của ngành (làm tròn 2 số) + câu: "Nên cộng thêm ~{Math.ceil(mae)} điểm làm khoảng an toàn khi chốt nguyện vọng." Dùng <Card>/<Badge>.
7. Nếu ngành không có dữ liệu dự báo → <EmptyState title="Chưa có dữ liệu dự báo cho ngành này"/>.

Chỉ xuất file dưới web/src/app/diem-chuan/. KHÔNG tạo/sửa file khác.`,
  },

  "viec-lam": {
    allowedPrefix: "web/src/app/viec-lam/",
    spec: `NHIỆM VỤ: Xây trang "Q3 · Cơ hội việc làm" tại web/src/app/viec-lam/page.tsx + component con trong web/src/app/viec-lam/_components/.

Dữ liệu (import từ hợp đồng):
- getEmployment(f?) từ "@/lib/queries/employment" → EmploymentRow[] (có employment_rate_pct (đã là %), major_name, university_code, graduation_year).
- getLaborDemand(industryGroup?) từ "@/lib/queries/employment" → FactLaborDemand[] (industry_group, period_end_year, metric, value, unit, note).
- getIndustryGroups(), getUniversities() từ "@/lib/queries/filters" cho bộ lọc.

YÊU CẦU:
1. page.tsx (Server Component) + bọc phần dữ liệu trong <Suspense fallback skeleton>. <PageHeader title="Q3 · Cơ hội việc làm" description="Tỷ lệ việc làm sau 1 năm (K05) và nhu cầu tuyển dụng theo nhóm nghề (K04)."/>.
2. Phần A — Tỷ lệ việc làm: lấy getEmployment(), hiển thị:
   - Thẻ K05 = trung bình employment_rate_pct (1 số thập phân, %), badge success nếu ≥90%.
   - Biểu đồ thanh ngang (Recharts BarChart layout="vertical") top ~15 ngành theo employment_rate_pct; màu theo ngưỡng 90% (≥90 chartPalette.positive, 80–90 chartPalette.warning, <80 chartPalette.negative). Bọc <ChartCard> có table.
3. Phần B — Nhu cầu nhân lực: getLaborDemand() theo industry_group được chọn (bộ lọc client cập nhật ?industry=). Hiển thị các chỉ số (metric, value, unit, năm) dạng danh sách/thẻ; nếu có ≥2 năm cùng metric thì tính tăng trưởng YoY (K04) và dùng DivergingBar (dương xanh/âm đỏ). Dữ liệu mỏng → nếu không đủ, hiện <EmptyState title="Chưa đủ dữ liệu nhu cầu cho nhóm nghề này"/> (KHÔNG bịa số).
4. Bộ lọc: 1 client component _components/filter-controls.tsx dùng <Select> (trường + nhóm nghề) đẩy ?university=&industry= qua useRouter.
Chỉ xuất file dưới web/src/app/viec-lam/.`,
  },

  "chi-phi": {
    allowedPrefix: "web/src/app/chi-phi/",
    spec: `NHIỆM VỤ: Xây trang "Q4 · Chi phí & khả năng chi trả" tại web/src/app/chi-phi/page.tsx + _components/.

Dữ liệu (import):
- getPrograms() từ "@/lib/queries/programs" cho bộ chọn ngành.
- estimateCost({programId, budgetVndYear}) từ "@/lib/dss/cost" → {durationYears, firstYearTuitionVnd, tuitionIsImputed, livingSupportVndYear, totalCostVnd (K06), affordabilityIndexPct (K07)}.
- COST_PARAMS từ "@/lib/dss/cost" (livingVndYear, tuitionGrowthPerYear, teacherSupportVndYear).
- Hàm format: formatVnd, formatVndShort, formatPct từ "@/lib/format".

YÊU CẦU:
1. page.tsx (Server) đọc searchParams.program + searchParams.budget (await, Promise). Mặc định program = ngành đầu; budget = 100000000. Bọc dữ liệu trong <Suspense>.
2. _components/cost-controls.tsx ("use client"): <Select> chọn ngành + <input type="number"> nhập ngân sách/năm (VND), đẩy ?program=&budget= qua useRouter.
3. Gọi estimateCost → hiển thị:
   - GaugeMeter/ProgressMeter (tự dựng bằng div + width %, hoặc Recharts RadialBar) cho affordabilityIndexPct (K07), mốc 100%; màu: ≤100 positive, 100–150 warning, >150 negative.
   - Thẻ K06 tổng chi phí toàn khóa (formatVnd) + bóc tách: học phí năm đầu (có cờ "ước lượng" nếu tuitionIsImputed), số năm, sinh hoạt 54tr/năm, hỗ trợ NĐ116 nếu có.
   - Nếu affordabilityIndexPct > 100 → khối gợi ý: "Vượt ngân sách — cân nhắc học bổng, ngành học phí thấp hơn, hoặc vay tín dụng SV." (badge danger/warning).
4. Nếu estimateCost trả totalCostVnd = null → EmptyState "Chưa có dữ liệu học phí cho ngành này".
Chỉ xuất file dưới web/src/app/chi-phi/.`,
  },

  "explorer": {
    allowedPrefix: "web/src/app/explorer/",
    spec: `NHIỆM VỤ: Xây "Tra cứu ngành" tại web/src/app/explorer/page.tsx + trang chi tiết web/src/app/explorer/[programId]/page.tsx + _components/.

Dữ liệu (import):
- getPrograms(f?) từ "@/lib/queries/programs" (ProgramRow: program_id, major_name, university_name, short_name, university_code, khoi_nganh, industry_group, program_type, duration_years).
- getProgramDetail(programId) từ "@/lib/queries/programs" → {program:{...university}, cutoffs[], quotas[], tuition[], employment[], forecasts[]}.
- getUniversities(), getKhoiNganhList() từ "@/lib/queries/filters" cho bộ lọc.

YÊU CẦU:
1. explorer/page.tsx (Server): đọc searchParams (await: {university?, khoi?, q?}). Bọc dữ liệu trong <Suspense>. <PageHeader title="Tra cứu ngành" .../>.
   - Bộ lọc client _components/explorer-filters.tsx: <Select> trường + <Select> khối ngành + ô tìm (input) → đẩy ?university=&khoi=&q=.
   - Bảng (tự dựng <table> + style token) các ngành từ getPrograms({universityCode, khoiNganh, search}); cột: Trường (short_name), Tên ngành, Khối, Nhóm nghề, Loại CT, Số năm. Mỗi dòng link tới /explorer/<program_id>. Phân trang client đơn giản (ví dụ 25/trang) trong 1 client component, HOẶC hiển thị tối đa 100 dòng + ghi chú tổng số.
2. explorer/[programId]/page.tsx (Server): params là Promise ({ params }: { params: Promise<{ programId: string }> }) → await. Gọi getProgramDetail. Hiển thị: thông tin ngành + trường; bảng điểm chuẩn qua các năm/phương thức (cutoffs, dùng DataQualityBadge cho confidence/scale_confirmed); chỉ tiêu; học phí; tỷ lệ việc làm; link sang /diem-chuan?program=<id> và /chi-phi?program=<id>. Nếu không thấy ngành → thông báo + link quay lại.
Chỉ xuất file dưới web/src/app/explorer/.`,
  },

  "chat-luong-du-lieu": {
    allowedPrefix: "web/src/app/chat-luong-du-lieu/",
    spec: `NHIỆM VỤ: Xây trang "Chất lượng & minh bạch dữ liệu" tại web/src/app/chat-luong-du-lieu/page.tsx + _components/.

Dữ liệu (import):
- getQualityStats() từ "@/lib/queries/quality" → {rowCounts: Record<table,number>, cutoffConfidence: Record<'Cao'|'Trung bình'|'Thấp', number>, cutoffScaleUnconfirmed: number}.

YÊU CẦU (bọc dữ liệu trong <Suspense>):
1. <PageHeader title="Chất lượng & minh bạch dữ liệu" description="Độ phủ, độ tin cậy, và nhãn THẬT vs MÔ PHỎNG của từng nguồn."/>.
2. Bảng "Số dòng & nguồn gốc": từ rowCounts, mỗi bảng 1 dòng kèm nhãn THẬT/MÔ PHỎNG (hardcode đúng theo danh sách sau — đây là dữ kiện về gói dữ liệu):
   THẬT: dim_university, dim_program, fact_cutoff_score, fact_quota, fact_tuition, fact_employment, fact_labor_demand, fact_salary, fact_cutoff_forecast.
   MÔ PHỎNG: dim_student, fact_exam_score, main_dataset, fact_application_method.
   Dùng <Badge tone="success">THẬT</Badge> / <Badge tone="warning">MÔ PHỎNG</Badge>.
3. Thẻ "Độ tin cậy điểm chuẩn": biểu đồ tròn/thanh phân phối cutoffConfidence (Cao/Trung bình/Thấp) + số dòng scale chưa xác nhận (cutoffScaleUnconfirmed) với <DataQualityBadge/>.
4. Khối "Phạm vi tính KPI": liệt kê ngắn gọn K01–K07 tính trên tập nào (K01 toàn bộ 500 HS; K02 NV đủ điểm; K03 MAE MA2 các năm có actual; K04 theo nhóm nghề; K05 bình quân dòng fact_employment; K06/K07 trên NV trúng tuyển).
5. Ghi chú độ phủ: "~98,5% ô ngành×năm có điểm chuẩn chính (1273/1292)." (hardcode, là dữ kiện).
Chỉ xuất file dưới web/src/app/chat-luong-du-lieu/.`,
  },
};

async function glm(messages, maxTokens = 48000) {
  const t0 = Date.now();
  const res = await fetch("https://api.z.ai/api/coding/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      reasoning_effort: "high",
      stream: false,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`GLM HTTP ${res.status}: ${txt.slice(0, 500)}`);
  const j = JSON.parse(txt);
  const msg = j.choices?.[0]?.message ?? {};
  console.log(
    `  [GLM ${((Date.now() - t0) / 1000).toFixed(0)}s, out=${j.usage?.completion_tokens} (reason=${j.usage?.completion_tokens_details?.reasoning_tokens}), finish=${j.choices?.[0]?.finish_reason}]`,
  );
  return msg.content ?? "";
}

function parseFiles(text) {
  const out = [];
  const re = /<<<FILE path=([^\n>]+)>>>\n([\s\S]*?)\n<<<END>>>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ path: m[1].trim(), content: m[2] });
  }
  return out;
}

function writeFiles(files, allowedPrefix) {
  const written = [];
  for (const f of files) {
    const rel = f.path.replace(/\\/g, "/");
    if (!rel.startsWith(allowedPrefix)) {
      console.log(`  ⚠ BỎ QUA (ngoài phạm vi): ${rel}`);
      continue;
    }
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, "utf8");
    written.push(rel);
  }
  return written;
}

function build() {
  try {
    const out = execSync("npm run build", { cwd: WEB, encoding: "utf8", stdio: "pipe" });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + "\n" + (e.stderr || "") };
  }
}

// ---------- MAIN ----------
const taskKey = process.argv[2] || "diem-chuan";
const task = TASKS[taskKey];
if (!task) { console.error("Unknown task", taskKey); process.exit(2); }

const system =
  "Bạn là GLM-5.3, kỹ sư Next.js cấp cao, đóng góp MỘT module cho app DSS đã có sẵn. " +
  "Tuân thủ CHÍNH XÁC hợp đồng import và quy ước. Chỉ xuất file theo đúng định dạng, không giải thích.";

let userMsg =
  `${CONVENTIONS}\n\n${OUTPUT_FORMAT}\n\n` +
  `===== CÁC FILE HỢP ĐỒNG (ground truth, chỉ import không sửa) =====\n${contractBlock}\n\n` +
  `===== ${task.spec}`;

const messages = [
  { role: "system", content: system },
  { role: "user", content: userMsg },
];

let lastWritten = [];
for (let iter = 1; iter <= MAX_ITERS; iter++) {
  console.log(`\n=== GLM iteration ${iter}/${MAX_ITERS} (${taskKey}) ===`);
  const resp = await glm(messages);
  const files = parseFiles(resp);
  if (!files.length) {
    console.log("  Không parse được file nào. Đầu ra (đầu):", resp.slice(0, 400));
    messages.push({ role: "assistant", content: resp });
    messages.push({ role: "user", content: "Bạn chưa xuất đúng định dạng <<<FILE path=...>>> ... <<<END>>>. Xuất lại TẤT CẢ file theo đúng định dạng, không prose." });
    continue;
  }
  lastWritten = writeFiles(files, task.allowedPrefix);
  console.log("  Đã ghi:", lastWritten.join(", "));
  console.log("  Đang build...");
  const b = build();
  if (b.ok) {
    console.log("  ✅ BUILD PASS");
    console.log(b.out.split("\n").filter((l) => l.includes("Route") || l.includes("diem-chuan") || l.includes("✓")).slice(-6).join("\n"));
    process.exit(0);
  }
  // lọc lỗi gọn
  const errLines = b.out.split("\n").filter((l) => /error|Error|Failed|\.tsx?\(/.test(l)).slice(0, 40).join("\n");
  console.log("  ❌ BUILD FAIL:\n" + errLines.split("\n").map((l) => "    " + l).join("\n"));
  messages.push({ role: "assistant", content: resp });
  messages.push({
    role: "user",
    content:
      `Build THẤT BẠI. Lỗi:\n${errLines}\n\n` +
      `Sửa và xuất LẠI TẤT CẢ file (đầy đủ nội dung) theo đúng định dạng <<<FILE ...>>>. ` +
      `Chỉ file dưới ${task.allowedPrefix}. Nhớ: không dùng export const revalidate; dữ liệu động bọc trong <Suspense>; "use client" cho component dùng recharts/useRouter/useState.`,
  });
}
console.log(`\n⚠ Hết ${MAX_ITERS} vòng mà build chưa pass. File mới nhất đã ghi: ${lastWritten.join(", ")}. Claude sẽ xem & sửa tay.`);
process.exit(1);
