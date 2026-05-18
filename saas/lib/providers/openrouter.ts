// OpenRouter provider adapter. OpenAI-compatible wire format.
//
// Endpoint: https://openrouter.ai/api/v1/chat/completions
// Auth:     Authorization: Bearer <key>
// Extras:   "HTTP-Referer" and "X-Title" headers are recommended by OpenRouter
//           for analytics — they DO NOT affect routing or pricing.

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  isRetryableStatus,
} from "./types";

export async function callOpenRouter(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.openrouter;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://app.keyone1.com",
        "X-Title": "KEYONE",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
        ...(typeof opts.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
      }),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new ProviderError("openrouter", res.status, detail, isRetryableStatus(res.status));
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const usage = data?.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
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
