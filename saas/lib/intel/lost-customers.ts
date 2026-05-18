// Feature 2 — Lost Customer Recovery (win-back).
//
// Detection logic (heuristics only, NO LLM):
//   1. Customer.lastIntent IN ("buy", "inquiry") OR leadScore >= 40
//   2. Last user message in conversation is >= 48h old AND <= 30d old
//   3. No order was created by this customer in the last 30 days
//   4. Conversation has >= 3 user messages (filters out passers-by)
//
// Urgency score (0..100): weighted blend of
//     - intent (buy=+35, inquiry=+15)
//     - leadScore        (×0.35)
//     - recency penalty  (best at 3-5 days, decays after 10)
//     - message volume   (capped at 10 msgs)
//
// All numbers are deliberately simple. No floats stored anywhere — only
// computed in JS at request time so we can tune without migrations.

import { prisma } from "@/lib/db";
import { IntelItem } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function detectLostCustomers(userId: string, now: Date = new Date()): Promise<IntelItem[]> {
  const cutoffMin = new Date(now.getTime() - 2 * DAY);   // at least 48h silent
  const cutoffMax = new Date(now.getTime() - 30 * DAY);  // not older than 30d

  const candidates = await prisma.customer.findMany({
    where: {
      userId,
      lastSeenAt: { lte: cutoffMin, gte: cutoffMax },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      lastIntent: true,
      leadScore: true,
      lastSeenAt: true,
      conversation: {
        select: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 30,
            select: { role: true, content: true, createdAt: true, intent: true },
          },
        },
      },
      orders: {
        where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
        select: { id: true },
        take: 1,
      },
    },
    take: 300,
  });

  const out: IntelItem[] = [];

  for (const c of candidates) {
    if (c.orders.length > 0) continue; // already purchased recently
    const msgs = c.conversation?.messages || [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (userMsgs.length < 3) continue;

    const lastUser = userMsgs[0];
    if (!lastUser) continue;

    const intent = (c.lastIntent || "").toLowerCase();
    const isBuy = intent === "buy";
    const isInquiry = intent === "inquiry";
    if (!isBuy && !isInquiry && (c.leadScore || 0) < 40) continue;

    const days = Math.floor((now.getTime() - new Date(lastUser.createdAt).getTime()) / DAY);

    // urgency
    let u = 0;
    u += isBuy ? 35 : isInquiry ? 15 : 0;
    u += Math.round((c.leadScore || 0) * 0.35);
    // recency: peak at 3-5 days, taper after 10
    if (days <= 2) u += 5;
    else if (days <= 5) u += 25;
    else if (days <= 10) u += 18;
    else if (days <= 20) u += 8;
    else u += 0;
    u += Math.min(10, userMsgs.length);
    u = Math.max(0, Math.min(100, u));

    // Pull a recent customer line we can quote softly in the suggested message
    const quoted = (lastUser.content || "").slice(0, 60).trim();

    out.push({
      id: `lost-${c.id}`,
      kind: "lost_customer",
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      urgency: u,
      title: isBuy ? "أبدى نية شراء ثم اختفى" : "كان مهتمًا ثم اختفى",
      reason: `آخر رد منه من ${days} يوم — ${userMsgs.length} رسالة سابقة${isBuy ? "، النية: شراء" : ""}.`,
      suggestedMessage: buildMessage({
        name: c.name,
        days,
        isBuy,
        quoted,
      }),
      lastInteractionAt: new Date(lastUser.createdAt).toISOString(),
      daysSinceLastMsg: days,
      leadScore: c.leadScore || 0,
      lastIntent: c.lastIntent,
    });
  }

  // Highest urgency first; cap at 50 to keep the UI snappy
  return out.sort((a, b) => b.urgency - a.urgency).slice(0, 50);
}

function buildMessage(arg: { name: string | null; days: number; isBuy: boolean; quoted: string }): string {
  const greet = arg.name ? `أهلاً ${arg.name}،` : "أهلاً،";
  if (arg.isBuy) {
    return (
      `${greet} اتفقدت محادثتنا الأخيرة وحبيت أتابع معاك. ` +
      `لو لسه مهتم، أنا هنا أرد على أي سؤال أو أوضّح أي تفاصيل. ` +
      `حضرتك تحب نكمل بنفس اللي اتفقنا عليه؟`
    );
  }
  return (
    `${greet} لاحظت إننا متكلمناش من فترة. ` +
    `لو في أي سؤال لسه في بالك أو حاجة تحب نراجعها سوا، ابعتلي براحتك.`
  );
}
