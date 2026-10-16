const key = process.env.ZAI_API_KEY;
async function call(body, label) {
  const t0 = Date.now();
  const res = await fetch("https://api.z.ai/api/coding/paas/v4/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) { console.log(label, "HTTP", res.status, txt.slice(0, 400)); return; }
  const j = JSON.parse(txt);
  const m = j.choices?.[0]?.message ?? {};
  console.log(`\n=== ${label} (${dt}s) ===`);
  console.log("message keys:", Object.keys(m));
  console.log("content:", JSON.stringify((m.content || "").slice(0, 300)));
  if (m.reasoning_content) console.log("reasoning_content len:", m.reasoning_content.length);
  console.log("finish_reason:", j.choices?.[0]?.finish_reason, "usage:", JSON.stringify(j.usage));
}
// A: big budget, default reasoning
await call({ model:"glm-5.3", messages:[{role:"user",content:"Reply with exactly: PONG 4"}], max_tokens:4000, temperature:0, stream:false }, "A default reasoning");
// B: try lowering reasoning
await call({ model:"glm-5.3", messages:[{role:"user",content:"Reply with exactly: PONG 4"}], max_tokens:1500, temperature:0, stream:false, reasoning_effort:"low" }, "B reasoning_effort=low");
// C: try thinking disabled
await call({ model:"glm-5.3", messages:[{role:"user",content:"Reply with exactly: PONG 4"}], max_tokens:1500, temperature:0, stream:false, thinking:{type:"disabled"} }, "C thinking disabled");
