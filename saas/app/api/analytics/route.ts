import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Returns dashboard analytics for the authenticated user.
 *
 * Range is the trailing `days` (default 30). All numbers are computed
 * directly from the DB — no extra tracking infrastructure required.
 *
 * Response shape (stable, used by the UI):
 *   totals        { customers, conversations, messages, leadsHot, leadsWarm }
 *   today         { messages, newCustomers, conversations }
 *   messagesDaily [{ date, in, out }]
 *   intent        { buy, inquiry, complaint, support, greeting, other }
 *   sentiment     { positive, neutral, negative, angry }
 *   topTags       [{ tag, count }]
 *   leadDistribution [{ bucket, count }]   // 0-19, 20-39, ...
 *   topCustomers  [{ id, name, phone, leadScore, msgs }]
 *   quickReplies  { totalHits, topTriggers: [{ trigger, hits }] }
 *   savings       { quickReplyShare, estLlmCallsSaved, currency, estUsdSaved }
 */
export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // This endpoint fans out several full-table scans per call — rate limit it so
  // a tight polling loop can't saturate the DB for the whole instance.
  const limited = enforceRateLimit(req, { name: "analytics", identifier: uid, ...RATE_LIMITS.api });
  if (limited) return limited;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get("days") || "30", 10) || 30));

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // -------- Customers --------
  const customers = await prisma.customer.findMany({
    where: { userId: uid },
    select: {
      id: true, name: true, phone: true,
      leadScore: true, lastIntent: true, lastSentiment: true,
      tags: true, createdAt: true,
    },
    take: 20000, // hard ceiling — large tenants can't blow up heap/DB per call
  });

  const customerIds = customers.map((c) => c.id);

  // -------- Conversations --------
  const conversations = await prisma.conversation.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true, customerId: true, updatedAt: true },
    take: 20000,
  });
  const convIds = conversations.map((c) => c.id);

  // -------- Messages (in range) --------
  const messages = await prisma.message.findMany({
    where: { conversationId: { in: convIds }, createdAt: { gte: since } },
    select: { id: true, role: true, intent: true, sentiment: true, createdAt: true, conversationId: true },
    orderBy: { createdAt: "asc" },
    take: 50000,
  });

  // -------- Quick replies --------
  const bot = await prisma.bot.findUnique({
    where: { userId: uid },
    select: { id: true },
  });
  const quickReplies = bot
    ? await prisma.quickReply.findMany({
        where: { botId: bot.id },
        select: { triggers: true, hits: true },
      })
    : [];

  // ---------- Aggregations ----------------------------------------------
  const leadsHot = customers.filter((c) => (c.leadScore ?? 0) >= 70).length;
  const leadsWarm = customers.filter((c) => {
    const s = c.leadScore ?? 0;
    return s >= 40 && s < 70;
  }).length;

  const totals = {
    customers: customers.length,
    conversations: conversations.length,
    messages: messages.length,
    leadsHot,
    leadsWarm,
  };

  // -- Today bucket --
  const today = {
    messages: messages.filter((m) => m.createdAt >= startOfToday).length,
    newCustomers: customers.filter((c) => c.createdAt >= startOfToday).length,
    conversations: conversations.filter(
      (c) => c.updatedAt && c.updatedAt >= startOfToday
    ).length,
  };

  // -- Daily traffic --
  const messagesDaily: { date: string; in: number; out: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const dayKey = day.toISOString().slice(0, 10);
    let inCount = 0, outCount = 0;
    for (const m of messages) {
      if (m.createdAt >= day && m.createdAt < next) {
        if (m.role === "user") inCount++;
        else if (m.role === "assistant") outCount++;
      }
    }
    messagesDaily.push({ date: dayKey, in: inCount, out: outCount });
  }

  // -- Intent / Sentiment distribution --
  const intent: Record<string, number> = { buy: 0, inquiry: 0, complaint: 0, support: 0, greeting: 0, other: 0 };
  const sentiment: Record<string, number> = { positive: 0, neutral: 0, negative: 0, angry: 0 };
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (m.intent && intent[m.intent] !== undefined) intent[m.intent]++;
    else if (m.intent) intent.other++;
    if (m.sentiment && sentiment[m.sentiment] !== undefined) sentiment[m.sentiment]++;
  }

  // -- Top tags --
  const tagCounts: Record<string, number> = {};
  for (const c of customers) {
    try {
      const arr = JSON.parse(c.tags || "[]");
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (typeof t === "string" && t.trim()) {
            const k = t.trim();
            tagCounts[k] = (tagCounts[k] || 0) + 1;
          }
        }
      }
    } catch {}
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // -- Lead score distribution (5 buckets of 20) --
  const leadDistribution = [
    { bucket: "0-19", count: 0 },
    { bucket: "20-39", count: 0 },
    { bucket: "40-59", count: 0 },
    { bucket: "60-79", count: 0 },
    { bucket: "80-100", count: 0 },
  ];
  for (const c of customers) {
    const s = c.leadScore ?? 0;
    const idx = Math.min(4, Math.floor(s / 20));
    leadDistribution[idx].count++;
  }

  // -- Top customers by activity in range --
  const customerMsgCount: Record<string, number> = {};
  for (const m of messages) {
    if (m.role !== "user") continue;
    const conv = conversations.find((c) => c.id === m.conversationId);
    if (!conv) continue;
    customerMsgCount[conv.customerId] = (customerMsgCount[conv.customerId] || 0) + 1;
  }
  const topCustomers = Object.entries(customerMsgCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([cid, msgs]) => {
      const c = customers.find((x) => x.id === cid);
      return {
        id: cid,
        name: c?.name || null,
        phone: c?.phone || "",
        leadScore: c?.leadScore ?? 0,
        msgs,
      };
    });

  // -- Quick reply analytics --
  let totalHits = 0;
  const triggerHits: { trigger: string; hits: number }[] = [];
  for (const q of quickReplies) {
    totalHits += q.hits || 0;
    try {
      const arr = JSON.parse(q.triggers || "[]");
      const first = Array.isArray(arr) && arr.length > 0 ? String(arr[0]) : "";
      if (first) triggerHits.push({ trigger: first, hits: q.hits || 0 });
    } catch {}
  }
  triggerHits.sort((a, b) => b.hits - a.hits);

  // Estimated cost savings: assume avg LLM call ≈ $0.0008 (very rough, GPT-4o-mini-like)
  const totalUserMsgs = messages.filter((m) => m.role === "user").length;
  const quickReplyShare = totalUserMsgs > 0 ? totalHits / Math.max(totalUserMsgs, totalHits) : 0;
  const estUsdSaved = +(totalHits * 0.0008).toFixed(3);

  return NextResponse.json({
    days,
    totals,
    today,
    messagesDaily,
    intent,
    sentiment,
    topTags,
    leadDistribution,
    topCustomers,
    quickReplies: {
      totalHits,
      topTriggers: triggerHits.slice(0, 8),
    },
    savings: {
      quickReplyShare: +quickReplyShare.toFixed(3),
      estLlmCallsSaved: totalHits,
      currency: "USD",
      estUsdSaved,
    },
  });
}
