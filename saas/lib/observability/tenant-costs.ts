// ---------------------------------------------------------------------------
// Per-tenant cost & performance observability (Agent 4 / Task 1).
//
// WHY THIS EXISTS: KEYONE already records LLM usage (ProviderUsage), event
// counters (MetricEvent) and a WhatsApp send ledger (WaMessage), but nothing
// rolls them up PER MERCHANT into a single cost/latency/delivery view. This
// module attributes, read-only and bounded:
//   - LLM token spend (input/output) + an estimated USD cost
//   - LLM call volume, failure rate, and AVERAGE latency
//   - WhatsApp send success / failure rate
//   - per-merchant WhatsApp message volume (outbound + inbound)
//
// It is the de-risking layer for everything else in the infra domain: once a
// regression makes a merchant's cost spike or send-success drop, it shows up
// here. Read-only: no sends, no drains, no mutations. Reuses existing tables;
// NO schema change.
//
// HONEST LATENCY NOTE: ProviderUsage coalesces per-call latency into a daily
// SUM + call COUNT (lib/metrics.ts). That yields a faithful *average*
// (sum / calls) but NOT a true p95 — per-call samples are not retained. We
// surface avgLatencyMs and are explicit about it rather than fabricate a
// percentile from an aggregate.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db";

// WhatsApp statuses that count as a successful send (past the gateway).
const WA_SENT_STATUSES = ["sent", "delivered", "read"] as const;
const WA_FAILED_STATUSES = ["failed", "expired"] as const;

// ---------------------------------------------------------------------------
// Estimated LLM pricing — USD per 1K tokens (input / output).
//
// These are ROUGH public list-price estimates (early 2026) used only to give
// the operator a relative cost signal between merchants/providers. They are
// intentionally override-able: set KEYONE_PROVIDER_PRICES_JSON to a JSON map
// like {"openai":{"in":0.005,"out":0.015}} to replace any entry. `keyone`
// (own infrastructure) is not billed per-token, so it defaults to 0.
// ---------------------------------------------------------------------------
type Price = { in: number; out: number };

const DEFAULT_PRICES: Record<string, Price> = {
  keyone: { in: 0, out: 0 }, // own model — not metered per token
  openai: { in: 0.005, out: 0.015 },
  claude: { in: 0.003, out: 0.015 },
  gemini: { in: 0.00125, out: 0.005 },
  groq: { in: 0.0005, out: 0.0008 },
  openrouter: { in: 0.002, out: 0.006 },
};

function loadPrices(): Record<string, Price> {
  const raw = process.env.KEYONE_PROVIDER_PRICES_JSON;
  if (!raw) return DEFAULT_PRICES;
  try {
    const override = JSON.parse(raw) as Record<string, Partial<Price>>;
    const merged: Record<string, Price> = { ...DEFAULT_PRICES };
    for (const [prov, p] of Object.entries(override)) {
      const base = merged[prov] || { in: 0, out: 0 };
      merged[prov] = {
        in: typeof p.in === "number" ? p.in : base.in,
        out: typeof p.out === "number" ? p.out : base.out,
      };
    }
    return merged;
  } catch {
    return DEFAULT_PRICES;
  }
}

function priceFor(prices: Record<string, Price>, provider: string): Price {
  return prices[(provider || "").toLowerCase()] || { in: 0, out: 0 };
}

/** Estimated USD for a provider's token counts. Rounded to 4 decimals. */
function estUsd(prices: Record<string, Price>, provider: string, inTok: number, outTok: number): number {
  const p = priceFor(prices, provider);
  const usd = (inTok / 1000) * p.in + (outTok / 1000) * p.out;
  return Math.round(usd * 10_000) / 10_000;
}

export interface TenantCostRow {
  userId: string;
  email: string;
  name: string | null;
  // ---- LLM ----
  llmCalls: number;
  llmFailures: number;
  llmFailRatePct: number; // failures / calls * 100
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number; // totalLatencyMs / calls (honest avg; not p95)
  estUsd: number; // estimated, provider-priced
  providers: string[]; // distinct providers used in window
  // ---- WhatsApp delivery ----
  waSent: number;
  waFailed: number;
  waOutboundTotal: number;
  sendSuccessRatePct: number | null; // sent / (sent+failed); null when no sends
  // ---- Volume ----
  outboundMessages: number; // WaMessage direction=outbound
  inboundMessages: number; // WaMessage direction=inbound (Meta webhooks)
}

export interface TenantCostsResult {
  generatedAt: string;
  days: number;
  sinceDay: string; // YYYY-MM-DD (UTC) window start
  pricesConfigured: boolean; // true when KEYONE_PROVIDER_PRICES_JSON overrides defaults
  totals: {
    merchants: number; // merchants with ANY activity in window
    llmCalls: number;
    llmFailures: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estUsd: number;
    waSent: number;
    waFailed: number;
    outboundMessages: number;
    inboundMessages: number;
    avgLatencyMs: number; // platform-wide weighted avg
    sendSuccessRatePct: number | null;
  };
  rows: TenantCostRow[]; // sorted by estUsd desc, then totalTokens desc
}

/** UTC day key N days ago — "YYYY-MM-DD". Inclusive window start. */
function sinceDayKey(days: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - (days - 1)); // include today → N distinct days
  return d.toISOString().slice(0, 10);
}

/**
 * Compute per-merchant cost & performance over a trailing window (default 30d,
 * commonly 7 or 30). Bounded: each query is a single grouped aggregate over
 * indexed columns. Read-only.
 */
export async function getTenantCosts(
  opts: { days?: number; now?: Date } = {},
): Promise<TenantCostsResult> {
  const now = opts.now ?? new Date();
  const days = Math.max(1, Math.min(90, opts.days ?? 30));
  const sinceDay = sinceDayKey(days, now);
  const sinceDate = new Date(now.getTime() - days * 86_400_000);
  const prices = loadPrices();
  const pricesConfigured = !!process.env.KEYONE_PROVIDER_PRICES_JSON;

  // Each section catches its own error and degrades to empty — this function
  // MUST NOT throw (it backs an admin view + an internal monitoring endpoint).
  const [provRows, waOutRows, waInRows, users] = await Promise.all([
    // LLM usage grouped by (userId, provider) so pricing stays provider-accurate.
    (prisma as any).providerUsage
      ?.groupBy({
        by: ["userId", "provider"],
        where: { day: { gte: sinceDay } },
        _sum: {
          calls: true,
          failures: true,
          inputTokens: true,
          outputTokens: true,
          totalLatencyMs: true,
        },
      })
      .catch(() => []) ?? [],
    // Outbound WA ledger grouped by (userId, status).
    prisma.waMessage
      .groupBy({
        by: ["userId", "status"],
        where: { direction: "outbound", queuedAt: { gte: sinceDate } },
        _count: { _all: true },
      })
      .catch(() => [] as any[]),
    // Inbound WA volume grouped by userId.
    prisma.waMessage
      .groupBy({
        by: ["userId"],
        where: { direction: "inbound", queuedAt: { gte: sinceDate } },
        _count: { _all: true },
      })
      .catch(() => [] as any[]),
    // Merchant identity (id → email/name). Bounded: platform merchant count.
    prisma.user
      .findMany({ select: { id: true, email: true, name: true } })
      .catch(() => [] as { id: string; email: string; name: string | null }[]),
  ]);

  const userMeta = new Map<string, { email: string; name: string | null }>();
  for (const u of users as any[]) userMeta.set(u.id, { email: u.email, name: u.name });

  // ---- Fold LLM rows per merchant ----
  type Acc = TenantCostRow;
  const byUser = new Map<string, Acc>();

  function ensure(userId: string): Acc {
    let r = byUser.get(userId);
    if (!r) {
      const m = userMeta.get(userId);
      r = {
        userId,
        email: m?.email ?? "(unknown)",
        name: m?.name ?? null,
        llmCalls: 0,
        llmFailures: 0,
        llmFailRatePct: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        avgLatencyMs: 0,
        estUsd: 0,
        providers: [],
        waSent: 0,
        waFailed: 0,
        waOutboundTotal: 0,
        sendSuccessRatePct: null,
        outboundMessages: 0,
        inboundMessages: 0,
      };
      byUser.set(userId, r);
    }
    return r;
  }

  // Track latency sums separately so we can compute weighted averages at the end.
  const latencySum = new Map<string, number>();

  for (const g of provRows as any[]) {
    const userId = g.userId as string;
    if (!userId || userId === "*") continue; // "*" = global, not a merchant
    const provider = (g.provider as string) || "";
    const calls = g._sum?.calls || 0;
    const failures = g._sum?.failures || 0;
    const inTok = g._sum?.inputTokens || 0;
    const outTok = g._sum?.outputTokens || 0;
    const latMs = g._sum?.totalLatencyMs || 0;

    const r = ensure(userId);
    r.llmCalls += calls;
    r.llmFailures += failures;
    r.inputTokens += inTok;
    r.outputTokens += outTok;
    r.totalTokens += inTok + outTok;
    r.estUsd = Math.round((r.estUsd + estUsd(prices, provider, inTok, outTok)) * 10_000) / 10_000;
    if (provider && !r.providers.includes(provider)) r.providers.push(provider);
    latencySum.set(userId, (latencySum.get(userId) || 0) + latMs);
  }

  // ---- Fold outbound WA status counts ----
  for (const g of waOutRows as any[]) {
    const userId = g.userId as string;
    if (!userId) continue;
    const status = (g.status as string) || "";
    const count = g._count?._all || 0;
    const r = ensure(userId);
    r.outboundMessages += count;
    r.waOutboundTotal += count;
    if ((WA_SENT_STATUSES as readonly string[]).includes(status)) r.waSent += count;
    else if ((WA_FAILED_STATUSES as readonly string[]).includes(status)) r.waFailed += count;
  }

  // ---- Fold inbound WA volume ----
  for (const g of waInRows as any[]) {
    const userId = g.userId as string;
    if (!userId) continue;
    const count = g._count?._all || 0;
    const r = ensure(userId);
    r.inboundMessages += count;
  }

  // ---- Finalize derived fields ----
  for (const [userId, r] of byUser) {
    r.llmFailRatePct = r.llmCalls > 0 ? Math.round((r.llmFailures / r.llmCalls) * 1000) / 10 : 0;
    r.avgLatencyMs = r.llmCalls > 0 ? Math.round((latencySum.get(userId) || 0) / r.llmCalls) : 0;
    const decided = r.waSent + r.waFailed;
    r.sendSuccessRatePct = decided > 0 ? Math.round((r.waSent / decided) * 1000) / 10 : null;
    r.providers.sort();
  }

  const rows = Array.from(byUser.values()).sort(
    (a, b) => b.estUsd - a.estUsd || b.totalTokens - a.totalTokens || b.outboundMessages - a.outboundMessages,
  );

  // ---- Platform totals ----
  let tCalls = 0,
    tFail = 0,
    tIn = 0,
    tOut = 0,
    tUsd = 0,
    tSent = 0,
    tWaFail = 0,
    tOutbound = 0,
    tInbound = 0,
    tLatency = 0;
  for (const [userId, r] of byUser) {
    tCalls += r.llmCalls;
    tFail += r.llmFailures;
    tIn += r.inputTokens;
    tOut += r.outputTokens;
    tUsd += r.estUsd;
    tSent += r.waSent;
    tWaFail += r.waFailed;
    tOutbound += r.outboundMessages;
    tInbound += r.inboundMessages;
    tLatency += latencySum.get(userId) || 0;
  }
  const tDecided = tSent + tWaFail;

  return {
    generatedAt: now.toISOString(),
    days,
    sinceDay,
    pricesConfigured,
    totals: {
      merchants: byUser.size,
      llmCalls: tCalls,
      llmFailures: tFail,
      inputTokens: tIn,
      outputTokens: tOut,
      totalTokens: tIn + tOut,
      estUsd: Math.round(tUsd * 10_000) / 10_000,
      waSent: tSent,
      waFailed: tWaFail,
      outboundMessages: tOutbound,
      inboundMessages: tInbound,
      avgLatencyMs: tCalls > 0 ? Math.round(tLatency / tCalls) : 0,
      sendSuccessRatePct: tDecided > 0 ? Math.round((tSent / tDecided) * 1000) / 10 : null,
    },
    rows,
  };
}
