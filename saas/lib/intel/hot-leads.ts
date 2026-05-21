// Feature 4 — Hot Lead Detection (heuristic enrichment of leadScore).
//
// The DB already has `Customer.leadScore` populated by the message pipeline.
// This detector layers a per-customer URGENCY on top using SIGNALS that are
// expensive to compute on every message (so we don't want them in the hot
// path) but cheap when computed on-demand for the merchant page:
//
//   - response cadence (avg gap between user messages in last 7d)
//   - escalation: leadScore today >= leadScore - 10 of last week  → momentum
//   - cart signal: cartItems.length > 0 AND cartUpdatedAt < 48h
//   - purchaseProb (already stored)
//   - last user msg recent (< 24h) AND no assistant reply yet
//
// We return the top 50 active customers ordered by computed urgency, with
// a recommended next-action sentence the merchant can act on.

import { prisma } from "@/lib/db";
import { IntelItem } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function detectHotLeads(
  userId: string,
  now: Date = new Date(),
): Promise<IntelItem[]> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const dayAgo = new Date(now.getTime() - 1 * DAY);
  const twoDayAgo = new Date(now.getTime() - 2 * DAY);

  const candidates = await prisma.customer.findMany({
    where: {
      userId,
      leadScore: { gte: 40 } as any,
      lastSeenAt: { gte: weekAgo },
    },
    orderBy: { leadScore: "desc" } as any,
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
      leadScore: true,
      conversionScore: true,
      hesitationScore: true,
      orderCount: true,
      totalOrderValue: true,
      lastIntent: true,
      lastSentiment: true,
      purchaseProb: true,
      cartItems: true,
      cartUpdatedAt: true,
      lastSeenAt: true,
      conversation: {
        select: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { role: true, createdAt: true },
          },
        },
      },
      orders: {
        where: { createdAt: { gte: weekAgo } },
        select: { id: true },
        take: 1,
      },
    },
  });

  const out: IntelItem[] = [];

  for (const c of candidates) {
    if (c.orders.length > 0) continue; // already converted — handled by upsell

    const msgs = c.conversation?.messages || [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (userMsgs.length === 0) continue;

    const last = msgs[0];
    const awaitingReply =
      last && last.role === "user" && new Date(last.createdAt) >= dayAgo;

    // cart signal
    let cartItemsCount = 0;
    try {
      const parsed = JSON.parse(c.cartItems || "[]");
      if (Array.isArray(parsed)) cartItemsCount = parsed.length;
    } catch {}
    const cartFresh =
      cartItemsCount > 0 &&
      c.cartUpdatedAt &&
      new Date(c.cartUpdatedAt) >= twoDayAgo;

    // cadence: avg gap between consecutive user messages over last 7d (in min)
    const recentUser = userMsgs.filter((m) => new Date(m.createdAt) >= weekAgo);
    let avgGapMin = 0;
    if (recentUser.length >= 2) {
      const sorted = recentUser
        .map((m) => new Date(m.createdAt).getTime())
        .sort((a, b) => a - b);
      let acc = 0;
      for (let i = 1; i < sorted.length; i++) acc += sorted[i] - sorted[i - 1];
      avgGapMin = Math.round(acc / (sorted.length - 1) / 60000);
    }

    // urgency composition
    let u = Math.round((c.leadScore || 0) * 0.5); // base from leadScore
    if (awaitingReply) u += 25;
    if (cartFresh) u += 18;
    if ((c.lastIntent || "") === "buy") u += 12;
    if ((c.purchaseProb || 0) >= 50) u += 10;
    if ((c.conversionScore || 0) >= 60) u += 12;
    if ((c.hesitationScore || 0) >= 70) u -= 8;
    if (avgGapMin > 0 && avgGapMin < 120) u += 8; // fast responder
    if ((c.lastSentiment || "") === "positive") u += 5;
    u = Math.max(0, Math.min(100, u));

    if (u < 50) continue; // hide the noise

    // build "next action" reason + suggestion
    const reasons: string[] = [];
    if (awaitingReply) reasons.push("بيستنى رد منك");
    if (cartFresh) reasons.push(`عنده ${cartItemsCount} منتج في الاهتمام`);
    if ((c.lastIntent || "") === "buy") reasons.push("نية شراء");
    if (avgGapMin > 0 && avgGapMin < 120) reasons.push("سريع الرد");

    const highValue =
      (c.orderCount || 0) >= 2 || (c.totalOrderValue || 0) >= 3000;
    const insightLabel = highValue
      ? "عميل عالي القيمة"
      : (c.conversionScore || 0) >= 70
        ? "احتمال تحويل عالي"
        : (c.hesitationScore || 0) >= 65
          ? "مهتم لكنه متردد"
          : undefined;

    const title = awaitingReply
      ? "عميل ساخن بينتظر ردك"
      : cartFresh
        ? "عميل ساخن مع منتجات بيهتم بيها"
        : (c.conversionScore || 0) >= 70
          ? "Lead عالي التحويل"
          : "عميل ساخن نشط";

    const reasonBits = [...reasons];
    if ((c.conversionScore || 0) >= 50)
      reasonBits.push(`تحويل ${c.conversionScore}%`);
    if ((c.hesitationScore || 0) >= 50)
      reasonBits.push(`تردد ${c.hesitationScore}%`);
    if (highValue) reasonBits.push("قيمة عالية");

    const reason =
      reasonBits.length > 0
        ? reasonBits.join(" • ")
        : `نقاط ${c.leadScore} • نشط من ${daysAgo(c.lastSeenAt, now)} يوم`;

    out.push({
      id: `hot-${c.id}`,
      kind: "hot_lead",
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      urgency: u,
      title,
      reason,
      suggestedMessage: buildMessage({
        name: c.name,
        awaitingReply: !!awaitingReply,
        cartFresh: !!cartFresh,
        isBuy: (c.lastIntent || "") === "buy",
      }),
      leadScore: c.leadScore || 0,
      conversionScore: c.conversionScore || 0,
      hesitationScore: c.hesitationScore || 0,
      insightLabel,
      lastIntent: c.lastIntent,
      lastInteractionAt: new Date(c.lastSeenAt).toISOString(),
    });
  }

  return out.sort((a, b) => b.urgency - a.urgency).slice(0, 50);
}

function daysAgo(d: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(d).getTime()) / DAY));
}

function buildMessage(arg: {
  name: string | null;
  awaitingReply: boolean;
  cartFresh: boolean;
  isBuy: boolean;
}): string {
  const greet = arg.name ? `أهلاً ${arg.name}،` : "أهلاً،";
  if (arg.awaitingReply && arg.isBuy) {
    return `${greet} حابب أتأكد إنك وصلتك كل المعلومات اللي تحتاجها للطلب. تحب نكمل؟`;
  }
  if (arg.awaitingReply) {
    return `${greet} عاوزة أتأكد إنك شفت آخر رد، وأقدر أوضحلك أي تفاصيل تانية لو محتاج.`;
  }
  if (arg.cartFresh) {
    return `${greet} المنتجات اللي اخترتها لسه متاحة. ابعتلي لو حابب نأكد الطلب أو تعرف تفاصيل تانية.`;
  }
  return `${greet} لو في أي سؤال محتاج توضيح، أنا هنا. ممكن أساعدك أكمل أو أعرض عليك حاجة مناسبة؟`;
}
