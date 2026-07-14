// AI Intelligence Layer — Revenue Copilot (unified opportunity ranking).
//
// THE GAP THIS CLOSES (see audit): KEYONE has four separate intel detectors
// (hot-leads, lost-customers, upsell, follow-up-ops) on four tabs, and only
// upsell attaches a money value. A merchant has to triage four lists with no
// global priority. This module produces ONE ranked worklist where every item
// has: a unified Next Best Action, a confidence, an ESTIMATED EGP value, and a
// single priority score — so the merchant works the highest-revenue moves first.
//
// It REUSES the existing scores on the Customer row (written by the pipeline)
// and the order facts from getOrderRollup(). It recomputes nothing on the hot
// path and writes nothing. One bounded query + pure derivation.

import { prisma } from "@/lib/db";
import { getOrderRollup } from "@/lib/analytics/order-rollup";
import { readNegotiation } from "@/lib/sales-engine";
import { resolveBusinessContext } from "@/lib/business-context";
import { decideNextBestAction } from "./next-best-action";
import { classifyValueTier, valueTierWeight } from "./value-tier";
import { computeChurnProbability } from "./churn";
import { recommendProduct } from "./product-recs";
import { getLearnedKindWeightsCached } from "./self-learning";
import { intelFlag } from "./flags";
import type { NbaAction, RevenueOpportunity, ValueTier } from "./types";

// Maps an NBA action to the closest FollowUpTask "kind" so the SAME learned
// weights (lib/intelligence/self-learning.ts, today only consumed by
// lib/follow-ups.ts) also bias this worklist's ordering — extending the
// self-learning loop to a second surface instead of leaving it single-purpose.
// Actions with no reasonable analogue (escalate) are left unweighted.
const ACTION_TO_FOLLOWUP_KIND: Partial<Record<NbaAction, string>> = {
  close_now: "pending_order",
  answer_fast: "pending_order",
  build_trust: "hesitation_recovery",
  reduce_friction: "hesitation_recovery",
  offer_value: "price_question",
  upsell: "product_view",
  win_back: "abandoned_conversation",
  nudge_followup: "abandoned_conversation",
  nurture: "abandoned_conversation",
};

const DAY = 24 * 60 * 60 * 1000;

export interface RevenueCopilotResult {
  generatedAt: string;
  // headline numbers
  opportunityCount: number;
  totalPipelineValue: number; // sum of estimatedValue over all opportunities (EGP)
  highConfidenceValue: number; // sum where confidence >= 60
  // tier distribution of the opportunity list
  tierCounts: Record<ValueTier, number>;
  // the ranked worklist
  opportunities: RevenueOpportunity[];
}

export async function buildRevenueCopilot(
  userId: string,
  opts: { now?: Date; limit?: number } = {},
): Promise<RevenueCopilotResult> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 60;
  const since = new Date(now.getTime() - 60 * DAY);

  // Order facts (true revenue / AOV / per-customer) — same source the profile
  // and analytics use. Bounded internally.
  const rollup = await getOrderRollup(userId, { now });
  const aov = rollup.totals.aov || 0;

  // Business-type module gate (once). Only used to suppress product-framed NBA
  // (the "upsell a complement" branch). Fail-safe: any error → products ON so
  // existing Store tenants keep byte-identical output.
  let productsEnabled = true;
  try {
    productsEnabled = (await resolveBusinessContext(userId)).modules.products;
  } catch {
    productsEnabled = true;
  }

  // Same self-learning weights lib/follow-ups.ts already applies to its queue —
  // fetched once per run, fail-open (empty map → every lookup below is a no-op).
  let learnedWeights: Record<string, number> = {};
  if (intelFlag("INTEL_LEARNED_FOLLOWUP_WEIGHTS")) {
    learnedWeights = await getLearnedKindWeightsCached(userId).catch(() => ({}));
  }

  // Active-ish customers in the last 60d OR any customer with intelligence
  // signal. Bounded to keep this fast for big accounts.
  const customers = await prisma.customer.findMany({
    where: {
      userId,
      blacklisted: false,
      archivedAt: null,
      optedOutAt: null,
      OR: [
        { lastSeenAt: { gte: since } },
        { leadScore: { gte: 40 } as any },
        { churnRiskScore: { gte: 40 } as any },
      ],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 600,
    select: {
      id: true,
      name: true,
      phone: true,
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
            select: { role: true, createdAt: true },
          },
        },
      },
    },
  });

  const opportunities: RevenueOpportunity[] = [];
  const tierCounts: Record<ValueTier, number> = {
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    lead: 0,
  };

  for (const c of customers) {
    const stats = rollup.byCustomer.get(c.id);
    const revenue = stats?.revenue || 0;
    const orderCount = stats?.orders || c.orderCount || 0;
    const lastOrderAt = stats?.lastOrderAt || null;
    const daysSinceLastOrder = lastOrderAt
      ? Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY)
      : null;

    const lastInbound = c.lastInboundAt || c.lastSeenAt;
    const daysSinceLastInbound = lastInbound
      ? Math.floor((now.getTime() - new Date(lastInbound).getTime()) / DAY)
      : 999;

    const lastMsg = c.conversation?.messages?.[0];
    const awaitingReply = !!lastMsg && lastMsg.role === "user";

    const valueTier = classifyValueTier({
      revenue,
      orderCount,
      daysSinceLastOrder,
      leadScore: c.leadScore || 0,
    });
    tierCounts[valueTier]++;

    // Objection + negotiation context from memory facts (read-only).
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
      const neg = readNegotiation(facts);
      discountAsks = neg.discountAsks || 0;
    } catch {}

    // Computed churn probability — the stored churnRiskScore is often
    // unmaintained (0), so we derive a live value from recency/engagement and
    // blend in the stored score when present. Used by the NBA win-back/escalate
    // branches and surfaced on the row.
    const churnProbability = computeChurnProbability({
      churnRiskScore: c.churnRiskScore || 0,
      retentionScore: c.retentionScore ?? 50,
      loyaltyScore: c.loyaltyScore || 0,
      daysSinceLastInbound,
      orderCount,
      hesitationScore: c.hesitationScore || 0,
    });

    // Cheap pre-check mirroring the NBA "upsell" branch's own conditions —
    // only fetch a product recommendation for customers likely to land there,
    // so this stays a bounded, small-subset lookup rather than N+1 over 600 rows.
    let recommendedProduct = null as Awaited<ReturnType<typeof recommendProduct>>;
    if (
      productsEnabled &&
      orderCount >= 1 &&
      daysSinceLastInbound <= 7 &&
      churnProbability < 40 &&
      (c.lastIntent || "").toLowerCase() !== "complaint"
    ) {
      recommendedProduct = await recommendProduct(userId, c.id);
    }

    const nba = decideNextBestAction({
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
      orderCount,
      daysSinceLastInbound,
      awaitingReply,
      valueTier,
      objections,
      discountAsks,
      productsEnabled,
      recommendedProduct,
    });

    // Skip non-actionable items from the worklist (but they still counted in
    // tier distribution above).
    if (nba.action === "hold") continue;

    const estimatedValue = estimateOpportunityValue({
      action: nba.action,
      confidence: nba.confidence,
      aov,
      customerRevenue: revenue,
      orderCount,
      valueTier,
    });

    // Bias priority toward action kinds that historically reply/convert better
    // for this merchant — advisory ordering only, never changes what action is
    // suggested or whether/how a message is sent (still merchant-copy-paste).
    const followUpKind = ACTION_TO_FOLLOWUP_KIND[nba.action];
    const learnedWeight = followUpKind ? learnedWeights[followUpKind] : undefined;
    const weightedPriority =
      typeof learnedWeight === "number" && isFinite(learnedWeight) && learnedWeight > 0
        ? Math.round(Math.max(1, Math.min(100, blendPriority(nba.priority, estimatedValue, aov) * learnedWeight)))
        : blendPriority(nba.priority, estimatedValue, aov);

    opportunities.push({
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      action: nba.action,
      title: nba.title,
      reason: nba.reason,
      suggestedMessage: nba.suggestedMessage,
      confidence: nba.confidence,
      estimatedValue,
      // Global priority = NBA priority, lightly boosted by expected value so two
      // equally-urgent moves are ordered by the money on the table, then biased
      // by the self-learning loop's learned kind weights (see above).
      priority: weightedPriority,
      valueTier,
      leadScore: c.leadScore || 0,
      conversionScore: c.conversionScore || 0,
      churnRiskScore: churnProbability,
      daysSinceLastInbound,
    });
  }

  opportunities.sort((a, b) => b.priority - a.priority);
  const top = opportunities.slice(0, limit);

  const totalPipelineValue = top.reduce((s, o) => s + o.estimatedValue, 0);
  const highConfidenceValue = top
    .filter((o) => o.confidence >= 60)
    .reduce((s, o) => s + o.estimatedValue, 0);

  return {
    generatedAt: now.toISOString(),
    opportunityCount: top.length,
    totalPipelineValue,
    highConfidenceValue,
    tierCounts,
    opportunities: top,
  };
}

// Estimated EGP value of acting on this opportunity. Grounded in the merchant's
// real AOV and the customer's tier; scaled by the action type's expected close
// likelihood and the NBA confidence. Conservative by design — it's a triage
// aid, not an accounting figure.
function estimateOpportunityValue(args: {
  action: string;
  confidence: number;
  aov: number;
  customerRevenue: number;
  orderCount: number;
  valueTier: ValueTier;
}): number {
  const baseAov = args.aov > 0 ? args.aov : 500; // fallback baseline EGP
  // For repeat buyers, their own historical AOV is a better predictor.
  const customerAov =
    args.orderCount > 0 ? Math.round(args.customerRevenue / args.orderCount) : 0;
  const ticket = Math.max(baseAov, customerAov) * valueTierWeight(args.valueTier);

  // Action-specific expected fraction of a full ticket.
  const ACTION_TICKET_FRACTION: Record<string, number> = {
    close_now: 1.0,
    answer_fast: 0.85,
    upsell: 0.45, // a complement is a fraction of the main ticket
    win_back: 0.9,
    build_trust: 0.7,
    offer_value: 0.7,
    reduce_friction: 0.6,
    nudge_followup: 0.4,
    escalate: 0.5, // retained revenue, not new
    nurture: 0.15,
    hold: 0,
  };
  const frac = ACTION_TICKET_FRACTION[args.action] ?? 0.3;

  // Expected value = ticket × action-fraction × confidence.
  const ev = ticket * frac * (args.confidence / 100);
  return Math.round(ev);
}

function blendPriority(nbaPriority: number, estimatedValue: number, aov: number): number {
  // Normalize value to 0-100 against ~3× AOV so a big-ticket move floats up.
  const cap = Math.max(1, (aov || 500) * 3);
  const valueScore = Math.min(100, (estimatedValue / cap) * 100);
  return Math.round(Math.max(0, Math.min(100, nbaPriority * 0.7 + valueScore * 0.3)));
}
