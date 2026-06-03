// AI Intelligence Layer — Customer Twin / lookalike engine (Agent 1 — Task 2).
//
// THE GAP THIS CLOSES (see audit #2): KEYONE scores every customer on the same
// vector (lead / conversion / hesitation / churn / value-tier / intent) but never
// uses those vectors RELATIONALLY. A merchant looking at one customer can't see
// "customers who looked like this one closed by doing X, N% of the time."
//
// This module, given a target customer, finds the K nearest PAST customers of the
// SAME merchant over the normalized score vector (cosine similarity, bounded scan
// to the most recent N candidates), then aggregates their outcomes from the order
// facts getOrderRollup() already derives: how many closed, the avg order value of
// the closers, and the single NBA action that most often preceded a close.
//
// Strictly per-tenant (never cross-merchant), read-only, bounded, fail-closed.
// It REUSES decideNextBestAction (the existing engine) to label each twin's
// recommended move — it invents no new score.

import { prisma } from "@/lib/db";
import { getOrderRollup } from "@/lib/analytics/order-rollup";
import { readNegotiation } from "@/lib/sales-engine";
import { decideNextBestAction } from "./next-best-action";
import { classifyValueTier } from "./value-tier";
import { computeChurnProbability } from "./churn";
import { nbaActionLabel } from "./next-best-action";
import type { NbaAction, ValueTier } from "./types";

const DAY = 24 * 60 * 60 * 1000;

// The score vector we compare customers on. Each entry is already 0-100 on the
// Customer row, so normalizing to 0-1 is a /100. Order matters only for cosine.
const VECTOR_KEYS = [
  "leadScore",
  "conversionScore",
  "hesitationScore",
  "churnRiskScore",
  "loyaltyScore",
  "purchaseProb",
] as const;

type VectorKey = (typeof VECTOR_KEYS)[number];
type ScoreVector = Record<VectorKey, number>;

export interface TwinNeighbor {
  customerId: string;
  customerName: string | null;
  similarity: number; // 0-1 cosine
  closed: boolean; // had ≥1 non-canceled order
  orderValue: number; // their revenue (EGP)
  precedingAction: NbaAction; // NBA action their current vector implies
}

export interface CustomerTwinResult {
  generatedAt: string;
  targetId: string;
  neighborsConsidered: number; // size of the bounded candidate scan
  neighborsMatched: number; // K actually returned
  closedRate: number; // 0-1 across matched neighbors
  avgClosedOrderValue: number; // EGP, avg over the closers
  // The single action that most often preceded a close among similar customers.
  predictedAction: NbaAction | null;
  predictedActionLabel: string | null;
  predictedActionCloseRate: number; // 0-1 — of twins with this action, how many closed
  // Short Arabic merchant-facing line, e.g.
  // "عملاء مثل هذا أغلقوا بإجراء «اعرض القيمة» بنسبة 64%".
  headline: string | null;
  neighbors: TwinNeighbor[];
}

function vectorOf(c: any): ScoreVector {
  return {
    leadScore: clamp01((c.leadScore || 0) / 100),
    conversionScore: clamp01((c.conversionScore || 0) / 100),
    hesitationScore: clamp01((c.hesitationScore || 0) / 100),
    churnRiskScore: clamp01((c.churnRiskScore || 0) / 100),
    loyaltyScore: clamp01((c.loyaltyScore || 0) / 100),
    purchaseProb: clamp01((c.purchaseProb || 0) / 100),
  };
}

function cosine(a: ScoreVector, b: ScoreVector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of VECTOR_KEYS) {
    dot += a[k] * b[k];
    na += a[k] * a[k];
    nb += b[k] * b[k];
  }
  if (na === 0 || nb === 0) return 0; // a zero vector has no meaningful direction
  return clamp01(dot / (Math.sqrt(na) * Math.sqrt(nb)));
}

// The NBA action a candidate's CURRENT vector implies — reuses the real engine so
// the "what worked" label is consistent with the rest of the product. We only need
// the action here, so we pass a minimal but faithful input set.
function actionForCandidate(
  c: any,
  ctx: { revenue: number; orderCount: number; daysSinceLastOrder: number | null; daysSinceLastInbound: number; awaitingReply: boolean; valueTier: ValueTier },
): NbaAction {
  let objections: any = {};
  let discountAsks = 0;
  try {
    const facts = JSON.parse(c.memory?.factsJson || "{}");
    const objArr: string[] = Array.isArray(facts.objections) ? facts.objections : [];
    objections = {
      price: objArr.includes("price"),
      trust: objArr.includes("trust"),
      shipping: objArr.includes("shipping"),
      quality: objArr.includes("quality"),
    };
    discountAsks = readNegotiation(facts).discountAsks || 0;
  } catch {}

  const churnProbability = computeChurnProbability({
    churnRiskScore: c.churnRiskScore || 0,
    retentionScore: c.retentionScore ?? 50,
    loyaltyScore: c.loyaltyScore || 0,
    daysSinceLastInbound: ctx.daysSinceLastInbound,
    orderCount: ctx.orderCount,
    hesitationScore: c.hesitationScore || 0,
  });

  return decideNextBestAction({
    customerName: c.name,
    leadScore: c.leadScore || 0,
    conversionScore: c.conversionScore || 0,
    hesitationScore: c.hesitationScore || 0,
    churnRiskScore: churnProbability,
    loyaltyScore: c.loyaltyScore || 0,
    purchaseProb: c.purchaseProb || 0,
    frustrationScore: c.frustrationScore || 0,
    lastIntent: c.lastIntent,
    lastSentiment: c.lastSentiment,
    orderCount: ctx.orderCount,
    daysSinceLastInbound: ctx.daysSinceLastInbound,
    awaitingReply: ctx.awaitingReply,
    valueTier: ctx.valueTier,
    objections,
    discountAsks,
  }).action;
}

export async function buildCustomerTwin(
  userId: string,
  targetCustomerId: string,
  opts: { now?: Date; k?: number; scanLimit?: number; minSimilarity?: number } = {},
): Promise<CustomerTwinResult | null> {
  const now = opts.now ?? new Date();
  const k = opts.k ?? 12;
  const scanLimit = opts.scanLimit ?? 500;
  const minSimilarity = opts.minSimilarity ?? 0.6;

  // Target — per-tenant scoped. If missing, nothing to do.
  const target: any = await prisma.customer.findFirst({
    where: { id: targetCustomerId, userId },
    select: {
      id: true,
      leadScore: true,
      conversionScore: true,
      hesitationScore: true,
      churnRiskScore: true,
      loyaltyScore: true,
      purchaseProb: true,
    },
  });
  if (!target) return null;

  const targetVec = vectorOf(target);

  // Candidate pool: the most-recent `scanLimit` OTHER customers of THIS merchant.
  // Bounded scan keeps this sub-300ms even for large accounts. Per-tenant only.
  const candidates: any[] = await prisma.customer.findMany({
    where: {
      userId,
      id: { not: targetCustomerId },
      blacklisted: false,
      archivedAt: null,
    },
    orderBy: { lastSeenAt: "desc" },
    take: scanLimit,
    select: {
      id: true,
      name: true,
      leadScore: true,
      conversionScore: true,
      hesitationScore: true,
      churnRiskScore: true,
      loyaltyScore: true,
      retentionScore: true,
      purchaseProb: true,
      frustrationScore: true,
      lastIntent: true,
      lastSentiment: true,
      lastInboundAt: true,
      lastSeenAt: true,
      orderCount: true,
      memory: { select: { factsJson: true } },
      conversation: {
        select: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { role: true },
          },
        },
      },
    },
  });

  // Order facts for outcome aggregation (true revenue per customer).
  const rollup = await getOrderRollup(userId, { now });

  // Score every candidate by cosine to the target vector; keep the top-K above
  // the similarity floor.
  const scored = candidates
    .map((c) => ({ c, sim: cosine(targetVec, vectorOf(c)) }))
    .filter((x) => x.sim >= minSimilarity)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);

  const neighbors: TwinNeighbor[] = [];
  // action → { total, closed } for the "which action precedes a close" tally.
  const actionTally = new Map<NbaAction, { total: number; closed: number }>();
  let closedCount = 0;
  let closedValueSum = 0;

  for (const { c, sim } of scored) {
    const stats = rollup.byCustomer.get(c.id);
    const revenue = stats?.revenue || 0;
    const orderCount = stats?.orders || c.orderCount || 0;
    const closed = orderCount > 0;
    const lastOrderAt = stats?.lastOrderAt || null;
    const daysSinceLastOrder = lastOrderAt
      ? Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY)
      : null;
    const lastInbound = c.lastInboundAt || c.lastSeenAt;
    const daysSinceLastInbound = lastInbound
      ? Math.floor((now.getTime() - new Date(lastInbound).getTime()) / DAY)
      : 999;
    const awaitingReply = c.conversation?.messages?.[0]?.role === "user";
    const valueTier = classifyValueTier({
      revenue,
      orderCount,
      daysSinceLastOrder,
      leadScore: c.leadScore || 0,
    });

    const precedingAction = actionForCandidate(c, {
      revenue,
      orderCount,
      daysSinceLastOrder,
      daysSinceLastInbound,
      awaitingReply,
      valueTier,
    });

    const t = actionTally.get(precedingAction) || { total: 0, closed: 0 };
    t.total++;
    if (closed) t.closed++;
    actionTally.set(precedingAction, t);

    if (closed) {
      closedCount++;
      closedValueSum += revenue;
    }

    neighbors.push({
      customerId: c.id,
      customerName: c.name,
      similarity: round2(sim),
      closed,
      orderValue: revenue,
      precedingAction,
    });
  }

  const matched = neighbors.length;
  const closedRate = matched > 0 ? closedCount / matched : 0;
  const avgClosedOrderValue = closedCount > 0 ? Math.round(closedValueSum / closedCount) : 0;

  // Predicted action = the action with the highest close rate among twins, with a
  // minimum support of 2 so a single closer can't dominate. Tiebreak on volume.
  let predictedAction: NbaAction | null = null;
  let predictedActionCloseRate = 0;
  let bestSupport = 0;
  for (const [action, t] of actionTally) {
    if (t.total < 2) continue;
    const rate = t.closed / t.total;
    if (rate > predictedActionCloseRate || (rate === predictedActionCloseRate && t.total > bestSupport)) {
      predictedAction = action;
      predictedActionCloseRate = rate;
      bestSupport = t.total;
    }
  }

  const headline =
    predictedAction && predictedActionCloseRate > 0 && matched >= 3
      ? `عملاء مثل هذا أغلقوا بإجراء «${nbaActionLabel(predictedAction)}» بنسبة ${Math.round(
          predictedActionCloseRate * 100,
        )}%.`
      : matched >= 3 && closedRate > 0
        ? `${Math.round(closedRate * 100)}% من العملاء المشابهين أتمّوا الشراء.`
        : null;

  return {
    generatedAt: now.toISOString(),
    targetId: targetCustomerId,
    neighborsConsidered: candidates.length,
    neighborsMatched: matched,
    closedRate: round2(closedRate),
    avgClosedOrderValue,
    predictedAction,
    predictedActionLabel: predictedAction ? nbaActionLabel(predictedAction) : null,
    predictedActionCloseRate: round2(predictedActionCloseRate),
    headline,
    neighbors,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
