import type { NextRequest } from "next/server";
import { parseForecastFilters } from "@/lib/dss/forecast-filter";
import { searchForecastSeries } from "@/lib/queries/forecast-search";

const MAX_LIMIT = 500;

/**
 * GET /api/v1/forecasts?schoolCode=&methodGroup=&scoreScale=&modelType=&keyword=&limit=&offset=
 *
 *   schoolCode   mã trường (BKA, KHA, ...)                              | ALL
 *   methodGroup  GROUP_THPT | GROUP_HOCBA | GROUP_EXAM | GROUP_COMBINED | GROUP_TALENT | ALL
 *   scoreScale   thang gốc: 30, 40, 100, 150, 1200...                     | ALL
 *   modelType    MA2 | NAIVE | HOLT  (chuỗi có dự báo năm tới bằng mô hình đó) | ALL
 *   keyword      tên ngành / mã ngành, không phân biệt dấu
 * Tham số rỗng hoặc 'ALL' → bỏ điều kiện lọc tương ứng.
 *
 * 200 → { filters, total, limit, offset, data: SeriesSummary[] }
 * 400 → { error, details[] } khi tham số sai định dạng
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { filters, errors } = parseForecastFilters(sp);

  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 100) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  if (errors.length) {
    return Response.json({ error: "Tham số lọc không hợp lệ", details: errors }, { status: 400 });
  }

  try {
    const all = await searchForecastSeries(filters);
    return Response.json({
      filters,
      total: all.length,
      limit,
      offset,
      data: all.slice(offset, offset + limit),
    });
  } catch (e) {
    return Response.json({ error: "Lỗi truy vấn dự báo: " + (e as Error).message }, { status: 500 });
  }
}
