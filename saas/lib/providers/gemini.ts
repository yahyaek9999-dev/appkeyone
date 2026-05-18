// Google Gemini provider adapter. Uses the v1beta REST API.
//
// Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key=KEY
// Wire format differs from OpenAI: messages → contents[] with role + parts.
// "system" messages are folded into a single systemInstruction field.

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  isRetryableStatus,
} from "./types";

export async function callGemini(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.gemini;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  try {
    // Gemini wants system content separated and the rest re-tagged user/model.
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

    const body: any = { contents };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
    const gen: any = {};
    if (typeof opts.temperature === "number") gen.temperature = opts.temperature;
    if (typeof opts.maxTokens === "number") gen.maxOutputTokens = opts.maxTokens;
    if (Object.keys(gen).length) body.generationConfig = gen;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new ProviderError("gemini", res.status, detail, isRetryableStatus(res.status));
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text: string = Array.isArray(parts)
      ? parts.map((p: any) => p?.text || "").join("")
      : "";
    const um = data?.usageMetadata;
    const usage = um
      ? { inputTokens: um.promptTokenCount, outputTokens: um.candidatesTokenCount }
      : undefined;
    return { text, usage };
  } finally {
    clearTimeout(t);
  }
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message || JSON.stringify(j).slice(0, 300);
  } catch {
    try { return (await res.text()).slice(0, 300); } catch { return res.statusText; }
  }
}
