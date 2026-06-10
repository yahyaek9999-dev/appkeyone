// WhatsApp AI reply orchestrator (server-only).
//
// Routes the live bot reply through the tenant provider registry with failover,
// while PRESERVING the legacy path, Bot.aiProvider, and the in-house keyone
// cluster. This module ONLY changes the text-generation source — the prompt,
// persona, knowledge, sales, realism, humanize, memory and cache layers all run
// upstream in the caller and are untouched, as is the WhatsApp send pipeline
// (the route returns the reply string; whatsapp-service does the Baileys send).
//
// Fallback order (KeyOne is the FINAL layer, never the first):
//   vault#1 → vault#2 → vault#3 → … → legacy Bot.aiProvider → KeyOne in-house
//
// Rollout controls (NO schema): global kill-switch = scalingFlags.waAiRegistry
// (env WA_AI_REGISTRY_ENABLED, default OFF → pure legacy). Per-tenant is
// intrinsic — a tenant uses the registry only when it has enabled vault AI
// credentials; otherwise the chain naturally collapses to legacy/keyone.

import { scalingFlags } from "@/lib/scaling-flags";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { chat } from "@/lib/llm";
import { bump } from "@/lib/metrics";
import type { ChatMsg } from "@/lib/providers/types";
import { runWithFailover } from "../failover";
import { getDescriptor } from "../registry";
import type { ResolvedProvider } from "../types";
import { runAiChat } from "./index";

export type BotReplySource = "registry" | "legacy" | "keyone";

export type GenerateBotReplyArgs = {
  userId: string;
  bot: Record<string, any>; // the loaded Bot row (read-only here)
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type GenerateBotReplyResult = {
  text: string;
  source: BotReplySource;
  provider?: string;
  attempts?: number;
};

/**
 * Build the legacy `Bot.aiProvider` config as the LAST tenant-owned failover
 * tier (appended after the vault providers). Returns [] for keyone-default bots.
 * `credId: null` → no health row is written for it (correct: it has no vault row).
 */
export function legacyResolved(bot: Record<string, any>): ResolvedProvider[] {
  const ov = botProviderOverride(bot);
  if (!ov || !ov.apiKey) return [];
  const descriptor = getDescriptor("ai", ov.provider);
  if (!descriptor) return [];
  return [
    {
      credId: null,
      domain: "ai",
      provider: ov.provider,
      descriptor,
      priority: 99999, // always after vault providers
      source: "legacy",
      status: "unknown",
      lastCheckAt: null,
      secret: ov.apiKey,
      secret2: "",
      publicId: "",
      endpoint: "",
      model: ov.model || "",
      config: {},
    },
  ];
}

/**
 * Generate the bot reply with: registry → legacy → keyone failover, usage
 * logging (ProviderUsage + ProviderCallLog), health tracking, and outcome
 * counters. Never used to send — returns the reply string for the caller.
 *
 * When the global flag is OFF, this is a thin pass-through to the exact legacy
 * call (`chat({ provider: botProviderOverride(bot) })`) — byte-identical to the
 * pre-migration behavior, including its failure mode (a failing external
 * provider throws to the caller's existing try/catch; NO keyone fallback).
 */
export async function generateBotReply(args: GenerateBotReplyArgs): Promise<GenerateBotReplyResult> {
  const { userId, bot, messages, temperature, maxTokens, timeoutMs } = args;

  // ── Global kill-switch OFF → exact legacy path (preserved verbatim) ─────────
  if (!scalingFlags.waAiRegistry) {
    const ov = botProviderOverride(bot);
    const text = await chat(messages, { temperature, maxTokens, provider: ov, meterUserId: userId });
    const source: BotReplySource = ov ? "legacy" : "keyone";
    bump(source === "legacy" ? "legacy_fallback" : "keyone_fallback", userId);
    return { text, source, provider: ov?.provider };
  }

  // ── Tenant-owned chain: vault (priority) → legacy, with failover + P4 + P5 ──
  // Per-tenant gating is intrinsic: no enabled vault AI creds AND no legacy
  // provider → `no_provider_configured` → keyone below.
  const r = await runWithFailover(
    userId,
    "ai",
    (p) => runAiChat(p, messages, { temperature, maxTokens, timeoutMs }),
    {
      operation: "chat",
      appendLegacy: () => legacyResolved(bot),
      meta: (res) => ({ inputTokens: res.usage?.inputTokens, outputTokens: res.usage?.outputTokens }),
    },
  );

  if (r.ok) {
    if (r.attempts > 1) bump("registry_failover", userId); // ≥1 failover transition occurred
    if (r.source === "legacy") {
      bump("legacy_fallback", userId);
      return { text: r.result.text, source: "legacy", provider: r.provider, attempts: r.attempts };
    }
    bump("registry_success", userId);
    return { text: r.result.text, source: "registry", provider: r.provider, attempts: r.attempts };
  }

  // ── KeyOne — FINAL fallback only (no tenant providers OR all of them failed) ─
  const text = await chat(messages, { temperature, maxTokens, meterUserId: userId }); // no provider → keyone
  bump("keyone_fallback", userId);
  return { text, source: "keyone" };
}

// NOTE (v1 scope): the two auxiliary LLM calls in the WhatsApp route
// (classifyIntentLLM, microUpdateTopics) intentionally remain on the legacy
// `botProviderOverride(bot)` path — migrating them is a deferred follow-up.
