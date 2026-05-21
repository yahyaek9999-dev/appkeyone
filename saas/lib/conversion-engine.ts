// Conversion Engine — Phase A.
//
// Computes conversion probability, hesitation score, and generates
// contextual CTA guidance. Pure rule-based logic, no LLM calls.
// Runs in background after classifyAndScore — never blocks the hot path.
//
// Scores are persisted on Customer (conversionScore, hesitationScore)
// for dashboard analytics and follow-up optimization.

import { prisma } from "@/lib/db";
import type { SalesSignals } from "@/lib/sales-engine";
import { detectSignals, hasAnyObjection } from "@/lib/sales-engine";

// ---------------------------------------------------------------------------
// Conversion probability score (0-100)
// ---------------------------------------------------------------------------

export interface ConversionInput {
  leadScore: number;
  signals: SalesSignals;
  intent: string | null | undefined;
  sentiment: string | null | undefined;
  orderCount: number;           // historical confirmed orders
  daysSinceFirstContact: number;
  followUpSent: boolean;
  followUpCount: number;
}

export function computeConversionScore(i: ConversionInput): number {
  let s = 0;

  // Strong buy signals
  if (i.signals.buyStrong)    s += 30;
  if (i.signals.buyInterest)  s += 15;
  if (i.signals.urgent)       s += 10;

  // Intent
  if (i.intent === "buy")     s += 20;
  if (i.intent === "inquiry") s +=  8;

  // Sentiment
  if (i.sentiment === "positive") s += 10;
  if (i.sentiment === "negative") s -= 10;
  if (i.sentiment === "angry")    s -= 25;

  // Lead score influence (normalized to 0-15)
  s += Math.floor((i.leadScore / 100) * 15);

  // Repeat buyer — strong signal
  if (i.orderCount >= 1) s += 15;
  if (i.orderCount >= 3) s +=  5;

  // Recency: penalize if contact is very old and no conversion
  if (i.daysSinceFirstContact > 30 && i.orderCount === 0) s -= 10;

  // Objections reduce conversion
  if (i.signals.objections.price)    s -= 8;
  if (i.signals.objections.trust)    s -= 12;
  if (i.signals.objections.shipping) s -= 5;
  if (i.signals.objections.quality)  s -= 5;
  if (i.signals.hesitation)          s -= 8;
  if (i.signals.discountAsk)         s -= 3;

  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------------------------------------------------------------------------
// Hesitation score (0-100)
// ---------------------------------------------------------------------------

export interface HesitationInput {
  signals: SalesSignals;
  intent: string | null | undefined;
  sentiment: string | null | undefined;
  conversationLength: number;   // total user messages
  daysSinceFirstContact: number;
  discountAsks: number;
  objectionCount: number;
}

export function computeHesitationScore(i: HesitationInput): number {
  let s = 0;

  if (i.signals.hesitation)          s += 30;
  if (i.signals.discountAsk)         s += 10;
  if (hasAnyObjection(i.signals))    s += 20;

  if (i.signals.objections.price)    s += 10;
  if (i.signals.objections.trust)    s += 15;

  // Long conversation with no buy = hesitant
  if (i.conversationLength > 15 && i.intent !== "buy") s += 10;
  if (i.daysSinceFirstContact > 7 && i.intent === "inquiry") s += 10;

  // Discount pressure count
  s += Math.min(20, i.discountAsks * 7);
  s += Math.min(15, i.objectionCount * 5);

  // Positive sentiment reduces hesitation
  if (i.sentiment === "positive") s -= 10;
  if (i.signals.buyStrong)        s -= 20;

  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------------------------------------------------------------------------
// CTA (Call to Action) generation — returns a short Arabic CTA hint
// to be used by follow-ups and the sales block builder.
// ---------------------------------------------------------------------------

export type CtaType =
  | "close_now"
  | "offer_value"
  | "build_trust"
  | "reduce_friction"
  | "urgency_nudge"
  | "gentle_followup"
  | "winback"
  | "none";

export interface CtaInput {
  conversionScore: number;
  hesitationScore: number;
  signals: SalesSignals;
  psychology: string;
  daysSinceLastContact: number;
  orderCount: number;
}

export function selectCta(i: CtaInput): CtaType {
  // Win-back: customer was away for >14 days and had ordered before
  if (i.daysSinceLastContact >= 14 && i.orderCount >= 1) return "winback";

  // Ghost: away for >3 days and had shown interest
  if (i.daysSinceLastContact >= 3 && i.conversionScore >= 30) return "gentle_followup";

  // Hot: close now
  if (i.conversionScore >= 70 && !i.signals.hesitation) return "close_now";

  // Trust objection: build trust first
  if (i.signals.objections.trust) return "build_trust";

  // Price sensitive: offer value (not discount)
  if (i.signals.objections.price || i.signals.discountAsk) return "offer_value";

  // Hesitant but interested: reduce friction
  if (i.hesitationScore >= 40 && i.conversionScore >= 30) return "reduce_friction";

  // Urgent: nudge with scarcity
  if (i.signals.urgent) return "urgency_nudge";

  return "none";
}

const CTA_TEXTS: Record<CtaType, string> = {
  close_now:         "🎯 اطلب الآن وأكد تفاصيلك بجملة واحدة.",
  offer_value:       "💡 ركّز على القيمة: ماذا سيستفيد بالضبط؟",
  build_trust:       "🤝 اذكر تجربة عميل حقيقي أو ضمان.",
  reduce_friction:   "🚀 سهّل الخطوة التالية — سؤال واحد فقط.",
  urgency_nudge:     "⏳ الكميات محدودة أو العرض لفترة — ذكّره برفق.",
  gentle_followup:   "📩 رسالة متابعة لطيفة بعرض جديد.",
  winback:           "🌟 رسالة استعادة مخصصة لعميل قديم.",
  none:              "",
};

export function buildCtaText(type: CtaType): string {
  return CTA_TEXTS[type] || "";
}

// ---------------------------------------------------------------------------
// Background updater — called fire-and-forget from the incoming route.
// Never throws, never blocks the hot path.
// ---------------------------------------------------------------------------

export async function updateConversionScores(args: {
  customerId: string;
  conversationId: string;
  text: string;
  intent: string | null | undefined;
  sentiment: string | null | undefined;
  leadScore: number;
  followUpSent: boolean;
  followUpCount: number;
}): Promise<void> {
  try {
    const customer = await (prisma as any).customer.findUnique({
      where: { id: args.customerId },
      select: {
        orderCount: true,
        createdAt: true,
        conversionScore: true,
        hesitationScore: true,
      },
    });
    if (!customer) return;

    const signals = detectSignals(args.text);
    const daysSince = Math.max(
      0,
      (Date.now() - new Date(customer.createdAt).getTime()) / 86400000,
    );

    const convScore = computeConversionScore({
      leadScore: args.leadScore,
      signals,
      intent: args.intent,
      sentiment: args.sentiment,
      orderCount: customer.orderCount ?? 0,
      daysSinceFirstContact: daysSince,
      followUpSent: args.followUpSent,
      followUpCount: args.followUpCount,
    });

    // Fetch negotiation state for hesitation
    const memory = await (prisma as any).customerMemory.findUnique({
      where: { customerId: args.customerId },
      select: { factsJson: true },
    });
    let discountAsks = 0;
    let objectionCount = 0;
    try {
      const facts = JSON.parse(memory?.factsJson || "{}");
      discountAsks = facts?.negotiation?.discountAsks ?? 0;
      objectionCount = facts?.negotiation?.objectionCount ?? 0;
    } catch {}

    // Count user messages in this conversation for hesitation
    const msgCount = await prisma.message.count({
      where: { conversationId: args.conversationId, role: "user" },
    });

    const hesScore = computeHesitationScore({
      signals,
      intent: args.intent,
      sentiment: args.sentiment,
      conversationLength: msgCount,
      daysSinceFirstContact: daysSince,
      discountAsks,
      objectionCount,
    });

    await (prisma as any).customer.update({
      where: { id: args.customerId },
      data: {
        conversionScore: convScore,
        hesitationScore: hesScore,
        lastEngagedAt: new Date(),
      },
    });
  } catch {
    // never throws
  }
}

// ---------------------------------------------------------------------------
// Mark a follow-up as having triggered a reply (reply rate tracking).
// Called when customer sends a new message and there's a recent sent follow-up.
// ---------------------------------------------------------------------------

export async function markFollowUpReplied(customerId: string): Promise<void> {
  try {
    // Find the most recent sent follow-up within 72h that hasn't been replied to
    const cutoff = new Date(Date.now() - 72 * 3600 * 1000);
    await (prisma as any).followUpTask.updateMany({
      where: {
        customerId,
        status: "sent",
        sentAt: { gte: cutoff },
        repliedAt: null,
      },
      data: { repliedAt: new Date() },
    });
  } catch {
    // never throws
  }
}
