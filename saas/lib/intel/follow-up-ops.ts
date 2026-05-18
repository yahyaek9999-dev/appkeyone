// Feature 5 — Follow-up Opportunity Detection.
//
// Detects conversations where a price/product question was asked but the
// chat fell silent without an order — a different signal from "lost_customer"
// (which centres on the overall customer state). Here we look at the last
// few messages and a keyword set typical for pricing questions in Arabic.
//
// Detection logic:
//   1. Conversation has at least one user message in last 14d
//   2. The latest user message contains a pricing/availability keyword
//   3. Last message in conversation is from user (no bot/assistant follow-up
//      took it further) OR last assistant reply is older than 24h
//   4. No order created within 14d
//
// Urgency: combination of keyword strength + recency + leadScore.
//
// NO LLM. Pure regex on stored messages.

import { prisma } from "@/lib/db";
import { IntelItem } from "./types";

const DAY = 24 * 60 * 60 * 1000;

// Strong = "price/cost", Medium = "available/in stock/discount"
const STRONG_AR = [
  "كام", "سعر", "بكم", "تكلفة", "التكلفه", "التكلفة", "كم",
];
const MEDIUM_AR = [
  "متاح", "موجود", "متوفر", "خصم", "عرض", "أوفر", "أقل", "اقل",
  "available", "stock", "discount", "price", "cost",
];

const STRONG_RE = new RegExp(`(${STRONG_AR.join("|")})`, "i");
const MEDIUM_RE = new RegExp(`(${MEDIUM_AR.join("|")})`, "i");

export async function detectFollowUpOps(userId: string, now: Date = new Date()): Promise<IntelItem[]> {
  const since = new Date(now.getTime() - 14 * DAY);
  const repliedCutoff = new Date(now.getTime() - DAY);

  const candidates = await prisma.customer.findMany({
    where: {
      userId,
      lastSeenAt: { gte: since },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      leadScore: true,
      lastIntent: true,
      conversation: {
        select: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { role: true, content: true, createdAt: true },
          },
        },
      },
      orders: {
        where: { createdAt: { gte: since } },
        select: { id: true },
        take: 1,
      },
    },
    take: 400,
  });

  const out: IntelItem[] = [];

  for (const c of candidates) {
    if (c.orders.length > 0) continue;
    const msgs = c.conversation?.messages || [];
    if (msgs.length === 0) continue;

    const last = msgs[0];

    // Pull the most recent USER message to scan for keywords
    const lastUser = msgs.find((m) => m.role === "user");
    if (!lastUser) continue;
    const content = lastUser.content || "";

    const isStrong = STRONG_RE.test(content);
    const isMedium = !isStrong && MEDIUM_RE.test(content);
    if (!isStrong && !isMedium) continue;

    // Skip if assistant has replied within the last 24h after the user
    const lastAsst = msgs.find((m) => m.role === "assistant");
    if (lastAsst && new Date(lastAsst.createdAt) > repliedCutoff &&
        new Date(lastAsst.createdAt) > new Date(lastUser.createdAt)) {
      continue;
    }

    const hours = Math.floor((now.getTime() - new Date(lastUser.createdAt).getTime()) / (60 * 60 * 1000));
    if (hours < 1) continue;  // give the bot a chance

    let u = 0;
    u += isStrong ? 45 : 20;
    if (hours <= 12) u += 25;
    else if (hours <= 48) u += 18;
    else if (hours <= 96) u += 10;
    u += Math.round((c.leadScore || 0) * 0.25);
    if ((c.lastIntent || "") === "buy") u += 12;
    u = Math.max(0, Math.min(100, u));

    const quoted = content.slice(0, 80).trim();

    out.push({
      id: `fup-${c.id}`,
      kind: "follow_up_op",
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      urgency: u,
      title: isStrong ? "سأل عن السعر وما اكملش" : "سأل عن التوفر ولم يكمل",
      reason: `"${quoted}" — من ${hours <= 24 ? `${hours} ساعة` : `${Math.floor(hours / 24)} يوم`}.`,
      suggestedMessage: buildMessage({
        name: c.name,
        isStrong,
        quoted,
      }),
      lastInteractionAt: new Date(lastUser.createdAt).toISOString(),
      daysSinceLastMsg: Math.floor(hours / 24),
      leadScore: c.leadScore || 0,
      lastIntent: c.lastIntent,
    });
  }

  return out.sort((a, b) => b.urgency - a.urgency).slice(0, 50);
}

function buildMessage(arg: { name: string | null; isStrong: boolean; quoted: string }): string {
  const greet = arg.name ? `أهلاً ${arg.name}،` : "أهلاً،";
  if (arg.isStrong) {
    return (
      `${greet} لقيت إنك سألت عن السعر ومكملناش الكلام. ` +
      `لو تحب أبعتلك التفاصيل تاني أو أوضحلك أي شيء، أنا في الخدمة.`
    );
  }
  return (
    `${greet} حابب أتأكد إن المعلومة وصلتك صح. ` +
    `لو محتاج توضيح أو أي تفاصيل تانية، ابعتلي.`
  );
}
