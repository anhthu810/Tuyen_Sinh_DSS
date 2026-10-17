import { adviseFromScore, type AdviseItem } from "./advise";
import { glmChat, extractJson } from "@/lib/zai";

export type AiProfile = {
  score30: number;
  personality?: string; // mô tả tính cách / sở thích / thế mạnh (chữ tự do)
  hollandCode?: string;
  budgetVndYear?: number;
};

export type AiRecommendation = {
  program_id: string;
  major_name: string;
  university: string;
  why_fit: string;
  career_outlook: string;
  admit_note: string;
  // dữ liệu thật đính kèm (để UI hiển thị con số)
  data?: {
    bucket: AdviseItem["bucket"];
    admitProb: number;
    employmentRate: number | null;
    estTotalCost: number | null;
    refCutoff30: number;
  };
};

export type AiAdviceResult = {
  overall: string;
  recommendations: AiRecommendation[];
  caution: string;
  source: "ai" | "fallback";
  note?: string;
};

const SYSTEM =
  "Bạn là chuyên gia tư vấn tuyển sinh & hướng nghiệp đại học tại Việt Nam. " +
  "Nhiệm vụ: dựa trên hồ sơ học sinh (điểm, tính cách/sở thích, ngân sách) và DANH SÁCH NGÀNH KHẢ THI cho sẵn, " +
  "chọn ra 3–5 ngành PHÙ HỢP NHẤT. Cân bằng: sự phù hợp với tính cách/sở thích, khả năng đỗ, triển vọng việc làm và chi phí. " +
  "TUYỆT ĐỐI chỉ chọn ngành có trong danh sách (dùng đúng 'id' được cung cấp), KHÔNG bịa ngành/trường. " +
  "Trả về DUY NHẤT một object JSON hợp lệ (không kèm giải thích ngoài JSON, không markdown). " +
  "Mọi văn bản bằng tiếng Việt, giọng thân thiện, cụ thể.";

function buildUserPrompt(profile: AiProfile, shortlist: AdviseItem[]): string {
  const compact = shortlist.map((s) => ({
    id: s.programId,
    nganh: s.majorName,
    truong: s.shortName ?? s.universityCode,
    nhom_nghe: s.industryGroup,
    phan_loai: s.bucket, // reach/match/safety
    p_do_pct: Math.round(s.admitProb * 100),
    viec_lam_pct: s.employmentRate != null ? Math.round(s.employmentRate) : null,
    chi_phi_khoa_vnd: s.estTotalCost,
    diem_chuan_tham_chieu_30: Number(s.refCutoff30.toFixed(2)),
  }));
  return (
    `HỒ SƠ HỌC SINH:\n` +
    `- Điểm (thang 30): ${profile.score30}\n` +
    `- Mô tả tính cách / sở thích / thế mạnh: ${profile.personality?.trim() || "(không cung cấp)"}\n` +
    (profile.hollandCode ? `- Mã Holland: ${profile.hollandCode}\n` : "") +
    `- Ngân sách/năm: ${profile.budgetVndYear ? profile.budgetVndYear.toLocaleString("vi-VN") + " VND" : "(không cung cấp)"}\n\n` +
    `DANH SÁCH NGÀNH KHẢ THI (chỉ chọn trong đây, dùng đúng "id"):\n${JSON.stringify(compact)}\n\n` +
    `Hãy chọn 3–5 ngành phù hợp nhất và trả JSON theo đúng schema:\n` +
    `{\n` +
    `  "overall_analysis": "2-4 câu nhận định về học sinh và định hướng",\n` +
    `  "recommendations": [\n` +
    `    {"program_id":"<id trong danh sách>","major_name":"<tên ngành>","university":"<trường>","why_fit":"vì sao hợp tính cách/sở thích","career_outlook":"triển vọng việc làm","admit_note":"nhận định khả năng đỗ"}\n` +
    `  ],\n` +
    `  "caution": "lưu ý/cảnh báo nếu có (có thể để rỗng)"\n` +
    `}`
  );
}

/** Tư vấn bằng AI: lọc ngành khả thi bằng engine, rồi để GLM chọn 3–5 + giải thích. Có fallback. */
export async function aiAdvise(profile: AiProfile): Promise<AiAdviceResult> {
  const all = await adviseFromScore({
    score30: profile.score30,
    hollandCode: profile.hollandCode,
    budgetVndYear: profile.budgetVndYear,
  });
  const shortlist = all.slice(0, 28);
  const byId = Object.fromEntries(shortlist.map((s) => [s.programId, s]));

  const attach = (program_id: string) => {
    const d = byId[program_id];
    return d
      ? {
          bucket: d.bucket,
          admitProb: d.admitProb,
          employmentRate: d.employmentRate,
          estTotalCost: d.estTotalCost,
          refCutoff30: d.refCutoff30,
        }
      : undefined;
  };

  // Fallback: top-5 theo thuật toán (khi AI lỗi/timeout/parse fail).
  const fallback = (): AiAdviceResult => ({
    source: "fallback",
    note: "AI tạm thời không khả dụng — đây là gợi ý theo thuật toán (khả năng đỗ + việc làm + chi phí).",
    overall: `Với mức điểm ${profile.score30}/30, đây là các ngành khả thi nhất theo dữ liệu điểm chuẩn, việc làm và chi phí.`,
    caution: "Gợi ý mang tính tham khảo; hãy cân nhắc thêm sở thích cá nhân.",
    recommendations: shortlist.slice(0, 5).map((s) => ({
      program_id: s.programId,
      major_name: s.majorName ?? s.programId,
      university: s.shortName ?? s.universityCode,
      why_fit: "Phù hợp với mức điểm và có cân bằng cơ hội đỗ / việc làm / chi phí.",
      career_outlook: s.employmentRate != null ? `Tỷ lệ việc làm ~${Math.round(s.employmentRate)}%.` : "Chưa đủ dữ liệu việc làm.",
      admit_note: `Khả năng đỗ ~${Math.round(s.admitProb * 100)}% (${s.bucket}).`,
      data: attach(s.programId),
    })),
  });

  if (!shortlist.length) {
    return { source: "fallback", overall: "", caution: "", recommendations: [], note: "Không có ngành phù hợp dữ liệu với mức điểm/bộ lọc này." };
  }

  try {
    const { content } = await glmChat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserPrompt(profile, shortlist) },
      ],
      { maxTokens: 3500, reasoningEffort: "high", temperature: 0.4 },
    );
    const parsed = extractJson<{
      overall_analysis?: string;
      recommendations?: Omit<AiRecommendation, "data">[];
      caution?: string;
    }>(content);

    const recs = (parsed?.recommendations ?? [])
      .filter((r) => r && byId[r.program_id]) // chỉ giữ ngành có thật trong danh sách
      .slice(0, 5)
      .map((r) => ({ ...r, data: attach(r.program_id) }));

    if (!recs.length) return fallback();

    return {
      source: "ai",
      overall: parsed?.overall_analysis ?? "",
      caution: parsed?.caution ?? "",
      recommendations: recs,
    };
  } catch {
    return fallback();
  }
}
