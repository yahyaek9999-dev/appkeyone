// Feature 3 — Smart Upsell Suggestions.
//
// Detection logic (heuristics only):
//   1. Order created within last 14 days
//   2. Order status IN ("confirmed", "shipped", "delivered")  — i.e. real
//   3. No newer order from the same customer
//   4. No assistant follow-up sent in the last 7 days
//
// Urgency score (0..100):
//     - higher for fresh orders (≤ 3 days = +40, ≤ 7 = +25, ≤ 14 = +10)
//     - +20 if order total >= the merchant's average order total
//     - +leadScore × 0.3
//
// Suggested message is template-driven (no LLM) and intentionally soft:
// "shukran 3la el order, lو حابب نضيف…" — never pushy.

import { prisma } from "@/lib/db";
import { IntelItem } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export async function detectUpsell(userId: string, now: Date = new Date()): Promise<IntelItem[]> {
  const since = new Date(now.getTime() - 14 * DAY);
  const recentCutoff = new Date(now.getTime() - 7 * DAY);

  const orders = await prisma.order.findMany({
    where: {
      userId,
      createdAt: { gte: since },
      status: { in: ["confirmed", "shipped", "delivered"] },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      total: true,
      createdAt: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          leadScore: true,
          orders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, createdAt: true },
          },
          conversation: {
            select: {
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                where: { role: "assistant" },
                select: { createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  if (orders.length === 0) return [];

  // Compute the merchant's average order total over the same window — cheap
  // baseline that lets us tag "above average" orders without storing anything.
  const totals = orders.map((o) => o.total || 0).filter((n) => n > 0);
  const avg = totals.length > 0 ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;

  // Dedupe per customer — only the most recent eligible order.
  const seen = new Set<string>();
  const out: IntelItem[] = [];

  for (const o of orders) {
    if (seen.has(o.customerId)) continue;
    seen.add(o.customerId);

    const cust = o.customer;
    if (!cust) continue;

    // Skip if a newer order exists for this customer than this one (we ordered
    // by createdAt desc; the first occurrence is already newest, so this guard
    // is only a sanity check.)
    const latest = cust.orders[0];
    if (latest && latest.id !== o.id) continue;

    // Skip if we already followed up via the bot/admin in the last 7d.
    const lastAsst = cust.conversation?.messages[0]?.createdAt;
    if (lastAsst && new Date(lastAsst) > recentCutoff) continue;

    const days = Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / DAY);

    // urgency
    let u = 0;
    if (days <= 3) u += 40;
    else if (days <= 7) u += 25;
    else u += 10;
    if (avg > 0 && (o.total || 0) >= avg) u += 20;
    u += Math.round((cust.leadScore || 0) * 0.3);
    u = Math.max(0, Math.min(100, u));

    const aboveAvg = avg > 0 && (o.total || 0) >= avg;

    out.push({
      id: `upsell-${o.id}`,
      kind: "upsell",
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      urgency: u,
      title: aboveAvg ? "عميل اشترى مؤخراً بقيمة عالية" : "عميل اشترى مؤخراً",
      reason: `طلب من ${days} يوم بقيمة ${(o.total || 0).toLocaleString("en-US")} ج${
        aboveAvg ? " — أعلى من متوسط طلباتك" : ""
      }.`,
      suggestedMessage: buildMessage({
        name: cust.name,
        aboveAvg,
      }),
      orderId: o.id,
      orderTotal: o.total || 0,
      leadScore: cust.leadScore || 0,
    });
  }

  return out.sort((a, b) => b.urgency - a.urgency).slice(0, 50);
}

function buildMessage(arg: { name: string | null; aboveAvg: boolean }): string {
  const greet = arg.name ? `أهلاً ${arg.name},` : "أهلاً،";
  if (arg.aboveAvg) {
    return (
      `${greet} شكراً ليك على طلبك الأخير 🙏. ` +
      `بما إنك من عملاءنا المميزين، عندي اقتراح حضرتك ممكن يعجبك يكمّل اللي اشتريته. ` +
      `تحب أبعتلك التفاصيل؟`
    );
  }
  return (
    `${greet} شكراً ليك على طلبك 🙏. ` +
    `اتمنى يكون عجبك. لو حابب تشوف منتجات تكمّله أو عروض مناسبة، قولي وأبعتلك.`
  );
}
