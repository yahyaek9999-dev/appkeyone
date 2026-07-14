// Universal Providers — AI domain service (server-only).
//
// Bridges resolved vault credentials to the existing lib/providers router for
// known vendors (OpenAI, Claude, Gemini, Groq, OpenRouter, Grok) and to a
// custom OpenAI-compatible adapter for self-hosted endpoints. Registers a
// DomainService (ping) so the generic dashboard's "Test" works, and exposes
// aiChatWithFailover() for callers that want cross-provider resilience + custom.

import { routeProviderChat } from "@/lib/providers/provider-router";
import type { ChatMsg, ProviderId, ToolCall, ToolChoice, ToolDef, ThinkingOpts } from "@/lib/providers/types";
import type { ProviderOverride } from "@/lib/llm";
import { runWithFailover } from "../failover";
import { loadEnabledResolved } from "../vault";
import { registerService } from "../services";
import { IntegrationError, type FailoverResult, type ResolvedProvider } from "../types";
import { callCustomChat } from "./custom";

export type AiChatOpts = {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Opt-in streaming/tool-calling/reasoning passthrough — ignored by callers that don't set them. See lib/providers/types.ts. */
  stream?: boolean;
  onStreamChunk?: (chunk: string) => void;
  tools?: ToolDef[];
  toolChoice?: ToolChoice;
  thinking?: ThinkingOpts;
};
export type AiChatResult = {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: ToolCall[];
  thinkingText?: string;
};

const KNOWN: ReadonlySet<string> = new Set(["openai", "claude", "gemini", "groq", "openrouter", "grok"]);

/** Execute one AI chat against a single resolved provider (throws on failure). */
export async function runAiChat(
  p: ResolvedProvider,
  messages: ChatMsg[],
  opts: AiChatOpts,
): Promise<AiChatResult> {
  if (p.provider === "custom") {
    return callCustomChat(p, messages, opts);
  }
  if (!KNOWN.has(p.provider)) {
    throw new IntegrationError("ai", p.provider, 0, "unsupported ai provider", false);
  }
  if (!p.secret) throw new IntegrationError("ai", p.provider, 0, "missing api key", false);
  // routeProviderChat throws a ProviderError (carries .status/.retryable) on failure.
  return routeProviderChat(messages, {
    provider: p.provider as Exclude<ProviderId, "keyone">,
    apiKey: p.secret,
    model: p.model || null,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    timeoutMs: opts.timeoutMs ?? 30000,
    retries: 1,
    stream: opts.stream,
    onStreamChunk: opts.onStreamChunk,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
    thinking: opts.thinking,
  });
}

/**
 * Run an AI chat across the tenant's configured providers (priority order) with
 * automatic failover. Returns the text + winning provider, or a graceful
 * disabled result when no provider is configured / all failed. Callers that
 * want a keyone fallback should fall back to lib/llm.chat() on a disabled result.
 */
export async function aiChatWithFailover(
  userId: string,
  messages: ChatMsg[],
  opts: AiChatOpts = {},
): Promise<FailoverResult<AiChatResult>> {
  return runWithFailover<AiChatResult>(userId, "ai", (p) => runAiChat(p, messages, opts), {
    operation: "chat",
    meta: (res) => ({ inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens }),
  });
}

/**
 * Map the tenant's enabled vault AI providers (priority order) into the
 * `ProviderOverride[]` failover list accepted by lib/llm.chat(). Custom
 * OpenAI-compatible endpoints are excluded here (the legacy chat() router can't
 * route them) — they remain available via aiChatWithFailover(). Empty list →
 * caller keeps its existing single-provider behavior.
 */
export async function resolveAiOverrides(userId: string): Promise<ProviderOverride[]> {
  const resolved = await loadEnabledResolved(userId, "ai").catch(() => [] as ResolvedProvider[]);
  const out: ProviderOverride[] = [];
  for (const p of resolved) {
    if (p.provider === "custom" || !KNOWN.has(p.provider) || !p.secret) continue;
    out.push({ provider: p.provider as ProviderId, apiKey: p.secret, model: p.model || null });
  }
  return out;
}

// ── Health probe (tiny 2-token ping; cost ≈ nil) ─────────────────────────────
registerService({
  domain: "ai",
  async ping(p: ResolvedProvider) {
    await runAiChat(
      p,
      [
        { role: "system", content: "Reply with the single word OK." },
        { role: "user", content: "ping" },
      ],
      { temperature: 0, maxTokens: 5, timeoutMs: 15000 },
    );
  },
});
