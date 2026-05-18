// Anthropic Claude provider adapter.
//
// Endpoint: POST https://api.anthropic.com/v1/messages
// Auth:     x-api-key: <key>
// Headers:  anthropic-version: 2023-06-01
// Wire:     "system" is a top-level field; messages keep role user|assistant.

import {
  ChatMsg,
  DEFAULT_MODELS,
  ProviderCallOpts,
  ProviderError,
  ProviderResult,
  isRetryableStatus,
} from "./types";

export async function callClaude(
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  const model = opts.model || DEFAULT_MODELS.claude;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  try {
    const systemText = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const conv = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: any = {
      model,
      messages: conv,
      max_tokens: opts.maxTokens ?? 1024, // Claude requires max_tokens
    };
    if (systemText) body.system = systemText;
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new ProviderError("claude", res.status, detail, isRetryableStatus(res.status));
    }
    const data = await res.json();
    const blocks = data?.content;
    const text: string = Array.isArray(blocks)
      ? blocks.map((b: any) => (b?.type === "text" ? b.text : "")).join("")
      : "";
    const usage = data?.usage
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
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
