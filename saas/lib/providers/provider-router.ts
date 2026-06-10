// Provider router. Single dispatch point for all third-party AI providers.
//
// Behavior layers (realism, anti-ban, memory, sales, semantic match, fast-path,
// cache, quick-replies, order-extractor) are NOT touched here — this module
// only swaps the text-generation source. The caller in `lib/llm.ts` continues
// to manage history compression, message coalescing, and concurrency.
//
// Design:
//   - Bare fetch only — no SDKs.
//   - Shared timeout, exponential-backoff retry, and error normalization.
//   - "keyone" is handled by the caller (legacy in-house path); the router
//     refuses it explicitly so a misconfigured caller fails loud, not silent.

import { callOpenAI } from "./openai";
import { callOpenRouter } from "./openrouter";
import { callGroq } from "./groq";
import { callGrok } from "./grok";
import { callGemini } from "./gemini";
import { callClaude } from "./claude";
import {
  ChatMsg,
  ProviderCallOpts,
  ProviderError,
  ProviderId,
  ProviderResult,
} from "./types";

export type RouterOpts = ProviderCallOpts & {
  provider: Exclude<ProviderId, "keyone">;
  retries?: number;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Calls the configured provider with bounded retries. Returns the assistant
 * text (and best-effort token usage). Throws a `ProviderError` on terminal
 * failure (after retries exhausted, or for non-retryable 4xx).
 */
export async function routeProviderChat(
  messages: ChatMsg[],
  opts: RouterOpts
): Promise<ProviderResult> {
  if (!opts.apiKey) {
    throw new ProviderError(opts.provider, 0, "missing api key", false);
  }
  const retries = opts.retries ?? 2; // up to 3 attempts total

  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await dispatch(opts.provider, messages, opts);
    } catch (e: any) {
      lastErr = e;
      const retryable =
        e instanceof ProviderError ? e.retryable : isAbortOrNetwork(e);
      if (!retryable || attempt === retries) throw e;
      const delay = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
      await sleep(delay);
    }
  }
  throw lastErr || new ProviderError(opts.provider, 0, "exhausted retries", false);
}

function dispatch(
  provider: Exclude<ProviderId, "keyone">,
  messages: ChatMsg[],
  opts: ProviderCallOpts
): Promise<ProviderResult> {
  switch (provider) {
    case "openai":     return callOpenAI(messages, opts);
    case "openrouter": return callOpenRouter(messages, opts);
    case "groq":       return callGroq(messages, opts);
    case "grok":       return callGrok(messages, opts);
    case "gemini":     return callGemini(messages, opts);
    case "claude":     return callClaude(messages, opts);
  }
}

function isAbortOrNetwork(e: any): boolean {
  const name = e?.name || "";
  const code = e?.code || "";
  const msg  = String(e?.message || "");
  return (
    name === "AbortError" ||
    code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" ||
    msg.includes("fetch failed") || msg.includes("network")
  );
}

/**
 * Light-touch test call: a single 2-token prompt. Used by the
 * `/api/settings/ai-provider/test` endpoint to verify the merchant's key
 * works before saving it. Cost is intentionally tiny (≤5 tokens of output).
 */
export async function testProviderKey(
  provider: Exclude<ProviderId, "keyone">,
  apiKey: string,
  model?: string | null
): Promise<{ ok: true; preview: string; usage?: ProviderResult["usage"] } | { ok: false; error: string; status: number }> {
  try {
    const r = await routeProviderChat(
      [
        { role: "system", content: "Reply with the single word OK." },
        { role: "user", content: "ping" },
      ],
      {
        provider,
        apiKey,
        model: model || null,
        temperature: 0,
        maxTokens: 5,
        timeoutMs: 15000,
        retries: 1,
      }
    );
    return { ok: true, preview: (r.text || "").trim().slice(0, 80), usage: r.usage };
  } catch (e: any) {
    const status = e?.status ?? 0;
    const msg = e?.message ? String(e.message).slice(0, 250) : "request failed";
    return { ok: false, error: msg, status };
  }
}
