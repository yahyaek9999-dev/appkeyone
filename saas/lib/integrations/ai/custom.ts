// Custom OpenAI-compatible chat adapter (server-only).
//
// For tenants running their own / self-hosted OpenAI-compatible endpoint. The
// endpoint is SSRF-validated on every call (safeFetch re-validates each hop) so
// a merchant cannot point it at internal services.

import { safeFetch } from "@/lib/ssrf";
import type { ChatMsg } from "@/lib/providers/types";
import { IntegrationError } from "../types";
import type { ResolvedProvider } from "../types";

export async function callCustomChat(
  p: ResolvedProvider,
  messages: ChatMsg[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number },
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const endpoint = p.endpoint;
  if (!endpoint) throw new IntegrationError("ai", "custom", 0, "missing endpoint", false);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  try {
    const res = await safeFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(p.secret ? { Authorization: `Bearer ${p.secret}` } : {}),
      },
      body: JSON.stringify({
        model: p.model || "gpt-3.5-turbo",
        messages,
        ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
        ...(typeof opts.maxTokens === "number" ? { max_tokens: opts.maxTokens } : {}),
      }),
      cache: "no-store",
      signal: ctrl.signal,
    } as any);
    if (!res.ok) {
      const detail = await safeReadError(res);
      throw new IntegrationError("ai", "custom", res.status, detail, res.status === 408 || res.status === 429 || res.status >= 500);
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    const usage = data?.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined;
    return { text, usage };
  } catch (e: any) {
    if (e instanceof IntegrationError) throw e;
    if (String(e?.message || "").includes("blocked_url"))
      throw new IntegrationError("ai", "custom", 0, "endpoint blocked (internal/unsafe URL)", false);
    throw new IntegrationError("ai", "custom", 0, String(e?.message || "request failed"), true);
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
