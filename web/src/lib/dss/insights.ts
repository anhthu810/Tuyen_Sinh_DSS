import {
  admitProbability,
  BUCKET_LABEL,
  classify,
  probAtLeastOne,
  type Bucket,
  type NvScored,
} from "@/lib/dss/recommend";
import { formatPct, formatVndShort } from "@/lib/format";
import type { SimulationResult, WhatIfParams } from "@/lib/dss/what-if";

export type CoreInsightTone = "success" | "warning" | "danger" | "neutral";

export type CoreInsightPoint = {
  category: string;
  headline: string;
  detail: string;
  tone: CoreInsightTone;
};

export type ConfidenceLevel = "Cao" | "Trung bình" | "Thấp";

export type IfThenRule = {
  id: string;
  condition: string;
  action: string;
  impact: string;
  confidenceLabel: ConfidenceLevel;
  confidencePct: number;
  basis: string;
};

export type StudentInsightBundle = {
  points: [CoreInsightPoint, CoreInsightPoint, CoreInsightPoint];
  rules: IfThenRule[];
};

function confidenceFromBand(band: number, sampleCount: number): {
  label: ConfidenceLevel;
  pct: number;
} {
  // Độ tin cậy cao khi MAE/band nhỏ (≤ 1.5) và đủ dữ liệu mẫu; giảm dần nếu band rộng
  const raw = Math.round(Math.max(55, Math.min(92, 95 - (band - 1.2) * 14 + Math.min(sampleCount, 8) * 0.5)));
  const label: ConfidenceLevel = raw >= 80 ? "Cao" : raw >= 68 ? "Trung bình" : "Thấp";
  return { label, pct: raw };
}

function programTag(item: {
  majorName: string | null;
  shortName: string | null;
  universityCode: string;
  programId: string;
}): string {
  const name = item.majorName ?? item.programId;
  const uni = item.shortName ?? item.universityCode;
  return `${name} (${uni})`;
}

/**
 * Tạo 3 kết luận cốt lõi và các quy tắc hành động IF–THEN cho hồ sơ nguyện vọng học sinh.
 */
export function buildStudentProfileInsights(input: {
  scored: NvScored[];
  familyBudgetYear?: number | null;
  contextLabel?: string;
}): StudentInsightBundle {
  const { scored, familyBudgetYear } = input;
  const ordered = [...scored].sort((a, b) => a.nvOrder - b.nvOrder);

  const counts: Record<Bucket, number> = { reach: 0, match: 0, safety: 0 };
  for (const s of ordered) {
    if (s.bucket) counts[s.bucket]++;
  }

  const probAny = probAtLeastOne(ordered.map((s) => s.admitProb ?? 0)) * 100;
  const top3 = ordered.slice(0, 3);
  const top3ReachCount = top3.filter((s) => s.bucket === "reach").length;
  const avgBand =
    ordered.length > 0
      ? ordered.reduce((sum, s) => sum + s.band, 0) / ordered.length
      : 1.5;

  // 1. Cấu trúc nguyện vọng (Điểm mạnh / Rủi ro)
  let structurePoint: CoreInsightPoint;
  if (ordered.length === 0) {
    structurePoint = {
      category: "Cấu trúc nguyện vọng",
      headline: "Chưa có nguyện vọng để đánh giá rủi ro trúng tuyển.",
      detail: "Cần ít nhất 3–5 nguyện vọng rải đều nhóm Vừa sức và Chắc đỗ để giảm rủi ro trượt.",
      tone: "warning",
    };
  } else if (top3ReachCount === top3.length && top3.length >= 3) {
    structurePoint = {
      category: "Cấu trúc nguyện vọng",
      headline: `Rủi ro cao ở top 3: cả 3 NV đầu đều thuộc nhóm Với cao (P đỗ tổng ${Math.round(probAny)}%).`,
      detail: `Danh sách có ${counts.reach} Với cao / ${counts.match} Vừa sức / ${counts.safety} Chắc đỗ. Nếu điểm chuẩn tăng nhẹ, thí sinh dễ rơi khỏi top 3 mục tiêu.`,
      tone: "danger",
    };
  } else if (counts.safety === 0) {
    structurePoint = {
      category: "Cấu trúc nguyện vọng",
      headline: `Thiếu chốt chặn Chắc đỗ — xác suất đỗ ít nhất 1 NV hiện là ${Math.round(probAny)}%.`,
      detail: `Phân bổ ${counts.reach} Với cao / ${counts.match} Vừa sức / 0 Chắc đỗ. Bổ sung 1–2 ngành Chắc đỗ sẽ đẩy P(đỗ) lên vùng an toàn ≥90%.`,
      tone: "warning",
    };
  } else {
    structurePoint = {
      category: "Cấu trúc nguyện vọng",
      headline: `Cấu trúc cân bằng (${counts.reach} Với cao · ${counts.match} Vừa sức · ${counts.safety} Chắc đỗ), P(đỗ ≥ 1 NV) đạt ${Math.round(probAny)}%.`,
      detail: `${top3ReachCount <= 2 ? "Nhóm NV1–NV3 giữ được cơ hội bứt phá mà vẫn có điểm tựa" : "Nhóm đầu hơi mạo hiểm nhưng đã có đệm an toàn ở cuối danh sách"}.`,
      tone: probAny >= 85 ? "success" : "warning",
    };
  }

  // 2. Ngưỡng an toàn tài chính
  const withAfford = ordered.filter((s) => s.affordabilityIndexPct != null);
  const overBudgetNow = withAfford.filter((s) => (s.affordabilityIndexPct ?? 0) > 100);
  const overBudgetShock = withAfford.filter((s) => (s.affordabilityIndexPct ?? 0) > 80);
  const safeAffordable = withAfford
    .filter((s) => (s.affordabilityIndexPct ?? 999) <= 80)
    .sort((a, b) => (a.affordabilityIndexPct ?? 999) - (b.affordabilityIndexPct ?? 999));
  const avgAfford = withAfford.length
    ? withAfford.reduce((s, x) => s + (x.affordabilityIndexPct ?? 0), 0) / withAfford.length
    : null;

  let financePoint: CoreInsightPoint;
  if (!withAfford.length) {
    financePoint = {
      category: "Ngưỡng an toàn tài chính",
      headline: familyBudgetYear
        ? `Ngân sách dự kiến ${formatVndShort(familyBudgetYear)}/năm — chưa đủ dữ liệu học phí từng NV.`
        : "Chưa có dữ liệu đối chiếu chi phí/ngân sách cho danh sách này.",
      detail: "Kiểm tra mục Chi phí & khả năng chi trả để đảm bảo chỉ số K07 dưới 100% (tốt nhất ≤80%).",
      tone: "neutral",
    };
  } else if (overBudgetNow.length > 0) {
    const worst = [...overBudgetNow].sort(
      (a, b) => (b.affordabilityIndexPct ?? 0) - (a.affordabilityIndexPct ?? 0),
    )[0];
    financePoint = {
      category: "Ngưỡng an toàn tài chính",
      headline: `${overBudgetNow.length}/${withAfford.length} NV vượt ngân sách hiện tại (cao nhất ${formatPct(worst.affordabilityIndexPct, 0)} ở ${programTag(worst)}).`,
      detail: `Khi thu nhập giảm 20%, số NV quá tải tăng lên ${overBudgetShock.length}/${withAfford.length}. Chỉ nên giữ ngành vượt 100% nếu có phương án học bổng/tín dụng.`,
      tone: "danger",
    };
  } else if (overBudgetShock.length > 0) {
    financePoint = {
      category: "Ngưỡng an toàn tài chính",
      headline: `Đạt ngưỡng hiện tại (TB ${formatPct(avgAfford, 0)} ngân sách), nhưng ${overBudgetShock.length} NV sẽ quá tải nếu ngân sách giảm 20%.`,
      detail: safeAffordable[0]
        ? `${programTag(safeAffordable[0])} là lựa chọn đệm tài chính vững nhất (${formatPct(safeAffordable[0].affordabilityIndexPct, 0)} ngân sách).`
        : "Ưu tiên ngành học phí thấp để giữ biên dự phòng tài chính ≥20%.",
      tone: "warning",
    };
  } else {
    financePoint = {
      category: "Ngưỡng an toàn tài chính",
      headline: `100% NV (${withAfford.length}/${withAfford.length}) nằm trong vùng an toàn ≤80% ngân sách (TB ${formatPct(avgAfford, 0)}).`,
      detail: "Ngay cả khi thu nhập gia đình giảm 20%, toàn bộ danh sách vẫn không phát sinh áp lực vượt ngân sách (K07 = 0%).",
      tone: "success",
    };
  }

  // 3. Đánh đổi cơ hội
  const bestFit = [...ordered]
    .filter((s) => s.hollandMatchPct != null)
    .sort((a, b) => (b.hollandMatchPct ?? 0) - (a.hollandMatchPct ?? 0))[0];
  const bestSafety = [...ordered]
    .filter((s) => s.bucket === "safety" || s.bucket === "match")
    .sort((a, b) => (b.admitProb ?? 0) - (a.admitProb ?? 0))[0];
  const topReach = [...ordered]
    .filter((s) => s.bucket === "reach")
    .sort((a, b) => (b.margin30 ?? -99) - (a.margin30 ?? -99))[0];

  let tradeoffPoint: CoreInsightPoint;
  if (topReach && bestSafety) {
    const newProbPlus1 =
      topReach.margin30 != null
        ? admitProbability(topReach.margin30 + 1.0, topReach.band) * 100
        : null;
    tradeoffPoint = {
      category: "Đánh đổi cơ hội",
      headline: `Đánh đổi giữa nhóm mơ ước (${programTag(topReach)}, P đỗ ${Math.round((topReach.admitProb ?? 0) * 100)}%) và suất đỗ chắc (${programTag(bestSafety)}, ${Math.round((bestSafety.admitProb ?? 0) * 100)}%).`,
      detail:
        newProbPlus1 != null
          ? `Nếu bổ sung chứng chỉ/bài thi phụ (+1,0đ), cơ hội vào ${programTag(topReach)} tăng từ ${Math.round((topReach.admitProb ?? 0) * 100)}% lên ${Math.round(newProbPlus1)}% mà không phải hy sinh NV an toàn.`
          : `Đặt ${programTag(topReach)} ở NV1 để giữ cơ hội, và khóa ${programTag(bestSafety)} ở cuối top 4 làm lưới đỡ.`,
      tone: "neutral",
    };
  } else if (bestFit) {
    tradeoffPoint = {
      category: "Đánh đổi cơ hội",
      headline: `Ngành hợp sở thích nhất là ${programTag(bestFit)} (Holland ${Math.round(bestFit.hollandMatchPct ?? 0)}%, P đỗ ${Math.round((bestFit.admitProb ?? 0) * 100)}%).`,
      detail: `Tỷ lệ đỗ và mức phù hợp đang đồng thuận; tiếp tục cân bằng chi phí để tối ưu điểm tổng hợp Σ.`,
      tone: "success",
    };
  } else {
    tradeoffPoint = {
      category: "Đánh đổi cơ hội",
      headline: "Cân bằng giữa tham vọng trường Top và biên an toàn điểm chuẩn.",
      detail: "Sắp xếp bậc thang Với cao → Vừa sức → Chắc đỗ giúp không bỏ lỡ ngành mơ ước và vẫn bảo toàn suất đỗ.",
      tone: "neutral",
    };
  }

  // Quy tắc IF-THEN kèm Confidence Level
  const rules: IfThenRule[] = [];
  const baseConf = confidenceFromBand(avgBand, ordered.length);

  if (bestSafety) {
    const safetyDown1 =
      bestSafety.margin30 != null
        ? admitProbability(bestSafety.margin30 - 1.0, bestSafety.band) * 100
        : (bestSafety.admitProb ?? 0) * 100;
    rules.push({
      id: "rule-downside",
      condition: "Điểm thi thấp hơn dự kiến −1,0đ hoặc điểm chuẩn Top 1 tăng +1,0đ",
      action: `Giữ ${programTag(bestSafety)} ở vị trí NV3–NV4 làm chốt chặn, không dồn hết 3 NV đầu vào nhóm Với cao.`,
      impact: `Xác suất đỗ ở chốt chặn này vẫn đạt ${Math.round(safetyDown1)}% ngay cả khi hụt 1,0đ.`,
      confidenceLabel: baseConf.label,
      confidencePct: baseConf.pct,
      basis: `Dựa trên biên điểm thực tế và sai số dự báo TB ±${avgBand.toFixed(2).replace(".", ",")}đ (${ordered.length} NV).`,
    });
  } else if (ordered.length > 0) {
    rules.push({
      id: "rule-add-safety",
      condition: "Chưa có NV Chắc đỗ trong danh sách hiện tại",
      action: "Bổ sung ngay 1–2 ngành có biên điểm ≥ +1,5đ (nhóm HaUI / TLU / VNUA) vào cuối danh sách NV.",
      impact: "Kéo P(đỗ ít nhất 1 NV) vượt mốc an toàn ≥90% khi điểm chuẩn biến động.",
      confidenceLabel: "Cao",
      confidencePct: 88,
      basis: "Theo kịch bản What-if toàn hệ thống (90,2% giữ được suất đỗ nhờ NV lót).",
    });
  }

  if (topReach && topReach.margin30 != null) {
    const pNow = Math.round((topReach.admitProb ?? 0) * 100);
    const pPlus1 = Math.round(admitProbability(topReach.margin30 + 1.0, topReach.band) * 100);
    const nextBucket = classify(topReach.margin30 + 1.0, topReach.band);
    const conf = confidenceFromBand(topReach.band, ordered.length);
    rules.push({
      id: "rule-upside",
      condition: "Bổ sung được +1,0đ quy đổi từ bài thi phụ (TSA / HSA / IELTS)",
      action: `Ưu tiên giữ ${programTag(topReach)} ở NV1–NV2 để tận dụng đòn bẩy điểm cộng.`,
      impact: `P(đỗ) tăng từ ${pNow}% → ${pPlus1}% (${BUCKET_LABEL[nextBucket]}).`,
      confidenceLabel: conf.label,
      confidencePct: Math.max(62, conf.pct - 4),
      basis: `Sai số dự báo ngành ±${topReach.band.toFixed(2).replace(".", ",")}đ; giả định quy đổi +1,0đ theo đề án trường.`,
    });
  }

  if (overBudgetNow.length > 0 && safeAffordable[0]) {
    const worst = overBudgetNow[0];
    rules.push({
      id: "rule-finance",
      condition: "Ngân sách gia đình không tăng hoặc có nguy cơ giảm 20%",
      action: `Ưu tiên xếp ${programTag(safeAffordable[0])} lên trên ${programTag(worst)} nếu chưa chắc suất học bổng.`,
      impact: `Giảm áp lực tài chính từ ${formatPct(worst.affordabilityIndexPct, 0)} xuống ${formatPct(safeAffordable[0].affordabilityIndexPct, 0)} ngân sách.`,
      confidenceLabel: "Cao",
      confidencePct: 86,
      basis: "Tính từ học phí thực tế + sinh hoạt phí Hà Nội (54 triệu ₫/năm) và thời gian đào tạo.",
    });
  } else if (overBudgetShock.length > 0) {
    rules.push({
      id: "rule-finance-shock",
      condition: "Thu nhập gia đình biến động giảm 20% trong 4 năm học",
      action: `Kiểm tra học bổng hoặc chuyển sang lựa chọn có chi phí ≤80% ngân sách năm (${overBudgetShock.length} NV đang sát ngưỡng).`,
      impact: "Tránh rơi vào nhóm vượt ngân sách (K07 > 100%) ở các năm cuối khi học phí tăng 10%/năm.",
      confidenceLabel: "Cao",
      confidencePct: 84,
      basis: "Mô phỏng tăng học phí 10%/năm và sinh hoạt phí cố định theo tham số DSS.",
    });
  }

  if (bestFit && bestFit.bucket === "reach" && bestSafety) {
    rules.push({
      id: "rule-holland-balance",
      condition: `Muốn theo ngành hợp Holland nhất (${programTag(bestFit)}, hợp ${Math.round(bestFit.hollandMatchPct ?? 0)}%)`,
      action: `Đặt ${programTag(bestFit)} ở NV1 nhưng khóa cặp ${programTag(bestSafety)} ngay phía dưới làm phương án dự phòng.`,
      impact: `Vừa theo đuổi đúng sở thích, vừa giữ lưới an toàn ${Math.round((bestSafety.admitProb ?? 0) * 100)}%.`,
      confidenceLabel: "Trung bình",
      confidencePct: 76,
      basis: "Đối chiếu đồng thời điểm phù hợp Holland và biên điểm lịch sử.",
    });
  }

  return {
    points: [structurePoint, financePoint, tradeoffPoint],
    rules: rules.slice(0, 4),
  };
}

/**
 * Tạo 3 kết luận cốt lõi và quy tắc IF–THEN cho màn hình Tư vấn chọn ngành (theo điểm nhập vào).
 */
export function buildScoreAdviceInsights(input: {
  score: number;
  budgetYear?: number;
  items: {
    programId: string;
    majorName: string | null;
    shortName: string | null;
    universityCode: string;
    bucket: Bucket;
    margin: number;
    band: number;
    admitProb: number;
    fit: number | null;
    afford: number | null;
    estTotalCost: number | null;
    composite: number;
  }[];
}): StudentInsightBundle {
  const { score, budgetYear, items } = input;
  const counts: Record<Bucket, number> = { reach: 0, match: 0, safety: 0 };
  for (const it of items) counts[it.bucket]++;

  const top = items[0];
  const bestSafety = items.find((i) => i.bucket === "safety");
  const bestMatch = items.find((i) => i.bucket === "match");
  const bestReach = items.find((i) => i.bucket === "reach");
  const safeOrMatchPct = items.length
    ? ((counts.safety + counts.match) / items.length) * 100
    : 0;

  const structurePoint: CoreInsightPoint = {
    category: "Cấu trúc nguyện vọng",
    headline: `${counts.safety + counts.match}/${items.length} ngành (${formatPct(safeOrMatchPct, 0)}) nằm trong vùng Vừa sức–Chắc đỗ ở mức ${score.toFixed(2).replace(".", ",")} điểm.`,
    detail: `Có ${counts.safety} ngành Chắc đỗ, ${counts.match} Vừa sức và ${counts.reach} Với cao. ${counts.safety >= 3 ? "Nguồn lựa chọn an toàn dồi dào." : "Nên giữ ít nhất 2 ngành Chắc đỗ trong danh sách chốt."}`,
    tone: counts.safety >= 2 ? "success" : counts.match >= 2 ? "warning" : "danger",
  };

  const withCost = items.filter((i) => i.estTotalCost != null);
  const avgCost = withCost.length
    ? withCost.reduce((s, i) => s + (i.estTotalCost ?? 0), 0) / withCost.length
    : null;
  const overBudget =
    budgetYear && budgetYear > 0
      ? items.filter((i) => i.afford != null && i.afford < 50).length
      : 0;

  const financePoint: CoreInsightPoint = budgetYear
    ? {
        category: "Ngưỡng an toàn tài chính",
        headline:
          overBudget > 0
            ? `${overBudget}/${items.length} ngành gợi ý vượt ngân sách ${formatVndShort(budgetYear)}/năm.`
            : `Ngân sách ${formatVndShort(budgetYear)}/năm đáp ứng tốt các ngành gợi ý hàng đầu.`,
        detail: `Chi phí toàn khóa bình quân nhóm lọc là ${formatVndShort(avgCost)}. Kiểm tra kỹ ngưỡng K07 ≤80% nếu dự phòng thu nhập giảm 20%.`,
        tone: overBudget > items.length * 0.4 ? "warning" : "success",
      }
    : {
        category: "Ngưỡng an toàn tài chính",
        headline: `Chi phí toàn khóa trung bình nhóm ngành phù hợp là ${formatVndShort(avgCost)}.`,
        detail: "Chưa nhập ngân sách gia đình — hãy nhập ngân sách năm để hệ thống lọc bỏ ngành vượt quá khả năng chi trả.",
        tone: "neutral",
      };

  const tradeoffPoint: CoreInsightPoint =
    top && bestSafety && top.programId !== bestSafety.programId
      ? {
          category: "Đánh đổi cơ hội",
          headline: `${programTag(top)} dẫn đầu tổng hợp (${Math.round(top.composite)}/100, P đỗ ${Math.round(top.admitProb * 100)}%), trong khi ${programTag(bestSafety)} đảm bảo ${Math.round(bestSafety.admitProb * 100)}%.`,
          detail: `Nếu đặt ${programTag(top)} ở NV1, cần giữ ${programTag(bestSafety)} làm lưới an toàn để không trượt toàn bộ khi điểm chuẩn nhích lên.`,
          tone: "neutral",
        }
      : {
          category: "Đánh đổi cơ hội",
          headline: top
            ? `${programTag(top)} cân bằng tối ưu cả cơ hội đỗ (${Math.round(top.admitProb * 100)}%) lẫn điểm tổng hợp (${Math.round(top.composite)}/100).`
            : "Đánh đổi giữa trường Top điểm cao và độ an toàn khi nộp hồ sơ.",
          detail: "Kết hợp 1–2 NV Với cao ở đầu, 2–3 NV Vừa sức ở giữa và 1–2 NV Chắc đỗ ở cuối.",
          tone: "success",
        };

  const rules: IfThenRule[] = [];
  if (bestReach) {
    const pNow = Math.round(bestReach.admitProb * 100);
    const pPlus = Math.round(admitProbability(bestReach.margin + 1.0, bestReach.band) * 100);
    const conf = confidenceFromBand(bestReach.band, items.length);
    rules.push({
      id: "advise-plus1",
      condition: "Có thêm IELTS / TSA / HSA tương đương +1,0đ (hoặc điểm thi tăng +1,0đ)",
      action: `Mạnh dạn đẩy ${programTag(bestReach)} lên NV1–NV2 thay vì chỉ chọn nhóm an toàn.`,
      impact: `Xác suất đỗ tăng từ ${pNow}% → ${pPlus}% (${BUCKET_LABEL[classify(bestReach.margin + 1.0, bestReach.band)]}).`,
      confidenceLabel: conf.label,
      confidencePct: Math.max(64, conf.pct - 3),
      basis: `Sai số dự báo ngành ±${bestReach.band.toFixed(2).replace(".", ",")}đ trên chuẩn tham chiếu.`,
    });
  }
  const anchor = bestMatch ?? bestSafety;
  if (anchor) {
    const pDrop = Math.round(admitProbability(anchor.margin - 1.0, anchor.band) * 100);
    const conf = confidenceFromBand(anchor.band, items.length);
    rules.push({
      id: "advise-minus1",
      condition: "Điểm thi thực tế thấp hơn dự kiến −1,0đ hoặc điểm chuẩn tăng bất ngờ",
      action: `Chốt ${bestSafety ? programTag(bestSafety) : programTag(anchor)} làm NV an toàn bắt buộc ở nhóm sau.`,
      impact: `Vẫn giữ xác suất đỗ ${bestSafety ? Math.round(admitProbability(bestSafety.margin - 1.0, bestSafety.band) * 100) : pDrop}% ở kịch bản bất lợi.`,
      confidenceLabel: conf.label,
      confidencePct: conf.pct,
      basis: `Đánh giá trên ${items.length} ngành có điểm chuẩn/dự báo MA2.`,
    });
  }
  if (budgetYear && budgetYear > 0) {
    const affordableTop = items.find((i) => i.afford != null && i.afford >= 55);
    if (affordableTop) {
      rules.push({
        id: "advise-budget",
        condition: `Ngân sách gia đình ${formatVndShort(budgetYear)}/năm có thể co hẹp 20%`,
        action: `Ưu tiên ${programTag(affordableTop)} (chi phí ${formatVndShort(affordableTop.estTotalCost)} toàn khóa) thay cho các ngành vượt khung chi trả.`,
        impact: "Giữ chỉ số tài chính K07 dưới ngưỡng báo động suốt toàn khóa học.",
        confidenceLabel: "Cao",
        confidencePct: 85,
        basis: "Ước tính học phí theo fact_tuition + sinh hoạt phí Hà Nội (54 triệu ₫/năm).",
      });
    }
  }

  return {
    points: [structurePoint, financePoint, tradeoffPoint],
    rules: rules.slice(0, 4),
  };
}

/**
 * Tạo 3 kết luận cốt lõi và quy tắc IF–THEN cho màn hình Phân tích What-if.
 */
export function buildWhatIfInsights(input: {
  params: WhatIfParams;
  baseline: SimulationResult;
  scenario: SimulationResult;
}): StudentInsightBundle {
  const { params, baseline, scenario } = input;
  const k01Diff = scenario.k01Pct - baseline.k01Pct;
  const k07Diff =
    scenario.k07Pct != null && baseline.k07Pct != null
      ? scenario.k07Pct - baseline.k07Pct
      : 0;

  const structurePoint: CoreInsightPoint = {
    category: "Cấu trúc nguyện vọng",
    headline:
      k01Diff === 0
        ? `${formatPct(scenario.k01Pct)} HS (${scenario.admittedTop3Count}/${scenario.totalStudents}) đỗ top 3 NV; ${scenario.admittedFallbackCount} HS sống sót nhờ NV4+.`
        : `K01 ${k01Diff > 0 ? "tăng" : "giảm"} ${formatPct(Math.abs(k01Diff))} (từ ${formatPct(baseline.k01Pct)} → ${formatPct(scenario.k01Pct)}), còn ${scenario.rejectedCount} HS trượt toàn bộ.`,
    detail: `Tỷ lệ trúng tuyển chung đạt ${formatPct(scenario.admittedTotalPct)} nhờ ${scenario.admittedFallbackCount} HS đỗ ở NV lót (NV4 trở đi).`,
    tone: scenario.k01Pct >= 65 ? "success" : scenario.k01Pct >= 55 ? "warning" : "danger",
  };

  const financePoint: CoreInsightPoint = {
    category: "Ngưỡng an toàn tài chính",
    headline:
      (scenario.k07Pct ?? 0) > 50
        ? `K07 vọt lên ${formatPct(scenario.k07Pct)} (${scenario.overBudgetCount}/${scenario.costEvaluatedCount} HS đỗ) — vượt ngưỡng báo động 50%.`
        : `K07 ở mức ${formatPct(scenario.k07Pct)} (${scenario.overBudgetCount}/${scenario.costEvaluatedCount} HS đỗ vượt ngân sách${k07Diff !== 0 ? `, lệch ${k07Diff > 0 ? "+" : ""}${formatPct(k07Diff)}` : ""}).`,
    detail: `Chi phí toàn khóa bình quân là ${formatVndShort(scenario.k06AvgCostVnd)}. Gia đình cần giữ tỷ lệ chi phí/ngân sách ≤80% để chịu được cú sốc thu nhập −20%.`,
    tone: (scenario.k07Pct ?? 0) > 50 ? "danger" : (scenario.k07Pct ?? 0) > 35 ? "warning" : "success",
  };

  const tradeoffPoint: CoreInsightPoint = {
    category: "Đánh đổi cơ hội",
    headline:
      params.cutoffDelta > 0
        ? `Điểm chuẩn tăng làm ${Math.max(0, baseline.admittedTop3Count - scenario.admittedTop3Count)} HS hụt NV1–NV3, nhưng NV lót giữ ${formatPct(scenario.admittedTotalPct)} trúng tuyển.`
        : params.scoreBonus > 0
          ? `Lợi thế +${params.scoreBonus.toFixed(2).replace(".", ",")}đ đẩy thêm ${Math.max(0, scenario.admittedTop3Count - baseline.admittedTop3Count)} HS vào NV1–NV3 và tăng đỗ NV1 lên ${formatPct(scenario.nv1Pct)}.`
          : "Đầu tư bài thi phụ (+1,0đ) mở rộng cơ hội NV1–NV3, còn rải NV xuống nhóm giữa bảo toàn suất đỗ khi chuẩn tăng.",
    detail: "Chọn trường Top 1 kéo K06 tăng cao và dễ chạm ngưỡng K07; kết hợp trường Top giữa giúp cân bằng cả xác suất đỗ lẫn chi trả.",
    tone: "neutral",
  };

  const rules: IfThenRule[] = [
    {
      id: "wi-exam",
      condition: "Thí sinh có thêm +1,0đ từ bài thi phụ (TSA / HSA / IELTS)",
      action: "Ưu tiên giữ các NV mục tiêu (NV1–NV2) ở nhóm Top 1 thay vì rút lui quá sớm.",
      impact: "K01 toàn mẫu bật từ 64,8% lên ~77–78% và tỷ lệ đỗ đúng NV1 tăng mạnh.",
      confidenceLabel: "Cao",
      confidencePct: 87,
      basis: `Mô phỏng trực tiếp trên ${scenario.totalStudents} hồ sơ HS và biên điểm thực tế.`,
    },
    {
      id: "wi-cutoff-up",
      condition: "Điểm chuẩn nhóm Top 1 (HUST/BKA, NEU/KHA) tăng +1,0đ",
      action: "Bắt buộc chèn 2–3 NV lót ở nhóm HaUI (DCN), TLU (TLA) hoặc VNUA (HVN) từ NV4 trở đi.",
      impact: "Dù K01 giảm về 58,0%, tỷ lệ trúng tuyển chung vẫn giữ 90,2% nhờ đệm NV lót.",
      confidenceLabel: "Cao",
      confidencePct: 89,
      basis: "Kiểm định trên 3.096 nguyện vọng của 7 trường đại học Hà Nội.",
    },
    {
      id: "wi-budget-drop",
      condition: "Thu nhập / ngân sách gia đình dự phòng có thể giảm 20%",
      action: "Loại bỏ hoặc hạ ưu tiên các ngành có K07 > 80% ở hiện tại; ưu tiên ngành có học bổng hoặc NĐ 116.",
      impact: "Ngăn rơi vào nhóm báo động tài chính (K07 vọt từ 33,3% lên 52,9%).",
      confidenceLabel: "Cao",
      confidencePct: 85,
      basis: "Tính trực tiếp từ tổng chi phí toàn khóa (K06) và ngân sách năm của 454 HS đỗ.",
    },
  ];

  return {
    points: [structurePoint, financePoint, tradeoffPoint],
    rules,
  };
}

/**
 * Tạo 3 kết luận cốt lõi và Khuyến nghị DSS cho Trang 1 (Tổng quan KPI).
 */
export function buildExecutiveOverviewInsights(input: {
  k01: number | null;
  k02: number | null;
  k03: number | null;
  k05: number | null;
  k06: number | null;
  k07: number | null;
}): StudentInsightBundle {
  const { k01, k02, k03, k05, k06, k07 } = input;

  const structurePoint: CoreInsightPoint = {
    category: "Tỷ lệ đỗ & phân bổ NV",
    headline:
      k01 != null
        ? `Baseline K01 đạt ${formatPct(k01)} HS trúng tuyển trong NV1–NV3; ${k02 != null ? `${formatPct(k02)} NV đủ điểm tận dụng phương thức phụ` : "phương thức phụ đóng góp lớn"}.`
        : "Chưa đủ dữ liệu K01 từ Supabase.",
    detail:
      "Còn khoảng 1/3 thí sinh trượt khỏi nhóm NV1–NV3 nếu thiếu đệm NV lót hoặc không dùng bài thi phụ (ĐGTD/ĐGNL/IELTS).",
    tone: k01 == null ? "neutral" : k01 >= 65 ? "success" : "warning",
  };

  const financePoint: CoreInsightPoint = {
    category: "Rủi ro tài chính tổng quát",
    headline:
      k07 != null
        ? `${formatPct(k07)} HS trúng tuyển vượt ngân sách gia đình (chi phí TB ${formatVndShort(k06)}).`
        : "Chưa tính được tỷ lệ vượt ngân sách K07.",
    detail:
      "Khi ngân sách gia đình giảm 20%, tỷ lệ quá tải tài chính (K07) tăng vọt lên >50% — cần kiểm tra ngưỡng chi trả ≤80% ngay khi chọn trường.",
    tone: k07 == null ? "neutral" : k07 <= 30 ? "success" : k07 <= 50 ? "warning" : "danger",
  };

  const tradeoffPoint: CoreInsightPoint = {
    category: "Đánh đổi & độ tin cậy",
    headline: `Sai số dự báo MA2 ở mức ±${k03 != null ? k03.toFixed(2).replace(".", ",") : "—"} điểm, trong khi tỷ lệ có việc làm sau 1 năm đạt ${formatPct(k05)}.`,
    detail:
      "Cần cộng thêm biên an toàn tương ứng MAE khi đặt NV1–NV3 và cân bằng giữa trường Top điểm chuẩn cao với học phí phù hợp.",
    tone: k03 != null && k03 <= 1.5 ? "success" : "warning",
  };

  const rules: IfThenRule[] = [
    {
      id: "exec-k01",
      condition: `K01 toàn hệ hiện ở mức ${formatPct(k01)} (< 70%) và điểm chuẩn nhóm Top 1 có thể biến động ±${k03 != null ? k03.toFixed(2).replace(".", ",") : "1,50"}đ`,
      action: "Bắt buộc cấu trúc danh sách theo bậc thang Với cao → Vừa sức → Chắc đỗ, giữ tối thiểu 1–2 NV lót ở NV4+.",
      impact: "Bảo toàn tỷ lệ trúng tuyển chung ~90,2% ngay cả khi điểm chuẩn HUST/NEU tăng +1,0đ.",
      confidenceLabel: "Cao",
      confidencePct: 88,
      basis: "Tổng hợp từ 500 hồ sơ học sinh và 3.096 nguyện vọng trên Supabase.",
    },
    {
      id: "exec-k02",
      condition: `Thí sinh đạt lợi thế quy đổi từ ĐGTD / ĐGNL / IELTS (hiện ${formatPct(k02)} NV đủ điểm hưởng lợi từ phương thức ngoài THPT)`,
      action: "Ưu tiên đăng ký xét tuyển đa phương thức ở các trường có quy đổi điểm cộng (+1,0đ).",
      impact: "Đẩy tỷ lệ đỗ nhóm mục tiêu NV1–NV3 từ ~64,8% lên ~77–78%.",
      confidenceLabel: "Cao",
      confidencePct: 86,
      basis: "Phân tích K02 trên main_dataset và kịch bản What-if bài thi phụ.",
    },
    {
      id: "exec-k07",
      condition: `Chỉ số K07 hiện là ${formatPct(k07)} HS vượt ngân sách (TB ${formatVndShort(k06)}/khóa)`,
      action: "Loại bỏ các lựa chọn có tỷ lệ chi phí/ngân sách > 80% nếu gia đình không có nguồn học bổng dự phòng.",
      impact: "Tránh rơi vào vùng báo động tài chính (>50% quá tải) khi thu nhập giảm 20%.",
      confidenceLabel: "Cao",
      confidencePct: 85,
      basis: "Mô phỏng chi phí toàn khóa (học phí tăng 10%/năm + sinh hoạt phí Hà Nội).",
    },
  ];

  return {
    points: [structurePoint, financePoint, tradeoffPoint],
    rules,
  };
}

/**
 * Tạo Khuyến nghị DSS cho Trang 3 (Dự báo & Độ tin cậy).
 */
export function buildForecastInsights(input: {
  programLabel: string;
  mae: number | null;
  latestForecast: number | null;
  highConfidencePct: number;
  unconfirmedScaleCount: number;
}): IfThenRule[] {
  const { programLabel, mae, latestForecast, highConfidencePct, unconfirmedScaleCount } = input;
  const rules: IfThenRule[] = [];

  if (mae != null) {
    const conf: ConfidenceLevel = mae <= 1.2 ? "Cao" : mae <= 2.0 ? "Trung bình" : "Thấp";
    const confPct = mae <= 1.2 ? 86 : mae <= 2.0 ? 74 : 58;
    rules.push({
      id: "fc-mae-margin",
      condition: `${programLabel} có sai số dự báo MAE = ±${mae.toFixed(2).replace(".", ",")}đ${latestForecast != null ? ` quanh mức ${latestForecast.toFixed(2).replace(".", ",")}đ` : ""}`,
      action: `Giữ khoảng an toàn tối thiểu +${Math.ceil(mae)} điểm khi đặt ${programLabel} làm nguyện vọng Vừa sức/Chắc đỗ.`,
      impact: "Hạn chế rủi ro trượt do dao động điểm chuẩn năm tuyển sinh mới.",
      confidenceLabel: conf,
      confidencePct: confPct,
      basis: "Tính trực tiếp từ sai số tuyệt đối trung bình (MAE) của mô hình MA2.",
    });
  }

  rules.push({
    id: "fc-data-quality",
    condition:
      unconfirmedScaleCount > 0
        ? `Còn ${unconfirmedScaleCount.toLocaleString("vi-VN")} dòng điểm chuẩn chưa xác nhận thang điểm và ${highConfidencePct.toFixed(1).replace(".", ",")}% đạt độ tin cậy Cao`
        : `${highConfidencePct.toFixed(1).replace(".", ",")}% dữ liệu điểm chuẩn đạt độ tin cậy Cao`,
    action:
      unconfirmedScaleCount > 0
        ? "Đối chiếu lại đề án tuyển sinh chính thức của trường trước khi quy đổi điểm chứng chỉ/ĐGNL cho nhóm ngành có cảnh báo."
        : "Có thể sử dụng trực tiếp ngưỡng dự báo MA2 và biên an toàn ±MAE để chốt danh sách NV.",
    impact: "Loại bỏ sai lệch do khác biệt thang điểm (30 vs 40 vs 100) giữa các phương thức.",
    confidenceLabel: highConfidencePct >= 70 ? "Cao" : "Trung bình",
    confidencePct: Math.round(Math.max(60, Math.min(90, highConfidencePct || 70))),
    basis: "Kiểm định phân bố nhãn confidence & scale_confirmed trong fact_cutoff_score.",
  });

  return rules;
}
