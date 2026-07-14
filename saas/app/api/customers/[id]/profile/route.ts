// Customer 360 — profile aggregation (fast, read-only).
//
// Returns everything the profile header + key-facts + intelligence cards need
// in ONE bounded query set. Scores are READ from the Customer row (already
// computed by the conversion/retention engines after each message) — never
// recomputed here. Timeline is a SEPARATE lazy endpoint to keep this fast.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { readNegotiation } from "@/lib/sales-engine";
import { decideNextBestAction } from "@/lib/intelligence/next-best-action";
import { recommendProduct } from "@/lib/intelligence/product-recs";
import {
  classifyValueTier,
  valueTierLabel,
} from "@/lib/intelligence/value-tier";
import {
  computeChurnProbability,
  churnBand,
  churnBandLabel,
  computeSentimentTrend,
  sentimentTrendLabel,
} from "@/lib/intelligence/churn";

export const dynamic = "force-dynamic";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(s || "") as T;
  } catch {
    return fallback;
  }
}

function leadTemp(score: number): "hot" | "warm" | "cold" {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const uid = await getUserIdForPermission("customers");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const c: any = await prisma.customer.findFirst({
    where: { id: params.id, userId: uid },
  });
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Order facts come from the Order table directly — the denormalized
  // customer.orderCount / totalOrderValue counters are not maintained on the
  // write path, so trusting them would show "0 orders" for real buyers. One
  // bounded aggregate + the most-recent order keeps this accurate and fast.
  const [lastOrder, orderAgg, msgCounts, memory, lastMsg] = await Promise.all([
    prisma.order.findFirst({
      where: { userId: uid, customerId: c.id },
      orderBy: { createdAt: "desc" },
      include: { items: { take: 1 } },
    }) as Promise<any>,
    prisma.order.aggregate({
      where: { userId: uid, customerId: c.id, status: { not: "canceled" } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    // Real message counts from the conversation. The trust counters
    // (inboundCount/outboundCount) undercount here — outbound is often 0 for
    // historically-imported chats — so the "total messages" headline would lie.
    prisma.message
      .groupBy({ by: ["role"], where: { conversation: { customerId: c.id } }, _count: { _all: true } })
      .catch(() => [] as { role: string; _count: { _all: number } }[]),
    // Memory facts (objections + negotiation + sentiment history) for the
    // additive intelligence advice block. Read-only.
    (prisma as any).customerMemory
      .findUnique({ where: { customerId: c.id }, select: { factsJson: true, sentimentHistory: true } })
      .catch(() => null),
    prisma.message
      .findFirst({
        where: { conversation: { customerId: c.id } },
        orderBy: { createdAt: "desc" },
        select: { role: true, createdAt: true },
      })
      .catch(() => null),
  ]);

  const prefs = parseJson<Record<string, any>>(c.preferences, {});
  const tags = parseJson<string[]>(c.tags, []);
  const orderCount = orderAgg._count?._all || 0;
  const totalSpent = orderAgg._sum?.total || 0;
  const aov = orderCount > 0 ? Math.round(totalSpent / orderCount) : 0;

  // Inbound = customer messages; outbound = bot + admin replies (skip system/tool).
  let inboundCount = 0;
  let outboundCount = 0;
  for (const r of msgCounts as { role: string; _count: { _all: number } }[]) {
    const n = r._count?._all || 0;
    if (r.role === "user") inboundCount += n;
    else if (r.role === "assistant" || r.role === "admin") outboundCount += n;
  }
  // Fall back to the trust counters only if the conversation has no rows yet.
  if (inboundCount === 0 && outboundCount === 0) {
    inboundCount = c.inboundCount || 0;
    outboundCount = c.outboundCount || 0;
  }

  // ---- Additive AI intelligence advice (read-only derivations) -------------
  // Fuses the scores the pipeline already wrote into one merchant-facing
  // recommendation + value tier + churn outlook + sentiment trend. Never
  // recomputes/overwrites any stored score. See lib/intelligence/*.
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const lastInboundTs = c.lastInboundAt || c.lastSeenAt;
  const daysSinceLastInbound = lastInboundTs
    ? Math.floor((now.getTime() - new Date(lastInboundTs).getTime()) / DAY)
    : 999;
  const lastOrderTs = lastOrder?.createdAt || null;
  const daysSinceLastOrder = lastOrderTs
    ? Math.floor((now.getTime() - new Date(lastOrderTs).getTime()) / DAY)
    : null;
  const awaitingReply = !!lastMsg && (lastMsg as any).role === "user";

  let memObjections: any = {};
  let memDiscountAsks = 0;
  try {
    const facts = JSON.parse(memory?.factsJson || "{}");
    const objArr: string[] = Array.isArray(facts.objections) ? facts.objections : [];
    memObjections = {
      price: objArr.includes("price"),
      trust: objArr.includes("trust"),
      shipping: objArr.includes("shipping"),
      quality: objArr.includes("quality"),
    };
    memDiscountAsks = readNegotiation(facts).discountAsks || 0;
  } catch {}

  const valueTier = classifyValueTier({
    revenue: totalSpent,
    orderCount,
    daysSinceLastOrder,
    leadScore: c.leadScore || 0,
  });

  const churnProbability = computeChurnProbability({
    churnRiskScore: c.churnRiskScore || 0,
    retentionScore: c.retentionScore ?? 50,
    loyaltyScore: c.loyaltyScore || 0,
    daysSinceLastInbound,
    orderCount,
    hesitationScore: c.hesitationScore || 0,
  });
  const cBand = churnBand(churnProbability);
  const sentimentTrend = computeSentimentTrend(memory?.sentimentHistory);

  // Single-customer lookup — cheap enough to always compute (no N+1 concern
  // here, unlike the Revenue Copilot's bulk worklist). Falls back to null
  // (generic upsell phrasing) on any error.
  const recommendedProduct = await recommendProduct(uid, c.id).catch(() => null);

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
    objections: memObjections,
    discountAsks: memDiscountAsks,
    recommendedProduct,
  });

  return NextResponse.json({
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      photoUrl: c.photoUrl || null,
      // ---- Profile facts ----
      firstContactAt: c.firstInboundAt || c.createdAt,
      lastMessageAt: c.lastInboundAt || c.lastSeenAt,
      inboundCount,
      outboundCount,
      totalMessages: inboundCount + outboundCount,
      orderCount,
      totalSpent,
      aov,
      city: prefs.city || lastOrder?.shippingAddress || null,
      preferredLanguage: prefs.lang || prefs.language || null,
      tags,
      notes: c.notes || "",
      // ---- CRM flags ----
      vip: !!c.vip,
      blacklisted: !!c.blacklisted,
      archivedAt: c.archivedAt || null,
      assignedAdmin: c.assignedAdmin || null,
    },
    lastOrder: lastOrder
      ? {
          id: lastOrder.id,
          product: lastOrder.items?.[0]?.name || null,
          status: lastOrder.status,
          paymentMethod: lastOrder.paymentMethod || null,
          total: lastOrder.total || 0,
          createdAt: lastOrder.createdAt,
        }
      : null,
    intelligence: {
      leadScore: c.leadScore || 0,
      leadTemp: leadTemp(c.leadScore || 0),
      purchaseIntent: c.purchaseProb || 0,
      conversionScore: c.conversionScore || 0,
      repeatBuyerProb: c.loyaltyScore || 0,
      churnRisk: c.churnRiskScore || 0,
      retentionScore: c.retentionScore ?? 50,
      lastSentiment: c.lastSentiment || null,
      lastIntent: c.lastIntent || null,
      // Negotiation tendency: higher hesitation → more likely to negotiate.
      negotiationTendency: c.hesitationScore || 0,
      frustrationScore: c.frustrationScore || 0,
    },
    // ---- Additive AI advice block (read-only derivations) ----
    advice: {
      valueTier,
      valueTierLabel: valueTierLabel(valueTier),
      churnProbability,
      churnBand: cBand,
      churnBandLabel: churnBandLabel(cBand),
      sentimentTrend,
      sentimentTrendLabel: sentimentTrendLabel(sentimentTrend),
      daysSinceLastInbound,
      nextBestAction: {
        action: nba.action,
        title: nba.title,
        reason: nba.reason,
        confidence: nba.confidence,
        suggestedMessage: nba.suggestedMessage,
        factors: nba.factors,
      },
    },
  });
}
