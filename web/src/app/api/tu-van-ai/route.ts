import { aiAdvise } from "@/lib/dss/ai-advise";

export const maxDuration = 60; // GLM suy luận có thể ~20–50s

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const score = Number(body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 30) {
      return Response.json({ error: "Điểm thang 30 không hợp lệ (0–30)." }, { status: 400 });
    }
    const result = await aiAdvise({
      score30: score,
      personality: typeof body?.personality === "string" ? body.personality : undefined,
      hollandCode: typeof body?.holland === "string" && body.holland ? body.holland.toUpperCase() : undefined,
      budgetVndYear: body?.budget ? Number(body.budget) : undefined,
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: "Lỗi xử lý: " + (e as Error).message }, { status: 500 });
  }
}
