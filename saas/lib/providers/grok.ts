// xAI Grok provider adapter. OpenAI-compatible Chat Completions API — bare fetch.
//
// Endpoint: https://api.x.ai/v1/chat/completions
// Auth:     Authorization: Bearer <key>
// Body:     { model, messages, temperature, max_tokens }

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  isRetryableStatus,
} from "./types";

export async function callGrok(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.grok;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
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
      throw new ProviderError("grok", res.status, detail, isRetryableStatus(res.status));
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
    return j?.error?.message || j?.error || JSON.stringify(j).slice(0, 300);
  } catch {
    try { return (await res.text()).slice(0, 300); } catch { return res.statusText; }
  }
}
