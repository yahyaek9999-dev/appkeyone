// AI Intelligence Layer — Self-Learning loop (read-only outcome aggregation).
//
// THE GAP THIS CLOSES (see audit): FollowUpTask already records repliedAt,
// convertedAt, revenueImpact and a `kind`; Broadcast records A/B variants. None
// of this data is consumed anywhere. This module reads it and produces:
//   • per-follow-up-kind performance (sent / replied / converted / revenue),
//   • a learned priority weight per kind (reply×convert lift vs. baseline), and
//   • an A/B winner WITH a statistical-significance guard (the existing /ab route
//     declares a winner on any difference, even 1-vs-0).
//
// It writes NOTHING. The learned weights are returned for the Revenue Copilot /
// Sales Brain to display and (optionally, later) feed into ranking. No hot-path
// change, no schema change. All queries bounded.

import { prisma } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Follow-up performance by kind
// ---------------------------------------------------------------------------

export interface KindPerformance {
  kind: string;
  sent: number;
  replied: number;
  converted: number;
  revenue: number; // EGP attributed (sum of revenueImpact)
  replyRate: number; // 0-1
  conversionRate: number; // 0-1 (converted / sent)
  // learnedWeight: a multiplier (0.5-1.5) vs. the average kind. >1 means this
  // kind over-performs and should be prioritized; <1 means de-prioritize.
  learnedWeight: number;
}

export interface SelfLearningReport {
  generatedAt: string;
  windowDays: number;
  totalSent: number;
  totalReplied: number;
  totalConverted: number;
  totalRevenue: number;
  overallReplyRate: number;
  overallConversionRate: number;
  byKind: KindPerformance[];
  bestKind: string | null;
  worstKind: string | null;
  // Confidence in the learning itself: low when the sample is small.
  sampleConfidence: "low" | "medium" | "high";
}

export async function buildSelfLearningReport(
  userId: string,
  opts: { windowDays?: number; now?: Date } = {},
): Promise<SelfLearningReport> {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 90;
  const since = new Date(now.getTime() - windowDays * DAY);

  const tasks = await (prisma as any).followUpTask
    .findMany({
      where: {
        userId,
        createdAt: { gte: since },
        status: { in: ["sent", "converted", "skipped", "failed"] },
      },
      select: {
        kind: true,
        status: true,
        sentAt: true,
        repliedAt: true,
        convertedAt: true,
        revenueImpact: true,
      },
      take: 20000,
    })
    .catch(() => [] as any[]);

  const agg = new Map<
    string,
    { sent: number; replied: number; converted: number; revenue: number }
  >();
  let totalSent = 0;
  let totalReplied = 0;
  let totalConverted = 0;
  let totalRevenue = 0;

  for (const t of tasks) {
    // Only count tasks that actually went out (sent or later converted).
    const wasSent = !!t.sentAt || t.status === "sent" || t.status === "converted";
    if (!wasSent) continue;
    const kind = String(t.kind || "unknown");
    let row = agg.get(kind);
    if (!row) {
      row = { sent: 0, replied: 0, converted: 0, revenue: 0 };
      agg.set(kind, row);
    }
    row.sent++;
    totalSent++;
    if (t.repliedAt) {
      row.replied++;
      totalReplied++;
    }
    if (t.convertedAt || t.status === "converted") {
      row.converted++;
      totalConverted++;
    }
    const rev = Number(t.revenueImpact || 0);
    if (rev > 0) {
      row.revenue += rev;
      totalRevenue += rev;
    }
  }

  const overallReplyRate = totalSent > 0 ? totalReplied / totalSent : 0;
  const overallConversionRate = totalSent > 0 ? totalConverted / totalSent : 0;

  // Baseline blended score per kind = reply-rate (weighted) + conversion-rate.
  // learnedWeight normalizes a kind's blended score against the global average.
  const globalBlended =
    overallReplyRate * 0.4 + overallConversionRate * 0.6 || 0.0001;

  const byKind: KindPerformance[] = Array.from(agg.entries()).map(([kind, r]) => {
    const replyRate = r.sent > 0 ? r.replied / r.sent : 0;
    const conversionRate = r.sent > 0 ? r.converted / r.sent : 0;
    const blended = replyRate * 0.4 + conversionRate * 0.6;
    // Shrink toward 1.0 when the sample is small (Bayesian-ish smoothing) so we
    // don't over-trust a kind with 2 sends.
    const raw = blended / globalBlended;
    const shrink = r.sent >= 30 ? 1 : r.sent / 30;
    const learnedWeight = clamp(1 + (raw - 1) * shrink, 0.5, 1.5);
    return {
      kind,
      sent: r.sent,
      replied: r.replied,
      converted: r.converted,
      revenue: r.revenue,
      replyRate: round2(replyRate),
      conversionRate: round2(conversionRate),
      learnedWeight: round2(learnedWeight),
    };
  });

  byKind.sort((a, b) => b.conversionRate - a.conversionRate || b.replyRate - a.replyRate);

  const ranked = byKind.filter((k) => k.sent >= 5);
  const bestKind = ranked[0]?.kind ?? null;
  const worstKind = ranked.length > 1 ? ranked[ranked.length - 1].kind : null;

  const sampleConfidence: SelfLearningReport["sampleConfidence"] =
    totalSent >= 100 ? "high" : totalSent >= 25 ? "medium" : "low";

  return {
    generatedAt: now.toISOString(),
    windowDays,
    totalSent,
    totalReplied,
    totalConverted,
    totalRevenue,
    overallReplyRate: round2(overallReplyRate),
    overallConversionRate: round2(overallConversionRate),
    byKind,
    bestKind,
    worstKind,
    sampleConfidence,
  };
}

/**
 * Convenience: return a map of kind → learnedWeight for callers that want to
 * bias follow-up priority. Never throws; empty map on any failure. Read-only.
 */
export async function getLearnedKindWeights(
  userId: string,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  try {
    const report = await buildSelfLearningReport(userId, { now });
    const out: Record<string, number> = {};
    for (const k of report.byKind) out[k.kind] = k.learnedWeight;
    return out;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Cached weight accessor — for the follow-up queue path.
//
// queueSmartFollowUp runs in the incoming-message background tail; computing the
// learned weights there means an aggregate scan over FollowUpTask. We memoize
// the per-user weight map for a short TTL so a burst of inbound messages (the
// common case) shares ONE query instead of N. Read-only; an empty map (its
// default) means weights have no effect, so a cold/failed cache is harmless.
// ---------------------------------------------------------------------------

const WEIGHT_TTL_MS = 2 * 60 * 1000; // 2 min — weights change slowly
const _weightCache = new Map<string, { at: number; weights: Record<string, number> }>();

export async function getLearnedKindWeightsCached(
  userId: string,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  const nowMs = now.getTime();
  const hit = _weightCache.get(userId);
  if (hit && nowMs - hit.at < WEIGHT_TTL_MS) return hit.weights;
  const weights = await getLearnedKindWeights(userId, now);
  _weightCache.set(userId, { at: nowMs, weights });
  // Bound the cache so a many-tenant process can't grow it without limit.
  if (_weightCache.size > 5000) {
    const cutoff = nowMs - WEIGHT_TTL_MS;
    for (const [k, v] of _weightCache) if (v.at < cutoff) _weightCache.delete(k);
  }
  return weights;
}

// ---------------------------------------------------------------------------
// A/B significance guard.
//
// The existing /api/broadcasts/ab/[groupId] route picks the higher rate as the
// winner with no sample-size or significance test — so it declares a "winner"
// on 1 reply vs 0. This helper exposes a two-proportion z-test so callers can
// gate that decision on real significance (≈95% → |z| ≥ 1.96).
// ---------------------------------------------------------------------------

export interface AbVariantStat {
  variant: string; // "A" | "B"
  sent: number;
  successes: number; // replies or conversions
}

export interface AbSignificanceResult {
  winner: string | null; // null = no significant winner yet
  significant: boolean;
  zScore: number;
  confidence: number; // 0-1 (two-sided)
  rateA: number;
  rateB: number;
  reason: string; // Arabic explanation for the merchant
}

export function evaluateAbSignificance(
  a: AbVariantStat,
  b: AbVariantStat,
): AbSignificanceResult {
  const nA = Math.max(0, a.sent);
  const nB = Math.max(0, b.sent);
  const rateA = nA > 0 ? a.successes / nA : 0;
  const rateB = nB > 0 ? b.successes / nB : 0;

  // Minimum sample guard — never call a winner on tiny samples regardless of z.
  const MIN_PER_VARIANT = 20;
  if (nA < MIN_PER_VARIANT || nB < MIN_PER_VARIANT) {
    return {
      winner: null,
      significant: false,
      zScore: 0,
      confidence: 0,
      rateA: round2(rateA),
      rateB: round2(rateB),
      reason: `العيّنة صغيرة (A=${nA}، B=${nB}) — محتاج ${MIN_PER_VARIANT}+ لكل نسخة قبل إعلان فائز موثوق.`,
    };
  }

  // Two-proportion z-test (pooled).
  const pPool = (a.successes + b.successes) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  const z = se > 0 ? (rateA - rateB) / se : 0;
  const absZ = Math.abs(z);
  const confidence = twoSidedConfidence(absZ);
  const significant = absZ >= 1.96; // ~95%

  let winner: string | null = null;
  if (significant) winner = rateA > rateB ? a.variant : b.variant;

  return {
    winner,
    significant,
    zScore: round2(z),
    confidence: round2(confidence),
    rateA: round2(rateA),
    rateB: round2(rateB),
    reason: significant
      ? `النسخة ${winner} أفضل بدلالة إحصائية (ثقة ${Math.round(confidence * 100)}%).`
      : `الفرق بين النسختين غير مؤكد إحصائياً بعد (ثقة ${Math.round(confidence * 100)}% فقط) — استمر في التجربة.`,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Two-sided normal CDF confidence from |z|, via Abramowitz-Stegun erf approx.
function twoSidedConfidence(absZ: number): number {
  // P(|Z| < z) = erf(z / sqrt(2))
  return clamp(erf(absZ / Math.SQRT2), 0, 1);
}

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 — max error 1.5e-7.
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return y;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
