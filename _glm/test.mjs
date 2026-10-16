const key = process.env.ZAI_API_KEY;
const t0 = Date.now();
try {
  const res = await fetch("https://api.z.ai/api/coding/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "glm-5.3",
      messages: [
        { role: "system", content: "You are a terse assistant." },
        { role: "user", content: "Reply with exactly: PONG <2+2>" },
      ],
      max_tokens: 200,
      temperature: 0,
      stream: false,
    }),
  });
  const txt = await res.text();
  console.log("HTTP", res.status, "in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  if (!res.ok) { console.log("BODY:", txt.slice(0, 600)); process.exit(1); }
  const j = JSON.parse(txt);
  console.log("content:", JSON.stringify(j.choices?.[0]?.message?.content));
  console.log("usage:", JSON.stringify(j.usage));
  console.log("model:", j.model);
} catch (e) { console.log("FETCH ERROR:", e.message); process.exit(2); }
