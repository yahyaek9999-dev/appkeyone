// Customer 360 — profile aggregation (fast, read-only).
//
// Returns everything the profile header + key-facts + intelligence cards need
// in ONE bounded query set. Scores are READ from the Customer row (already
// computed by the conversion/retention engines after each message) — never
// recomputed here. Timeline is a SEPARATE lazy endpoint to keep this fast.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

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
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const c: any = await prisma.customer.findFirst({
    where: { id: params.id, userId: uid },
  });
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Order facts come from the Order table directly — the denormalized
  // customer.orderCount / totalOrderValue counters are not maintained on the
  // write path, so trusting them would show "0 orders" for real buyers. One
  // bounded aggregate + the most-recent order keeps this accurate and fast.
  const [lastOrder, orderAgg] = await Promise.all([
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
  ]);

  const prefs = parseJson<Record<string, any>>(c.preferences, {});
  const tags = parseJson<string[]>(c.tags, []);
  const orderCount = orderAgg._count?._all || 0;
  const totalSpent = orderAgg._sum?.total || 0;
  const aov = orderCount > 0 ? Math.round(totalSpent / orderCount) : 0;

  return NextResponse.json({
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      photoUrl: c.photoUrl || null,
      // ---- Profile facts ----
      firstContactAt: c.firstInboundAt || c.createdAt,
      lastMessageAt: c.lastInboundAt || c.lastSeenAt,
      inboundCount: c.inboundCount || 0,
      outboundCount: c.outboundCount || 0,
      totalMessages: (c.inboundCount || 0) + (c.outboundCount || 0),
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
  });
}
