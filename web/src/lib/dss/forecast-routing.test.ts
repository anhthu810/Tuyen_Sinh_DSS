import { baseMaeForScale, routeForecast, type SeriesInput } from "./forecast-routing";

const series = (
  methodGroup: SeriesInput["methodGroup"],
  scores: number[],
  extra: Partial<SeriesInput> = {},
): SeriesInput => ({
  seriesKey: `TEST|${methodGroup}`,
  methodGroup,
  scoreScale: 30,
  history: scores.map((score, i) => ({ year: 2023 + i, score })),
  ...extra,
});

describe("routeForecast — định tuyến theo nhóm", () => {
  it("GROUP_TALENT → NO_FORECAST, không chạy mô hình", () => {
    const r = routeForecast(series("GROUP_TALENT", [20, 21, 22]));
    expect(r.status).toBe("NO_FORECAST");
    expect(r.model).toBeNull();
    expect(r.referenceScore).toBeNull();
  });

  it.each(["GROUP_HOCBA", "GROUP_COMBINED"] as const)(
    "%s + hasFormulaChanged → dừng, trả điểm năm gần nhất",
    (g) => {
      const r = routeForecast(series(g, [26, 27, 28], { hasFormulaChanged: true }));
      expect(r.status).toBe("LATEST_ACTUAL");
      expect(r.model).toBeNull();
      expect(r.referenceScore).toBe(28);
      expect(r.latestActual).toEqual({ year: 2025, score: 28 });
      expect(r.warnings).toContain("FORMULA_CHANGED");
    },
  );

  it("GROUP_COMBINED không đổi công thức → vẫn chỉ tham chiếu năm gần nhất", () => {
    const r = routeForecast(series("GROUP_COMBINED", [26, 27, 28]));
    expect(r.status).toBe("LATEST_ACTUAL");
    expect(r.warnings).not.toContain("FORMULA_CHANGED");
  });

  it("GROUP_HOCBA không đổi công thức → chạy mô hình như nhóm 1", () => {
    expect(routeForecast(series("GROUP_HOCBA", [26, 27, 28])).model).toBe("HOLT");
  });

  it("hasFormulaChanged không ảnh hưởng nhóm THPT", () => {
    const r = routeForecast(series("GROUP_THPT", [20, 21, 22], { hasFormulaChanged: true }));
    expect(r.model).toBe("HOLT");
  });
});

describe("routeForecast — fallback theo số năm (nhóm 1 & 3)", () => {
  it("≥ 3 năm → Holt α=0.6 β=0.2", () => {
    const r = routeForecast(series("GROUP_THPT", [20, 21, 22]));
    expect(r.status).toBe("FORECAST");
    expect(r.model).toBe("HOLT");
    expect(r.referenceScore).toBe(23);
    expect(r.targetYear).toBe(2026);
    expect(r.mae).toBe(0);
    expect(r.band).toBe(1.35); // MAE 0 → không hẹp hơn sai số nền
  });

  it("= 2 năm → MA2", () => {
    const r = routeForecast(series("GROUP_EXAM", [80, 84], { scoreScale: 150 }));
    expect(r.model).toBe("MA2");
    expect(r.referenceScore).toBe(82);
    expect(r.warnings).toEqual(["NO_BACKTEST"]);
    expect(r.band).toBe(baseMaeForScale(150)); // 6.75 trên thang HSA
  });

  it("= 1 năm → NAIVE + LOW_DATA_RELIABILITY, dải nới ×1,5", () => {
    const r = routeForecast(series("GROUP_THPT", [25]));
    expect(r.model).toBe("NAIVE");
    expect(r.referenceScore).toBe(25);
    expect(r.warnings).toContain("LOW_DATA_RELIABILITY");
    expect(r.band).toBe(2.03);
  });

  it("lịch sử hổng năm → chỉ dùng đoạn liên tiếp cuối + HISTORY_GAP", () => {
    const r = routeForecast({
      ...series("GROUP_THPT", []),
      history: [
        { year: 2021, score: 20 },
        { year: 2023, score: 24 },
        { year: 2024, score: 25 },
      ],
    });
    expect(r.model).toBe("MA2");
    expect(r.nHistoryYears).toBe(2);
    expect(r.warnings).toContain("HISTORY_GAP");
  });

  it("chuỗi rỗng → NO_DATA", () => {
    expect(routeForecast(series("GROUP_THPT", [])).status).toBe("NO_DATA");
  });
});

describe("phân loại cơ hội đỗ theo MAE", () => {
  // Tham chiếu 23, band 1.35 → Với cao < 22.46 ≤ Vừa sức < 24.49 ≤ Chắc đỗ
  it.each([
    [21, "reach", "Với cao"],
    [23, "match", "Vừa sức"],
    [25, "safety", "Chắc đỗ"],
  ])("điểm %d → %s", (score, bucket, label) => {
    const r = routeForecast(series("GROUP_THPT", [20, 21, 22], { studentScore: score }));
    expect(r.chance?.bucket).toBe(bucket);
    expect(r.chance?.label).toBe(label);
    expect(r.chance?.thresholds).toEqual({ reachBelow: 22.46, safetyFrom: 24.49 });
  });

  it("dải rộng hơn khi MAE lớn hơn — cùng biên điểm đổi nhóm", () => {
    const stable = routeForecast(series("GROUP_THPT", [20, 21, 22], { studentScore: 24.6 }));
    const noisy = routeForecast(series("GROUP_THPT", [20, 24, 19, 25, 21], { studentScore: 24.6 }));
    expect(stable.chance?.bucket).toBe("safety");
    expect(noisy.mae!).toBeGreaterThan(1.35);
    expect(noisy.band).toBe(noisy.mae);
  });

  it("điểm HS khác thang với chuỗi → không phân loại (không quy đổi chéo)", () => {
    const r = routeForecast(
      series("GROUP_EXAM", [90, 95, 100], { scoreScale: 150, studentScore: 25, studentScoreScale: 30 }),
    );
    expect(r.status).toBe("FORECAST");
    expect(r.chance).toBeNull();
  });

  it("nhóm năng khiếu → không phân loại", () => {
    expect(routeForecast(series("GROUP_TALENT", [20], { studentScore: 25 })).chance).toBeNull();
  });
});
