// Client gọi GLM-5.3 (z.ai) — CHỈ dùng ở SERVER (route handler / server action).
// Key đọc từ process.env.ZAI_API_KEY (KHÔNG prefix NEXT_PUBLIC → không lộ ra client).
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function glmChat(
  messages: ChatMsg[],
  opts?: { maxTokens?: number; reasoningEffort?: "low" | "high" | "max"; model?: string; temperature?: number },
): Promise<{ content: string; usage?: unknown }> {
  const key = process.env.ZAI_API_KEY;
  if (!key) throw new Error("ZAI_API_KEY chưa được cấu hình trên server.");
  const res = await fetch("https://api.z.ai/api/coding/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts?.model ?? "glm-5.3",
      messages,
      max_tokens: opts?.maxTokens ?? 4000,
      temperature: opts?.temperature ?? 0.4,
      reasoning_effort: opts?.reasoningEffort ?? "high",
      stream: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`z.ai HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return { content: j.choices?.[0]?.message?.content ?? "", usage: j.usage };
}

// GLM trả content có thể kèm ```json fence hoặc prose — trích object JSON đầu tiên.
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
