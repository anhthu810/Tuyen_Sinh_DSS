import { HOLT_ALPHA, HOLT_BETA, holtForecast } from "./holt";

describe("holtForecast", () => {
  describe("< 3 năm dữ liệu", () => {
    it.each([[[]], [[25.5]], [[25.5, 26]]])("trả về null với %j", (hist) => {
      expect(holtForecast(hist)).toBeNull();
    });

    it("trả về null khi có giá trị không hợp lệ", () => {
      expect(holtForecast([25, Number.NaN, 26])).toBeNull();
    });
  });

  describe(">= 3 năm dữ liệu", () => {
    it("dùng α=0.6, β=0.2 mặc định", () => {
      expect(HOLT_ALPHA).toBe(0.6);
      expect(HOLT_BETA).toBe(0.2);
    });

    it("chuỗi tuyến tính hoàn hảo → dự báo đúng xu hướng, MAE = 0", () => {
      const r = holtForecast([20, 21, 22]);
      expect(r).not.toBeNull();
      expect(r!.forecast).toBe(23);
      expect(r!.mae).toBe(0);
      expect(r!.lower).toBe(23);
      expect(r!.upper).toBe(23);
    });

    it("chuỗi hằng → dự báo giữ nguyên", () => {
      expect(holtForecast([24.5, 24.5, 24.5, 24.5])!.forecast).toBe(24.5);
    });

    it("tính đúng theo công thức (3 năm, tính tay)", () => {
      // L=25, T=1 → y1=26: L=26, T=1 → dự báo y2 = 27, thực tế 25.5 → |e| = 1.5
      // y2=25.5: L = 0.6·25.5 + 0.4·27 = 26.1 ; T = 0.2·0.1 + 0.8·1 = 0.82
      const r = holtForecast([25, 26, 25.5])!;
      expect(r.forecast).toBe(26.92);
      expect(r.mae).toBe(1.5);
      expect(r.lower).toBe(25.42);
      expect(r.upper).toBe(28.42);
      expect(r.nYears).toBe(3);
    });

    it("làm tròn 2 chữ số", () => {
      const r = holtForecast([23.17, 24.33, 25.01, 24.87])!;
      expect(Number.isInteger(r.forecast * 100)).toBe(true);
      expect(Number.isInteger(r.mae * 100)).toBe(true);
    });

    it("cho phép đổi tham số và chặn tham số sai", () => {
      expect(holtForecast([20, 21, 22], 0.5, 0.3)!.forecast).toBe(23);
      expect(() => holtForecast([20, 21, 22], 0, 0.2)).toThrow(RangeError);
    });
  });
});
