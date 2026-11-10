import {
  DEFAULT_FILTERS,
  filtersToSearchParams,
  isDefaultFilters,
  modelOf,
  normalizeText,
  parseForecastFilters,
} from "./forecast-filter";

describe("parseForecastFilters", () => {
  it("rỗng / ALL → mặc định (bỏ mọi điều kiện)", () => {
    expect(parseForecastFilters(new URLSearchParams()).filters).toEqual(DEFAULT_FILTERS);
    const { filters, errors } = parseForecastFilters(
      new URLSearchParams("schoolCode=ALL&methodGroup=all&scoreScale=ALL&modelType=&keyword=%20"),
    );
    expect(filters).toEqual(DEFAULT_FILTERS);
    expect(errors).toEqual([]);
  });

  it("đọc đủ 5 tham số, chuẩn hóa hoa thường", () => {
    const { filters, errors } = parseForecastFilters({
      schoolCode: "bka",
      methodGroup: "group_exam",
      scoreScale: "150",
      modelType: "holt",
      keyword: " máy tính ",
    });
    expect(errors).toEqual([]);
    expect(filters).toEqual({
      schoolCode: "BKA",
      methodGroup: "GROUP_EXAM",
      scoreScale: 150,
      modelType: "HOLT",
      keyword: "máy tính",
    });
  });

  it("giá trị sai → bỏ qua và báo lỗi", () => {
    const { filters, errors } = parseForecastFilters({
      methodGroup: "GROUP_X",
      scoreScale: "abc",
      modelType: "ARIMA",
      schoolCode: "'; drop table--",
    });
    expect(filters).toEqual(DEFAULT_FILTERS);
    expect(errors).toHaveLength(4);
  });

  it("round-trip qua query string", () => {
    const f = { ...DEFAULT_FILTERS, schoolCode: "NEU", scoreScale: 30, modelType: "MA2" as const };
    const qs = filtersToSearchParams(f);
    expect(qs.toString()).toBe("schoolCode=NEU&scoreScale=30&modelType=MA2");
    expect(parseForecastFilters(qs).filters).toEqual(f);
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true);
    expect(isDefaultFilters(f)).toBe(false);
  });
});

describe("tiện ích", () => {
  it("normalizeText bỏ dấu tiếng Việt", () => {
    expect(normalizeText("Khoa học Máy tính")).toBe("khoa hoc may tinh");
    expect(normalizeText("Điện – Điện tử")).toBe("dien – dien tu");
  });

  it("modelOf đọc cột method của ETL", () => {
    expect(modelOf("HOLT (α=0.6, β=0.2)")).toBe("HOLT");
    expect(modelOf("MA2 (TB 2 năm trước)")).toBe("MA2");
    expect(modelOf("NAIVE (năm trước)")).toBe("NAIVE");
    expect(modelOf("ACTUAL")).toBeNull();
  });
});
