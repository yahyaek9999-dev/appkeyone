// Retention Engine — Phase F.
//
// Computes retention, loyalty, and churn risk scores for each customer.
// Tracks customer lifecycle stages. Provides re-engagement hints for
// follow-up campaigns and win-back automation.
//
// All computations are deterministic / rule-based. No LLM calls.
// Scores are stored on Customer model and used by analytics + follow-up.

import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

export interface RetentionInput {
  orderCount: number;
  totalOrderValue: number;         // EGP
  daysSinceLastOrder: number | null;  // null = never ordered
  daysSinceLastContact: number;
  inboundCount: number;
  sentiment: string | null | undefined;
  followUpCount: number;
  createdAt: Date;
}

/** Returns a 0-100 retention likelihood score. Higher = less likely to churn. */
export function computeRetentionScore(i: RetentionInput): number {
  let s = 50; // start neutral

  // Order history (strong signals)
  if (i.orderCount >= 1) s += 15;
  if (i.orderCount >= 3) s += 10;
  if (i.orderCount >= 7) s += 10;

  // Recent order recency
  if (i.daysSinceLastOrder !== null) {
    if (i.daysSinceLastOrder <= 7)  s += 15;
    else if (i.daysSinceLastOrder <= 30) s += 8;
    else if (i.daysSinceLastOrder > 60)  s -= 15;
    else if (i.daysSinceLastOrder > 90)  s -= 25;
  }

  // Engagement: inbound messages show investment
  if (i.inboundCount >= 10) s +=  8;
  if (i.inboundCount >= 30) s +=  7;

  // Recency of last contact
  if (i.daysSinceLastContact <= 3)  s += 10;
  else if (i.daysSinceLastContact <= 14) s +=  3;
  else if (i.daysSinceLastContact > 30)  s -= 10;
  else if (i.daysSinceLastContact > 60)  s -= 20;

  // Sentiment
  if (i.sentiment === "positive") s += 8;
  if (i.sentiment === "negative") s -= 8;
  if (i.sentiment === "angry")    s -= 20;

  // Too many follow-ups without conversion = fatigue
  if (i.followUpCount >= 3) s -= 5;
  if (i.followUpCount >= 5) s -= 10;

  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Returns a 0-100 loyalty score. */
export function computeLoyaltyScore(i: RetentionInput): number {
  let s = 0;

  // Loyalty is primarily order-based
  s += Math.min(50, i.orderCount * 10);

  // High value orders = loyal
  if (i.totalOrderValue >= 500)   s += 10;
  if (i.totalOrderValue >= 2000)  s += 15;
  if (i.totalOrderValue >= 5000)  s += 15;
  if (i.totalOrderValue >= 10000) s += 10;

  // Long-term relationship
  const daysSinceJoined = Math.max(
    0,
    (Date.now() - i.createdAt.getTime()) / 86400000,
  );
  if (daysSinceJoined >= 30)  s += 5;
  if (daysSinceJoined >= 90)  s += 5;
  if (daysSinceJoined >= 180) s += 5;

  // Positive engagement
  if (i.inboundCount >= 20) s += 5;
  if (i.sentiment === "positive") s += 5;

  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Returns a 0-100 churn risk score. Higher = more at risk. */
export function computeChurnRiskScore(i: RetentionInput): number {
  let s = 0;

  // Never ordered = at risk by default
  if (i.orderCount === 0) s += 20;

  // Long silence
  if (i.daysSinceLastContact > 60)   s += 30;
  else if (i.daysSinceLastContact > 30) s += 15;
  else if (i.daysSinceLastContact > 14) s +=  8;

  // Last order was a long time ago
  if (i.daysSinceLastOrder !== null) {
    if (i.daysSinceLastOrder > 90) s += 25;
    else if (i.daysSinceLastOrder > 60) s += 15;
    else if (i.daysSinceLastOrder > 30) s +=  8;
  } else if (i.orderCount > 0) {
    // Had orders but we don't know when = assume churned
    s += 20;
  }

  // Negative sentiment
  if (i.sentiment === "negative") s += 10;
  if (i.sentiment === "angry")    s += 25;

  // Healthy engagement reduces churn risk
  if (i.daysSinceLastContact <= 7)  s -= 15;
  if (i.inboundCount >= 10)         s -= 5;
  if (i.orderCount >= 3)            s -= 10;

  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------------------------------------------------------------------------
// Lifecycle stage
// ---------------------------------------------------------------------------

export type LifecycleStage =
  | "new"           // <7 days, no orders
  | "prospect"      // engaged, no orders
  | "first_buyer"   // exactly 1 order
  | "repeat_buyer"  // 2-5 orders
  | "loyal"         // 6+ orders or high value
  | "at_risk"       // ordered before but inactive
  | "churned"       // no contact for 60+ days
  | "winback";      // returning after churn

export function classifyLifecycle(i: RetentionInput & { daysSinceJoined: number }): LifecycleStage {
  if (i.daysSinceLastContact > 60 && i.orderCount > 0) return "churned";
  if (i.daysSinceLastContact > 30 && i.orderCount > 0) return "at_risk";
  if (i.orderCount === 0 && i.daysSinceJoined < 7)    return "new";
  if (i.orderCount === 0)                              return "prospect";
  if (i.orderCount === 1 && (i.daysSinceLastOrder ?? 0) < 30) return "first_buyer";
  if (i.orderCount >= 6 || i.totalOrderValue >= 5000)  return "loyal";
  if (i.orderCount >= 2)                               return "repeat_buyer";
  return "first_buyer";
}

// ---------------------------------------------------------------------------
// Re-engagement hint — pure function for follow-up copy guidance
// ---------------------------------------------------------------------------

export interface ReEngagementHint {
  shouldEngage: boolean;
  urgency: "low" | "medium" | "high";
  messageType: "winback" | "reactivation" | "loyalty_reward" | "soft_nudge" | "none";
  arabicHint: string;
  suggestedDelayHours: number;
}

export function buildReEngagementHint(args: {
  stage: LifecycleStage;
  churnRisk: number;
  daysSinceLastContact: number;
  orderCount: number;
}): ReEngagementHint {
  const { stage, churnRisk, daysSinceLastContact, orderCount } = args;

  if (stage === "churned" || (churnRisk >= 70 && daysSinceLastContact >= 30)) {
    return {
      shouldEngage: true,
      urgency: "high",
      messageType: "winback",
      arabicHint: "عميل لم نسمع منه منذ فترة طويلة — رسالة استعادة مخصصة بعرض أو ذكرى إيجابية.",
      suggestedDelayHours: 0,
    };
  }
  if (stage === "at_risk" || (churnRisk >= 50 && daysSinceLastContact >= 14)) {
    return {
      shouldEngage: true,
      urgency: "medium",
      messageType: "reactivation",
      arabicHint: "العميل بدأ يبتعد — رسالة ترحيبية بعرض جديد أو منتج مقترح بناءً على مشترياته.",
      suggestedDelayHours: 2,
    };
  }
  if (stage === "loyal" && orderCount >= 5) {
    return {
      shouldEngage: true,
      urgency: "low",
      messageType: "loyalty_reward",
      arabicHint: "عميل مميز — قدّر ولاءه برسالة شخصية وعرض حصري.",
      suggestedDelayHours: 24,
    };
  }
  if (stage === "first_buyer" && daysSinceLastContact >= 7) {
    return {
      shouldEngage: true,
      urgency: "low",
      messageType: "soft_nudge",
      arabicHint: "عميل أول طلب — تأكد من رضاه واقترح منتجاً مكملاً.",
      suggestedDelayHours: 48,
    };
  }
  return {
    shouldEngage: false,
    urgency: "low",
    messageType: "none",
    arabicHint: "",
    suggestedDelayHours: 0,
  };
}

// ---------------------------------------------------------------------------
// Background updater — called fire-and-forget from the incoming route.
// Also wired into the follow-up cron for inactive customer sweeps.
// ---------------------------------------------------------------------------

export async function updateRetentionScores(args: {
  customerId: string;
  userId: string;
}): Promise<void> {
  try {
    const customer = await (prisma as any).customer.findUnique({
      where: { id: args.customerId },
      select: {
        orderCount: true,
        totalOrderValue: true,
        lastOrderAt: true,
        lastSeenAt: true,
        lastSentiment: true,
        followUpCount: true,
        inboundCount: true,
        createdAt: true,
      },
    });
    if (!customer) return;

    const now = Date.now();
    const daysSinceLastOrder = customer.lastOrderAt
      ? Math.max(0, (now - new Date(customer.lastOrderAt).getTime()) / 86400000)
      : null;
    const daysSinceLastContact = Math.max(
      0,
      (now - new Date(customer.lastSeenAt || customer.createdAt).getTime()) / 86400000,
    );

    const input: RetentionInput = {
      orderCount:           customer.orderCount ?? 0,
      totalOrderValue:      customer.totalOrderValue ?? 0,
      daysSinceLastOrder,
      daysSinceLastContact,
      inboundCount:         customer.inboundCount ?? 0,
      sentiment:            customer.lastSentiment,
      followUpCount:        customer.followUpCount ?? 0,
      createdAt:            new Date(customer.createdAt),
    };

    const retentionScore = computeRetentionScore(input);
    const loyaltyScore   = computeLoyaltyScore(input);
    const churnRiskScore = computeChurnRiskScore(input);

    await (prisma as any).customer.update({
      where: { id: args.customerId },
      data: {
        retentionScore,
        loyaltyScore,
        churnRiskScore,
        lastEngagedAt: new Date(),
      },
    });
  } catch {
    // never throws
  }
}

// ---------------------------------------------------------------------------
// Batch sweep — called by cron to find at-risk / churned customers.
// Returns customers that need re-engagement, prioritized by churn risk.
// Lightweight: pagination, no heavy joins.
// ---------------------------------------------------------------------------

export async function findReEngagementCandidates(args: {
  userId: string;
  limit?: number;
  minChurnRisk?: number;
}): Promise<Array<{
  customerId: string;
  phone: string;
  name: string | null;
  churnRisk: number;
  loyaltyScore: number;
  stage: LifecycleStage;
  hint: ReEngagementHint;
}>> {
  try {
    const minRisk = args.minChurnRisk ?? 40;
    const limit = Math.min(50, args.limit ?? 20);

    const customers = await (prisma as any).customer.findMany({
      where: {
        userId: args.userId,
        churnRiskScore: { gte: minRisk },
        optedOutAt: null,
        blockedAt: null,
      },
      select: {
        id: true,
        phone: true,
        name: true,
        orderCount: true,
        totalOrderValue: true,
        lastOrderAt: true,
        lastSeenAt: true,
        lastSentiment: true,
        followUpCount: true,
        inboundCount: true,
        createdAt: true,
        churnRiskScore: true,
        loyaltyScore: true,
        retentionScore: true,
      },
      orderBy: { churnRiskScore: "desc" },
      take: limit,
    });

    return customers.map((c: any) => {
      const now = Date.now();
      const daysSinceLastOrder = c.lastOrderAt
        ? Math.max(0, (now - new Date(c.lastOrderAt).getTime()) / 86400000)
        : null;
      const daysSinceLastContact = Math.max(
        0,
        (now - new Date(c.lastSeenAt || c.createdAt).getTime()) / 86400000,
      );
      const daysSinceJoined = Math.max(
        0,
        (now - new Date(c.createdAt).getTime()) / 86400000,
      );
      const input: RetentionInput = {
        orderCount:      c.orderCount ?? 0,
        totalOrderValue: c.totalOrderValue ?? 0,
        daysSinceLastOrder,
        daysSinceLastContact,
        inboundCount:    c.inboundCount ?? 0,
        sentiment:       c.lastSentiment,
        followUpCount:   c.followUpCount ?? 0,
        createdAt:       new Date(c.createdAt),
      };
      const stage = classifyLifecycle({ ...input, daysSinceJoined });
      const hint  = buildReEngagementHint({
        stage,
        churnRisk: c.churnRiskScore ?? 0,
        daysSinceLastContact,
        orderCount: c.orderCount ?? 0,
      });
      return {
        customerId: c.id,
        phone:      c.phone,
        name:       c.name,
        churnRisk:  c.churnRiskScore ?? 0,
        loyaltyScore: c.loyaltyScore ?? 0,
        stage,
        hint,
      };
    });
  } catch {
    return [];
  }
}
