import { getSchoolOptions } from "@/lib/queries/forecast-search";

/**
 * GET /api/v1/schools
 * Danh mục trường đang có trong CSDL (dim_university có ít nhất 1 ngành) cho Filter Toolbar.
 * 200 → { data: [{ code, name, shortName }], total }
 */
export async function GET() {
  try {
    const data = await getSchoolOptions();
    return Response.json({ data, total: data.length });
  } catch (e) {
    return Response.json({ error: "Không đọc được danh mục trường: " + (e as Error).message }, { status: 500 });
  }
}
