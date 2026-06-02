# AI Providers

> Source files: `saas/lib/llm.ts` (entry), `saas/lib/providers/*.ts` (per-vendor adapters).

## Overview

A merchant can choose **any** of 6 providers from `/dashboard/settings/ai-provider`:

| Provider id | Adapter file | What it talks to |
|---|---|---|
| `keyone` (default) | (inline in `lib/llm.ts`) | In-house `mse-llm` Python service driving chatgpt.com via Playwright |
| `openai` | `lib/providers/openai.ts` | `api.openai.com/v1/chat/completions` |
| `gemini` | `lib/providers/gemini.ts` | `generativelanguage.googleapis.com` |
| `claude` | `lib/providers/claude.ts` | `api.anthropic.com` |
| `groq` | `lib/providers/groq.ts` | `api.groq.com/openai/v1` |
| `openrouter` | `lib/providers/openrouter.ts` | `openrouter.ai/api/v1` |

The router lives in `saas/lib/providers/provider-router.ts`. It explicitly
**refuses** `keyone` to keep the legacy path inside `lib/llm.ts` — this is by
design so a misconfigured caller fails loudly.

## Per-call override

`lib/llm.ts:chat(messages, opts)` accepts:
```ts
{
  provider?: { provider: ProviderId; apiKey?: string; model?: string };
  temperature?: number;
  meterUserId?: string;  // for ProviderUsage tracking
}
```

The incoming hot path computes `botProviderOverride(bot)` (decrypts
`bot.aiApiKeyEnc` with AES-256-GCM via `lib/crypto-util.ts`). If a non-`keyone`
provider is selected, the request bypasses the in-house mse-llm and goes
directly to the merchant's chosen vendor.

## Concurrency + retries

**Semaphore:** `LLM_MAX_CONCURRENT` (default 3) — `lib/llm.ts:acquire()/release()`. Excess requests queue in FIFO.

**Round-robin (keyone only):** `LLM_API_URLS=url1,url2,url3` → rotation index across URLs.

**Retries (provider router):** up to 3 attempts with exponential backoff
(`500ms * 2^attempt + jitter`). Only retryable errors (network, abort,
5xx) trigger a retry. 4xx is terminal.

## Circuit breaker

When `keyone` consecutively fails (timeout/500), `lib/llm.ts` opens a
**60-second breaker** so we stop hammering the dead service. While open,
all `keyone` calls short-circuit to the fallback string immediately.

Implementation hint: search for "circuit breaker" comment near the top of
`lib/llm.ts` around line 80 for the exact mechanism.

## What is NOT touched when switching providers

Important: behavior layers run **upstream** of provider choice. Switching from
keyone → openai changes ONLY which API generates the text. Everything else
keeps working:
- Realism, anti-ban, safety engine
- Memory engine, sales engine
- Quick replies, semantic FAQ
- Order extraction
- Knowledge-base retrieval
- Cache (`LlmCache`)
- Humanize

## Test endpoint

`POST /api/settings/ai-provider/test` — small "say OK" call (max 5 output tokens) so the merchant can validate their key before saving. Implemented via
`testProviderKey(provider, apiKey, model)` in `lib/providers/provider-router.ts:94`.

## Logging + metrics

- Every call → `MetricEvent` bump via `bump("llm_call", userId)`.
- Every failure → `bump("llm_fail", userId)`.
- Per-provider rollup → `ProviderUsage` row updated (`bumpProvider` in `lib/metrics.ts`). Tokens may be 0 for providers that don't return usage.
- Visible at `/admin/metrics` per merchant per day.

## Common pitfalls

1. **`bot.aiProvider` is set but `aiApiKeyEnc` is missing** → router throws `missing api key` (`ProviderError`). Caller in `lib/llm.ts` catches and falls back to the keyone path or a friendly Arabic error.
2. **Wrong model name** for a provider → 400 from upstream. Surfaced in `ProviderError.message`.
3. **`keyone` is dead** but breaker isn't open yet → first request waits the full timeout (`LLM_TIMEOUT_MS`), THEN trips the breaker. To prevent 30s waits during outage, set `bot.aiProvider="openai"` per merchant.

## Recommended production posture

- Default new merchants to **`openai`** with a shared key managed by the platform owner (until per-merchant billing is wired).
- Keep `keyone` available for cost-sensitive merchants who accept fragility.
- Monitor `llm_fail` / `llm_call` ratio at `/admin/metrics`. If it exceeds 5% sustained → investigate or trip the breaker permanently for that provider.
