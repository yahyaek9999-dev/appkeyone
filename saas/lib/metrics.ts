// Lightweight observability helper (Controlled Launch).
//
// Design goals:
//   - Never block the request path.
//   - No external dep (no Redis, no Prometheus). SQLite only.
//   - Coalesce many in-process increments into batched DB writes to keep
//     SQLite happy under burst load.
//   - Crash-safe: pending buffer flushes on next call; we accept losing the
//     last ≤FLUSH_INTERVAL_MS of counts on a hard crash. That's fine for
//     business analytics — we're not building APM.
//
// Two helpers exposed:
//   bump(kind, userId?)                — for boolean events (cache hit, etc.)
//   bumpProvider(userId, provider, ...) — for token + latency rollups
//
// `kind` values used today (keep this list short; rename audit if you add):
//   llm_call · llm_fail · cache_hit · semantic_hit · quick_reply_hit ·
//   fast_path_hit · realism_active · anti_ban_cooldown · order_extracted ·
//   daily_cap_hit · provider_fallback · ws_reconnect ·
//   WA AI registry migration: registry_success · registry_failover ·
//   legacy_fallback · keyone_fallback · provider_timeout · provider_quota ·
//   provider_auth_err · provider_failure
//
// Note: this module is intentionally tolerant of a missing/older Prisma
// client. If `prisma.metricEvent` is undefined at runtime (pre-`prisma
// generate`), bump() becomes a no-op instead of throwing.

import { prisma } from "@/lib/db";

type EventKey = string;        // `${userId}|${kind}`
type ProvKey  = string;        // `${userId}|${provider}|${model}`

const counts  = new Map<EventKey, number>();
const provAgg = new Map<ProvKey, { calls: number; failures: number; inTokens: number; outTokens: number; latencyMs: number }>();

const FLUSH_INTERVAL_MS = 10_000;
let flushTimer: NodeJS.Timeout | null = null;
let flushing = false;

function ensureTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => { flush().catch(() => {}); }, FLUSH_INTERVAL_MS);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

/** UTC day key — YYYY-MM-DD. Stable across timezone changes. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Increment an event counter. Fire-and-forget; never throws.
 *
 *   bump("cache_hit", userId)   — per-merchant
 *   bump("ws_reconnect")        — global
 */
export function bump(kind: string, userId: string = "*", n: number = 1): void {
  if (!kind || n <= 0) return;
  const key = `${userId}|${kind}`;
  counts.set(key, (counts.get(key) || 0) + n);
  ensureTimer();
}

/**
 * Record an LLM provider call. Always pass `success=true|false`. Token
 * counts are best-effort (undefined → 0). Latency in ms (Date.now() diff).
 */
export function bumpProvider(args: {
  userId: string;
  provider: string;
  model?: string | null;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}): void {
  const { userId, provider } = args;
  if (!userId || !provider) return;
  const model = (args.model || "").slice(0, 80);
  const key = `${userId}|${provider}|${model}`;
  const row = provAgg.get(key) || { calls: 0, failures: 0, inTokens: 0, outTokens: 0, latencyMs: 0 };
  row.calls += 1;
  if (!args.success) row.failures += 1;
  row.inTokens  += Math.max(0, args.inputTokens  || 0);
  row.outTokens += Math.max(0, args.outputTokens || 0);
  row.latencyMs += Math.max(0, args.latencyMs    || 0);
  provAgg.set(key, row);
  // Convenience: also bump the event counter so a single per-provider
  // failure shows up in the kind=llm_fail rollup too.
  bump(args.success ? "llm_call" : "llm_fail", userId);
  ensureTimer();
}

/**
 * Drain the in-memory buffers to SQLite. Concurrent flushes are coalesced.
 * Errors are swallowed — analytics are best-effort.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  const day = today();
  try {
    // Snapshot + reset buffers atomically (sync), then write at our leisure.
    const eventsBatch = Array.from(counts.entries());
    counts.clear();
    const provBatch = Array.from(provAgg.entries());
    provAgg.clear();

    // Skip silently if the new tables aren't migrated yet (pre-prisma-push).
    const me: any = (prisma as any).metricEvent;
    const pu: any = (prisma as any).providerUsage;
    if (!me || !pu) return;

    // Sequential upserts. We don't batch via raw SQL because Prisma's
    // upsert handles the unique-conflict correctly across schema drift.
    for (const [key, n] of eventsBatch) {
      const [userId, kind] = key.split("|");
      if (!userId || !kind || !n) continue;
      try {
        await me.upsert({
          where:  { userId_day_kind: { userId, day, kind } },
          create: { userId, day, kind, count: n, lastAt: new Date() },
          update: { count: { increment: n }, lastAt: new Date() },
        });
      } catch { /* swallow */ }
    }

    for (const [key, agg] of provBatch) {
      const [userId, provider, model] = key.split("|");
      if (!userId || !provider) continue;
      try {
        await pu.upsert({
          where:  { userId_day_provider_model: { userId, day, provider, model: model || "" } },
          create: {
            userId, day, provider, model: model || "",
            calls:        agg.calls,
            failures:     agg.failures,
            inputTokens:  agg.inTokens,
            outputTokens: agg.outTokens,
            totalLatencyMs: agg.latencyMs,
            lastAt: new Date(),
          },
          update: {
            calls:        { increment: agg.calls },
            failures:     { increment: agg.failures },
            inputTokens:  { increment: agg.inTokens },
            outputTokens: { increment: agg.outTokens },
            totalLatencyMs: { increment: agg.latencyMs },
            lastAt: new Date(),
          },
        });
      } catch { /* swallow */ }
    }
  } finally {
    flushing = false;
  }
}

// Best-effort flush on process exit. Not awaited (process is dying).
if (typeof process !== "undefined" && !(process as any).__keyone_metrics_hook) {
  (process as any).__keyone_metrics_hook = true;
  process.on("beforeExit", () => { flush().catch(() => {}); });
}
