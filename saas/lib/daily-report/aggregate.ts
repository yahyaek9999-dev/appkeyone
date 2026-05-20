// Daily Report — aggregate.ts
//
// Pulls all numbers needed to build one merchant's daily report from the
// existing tables. Pure read-only. No LLM calls. Single userId per call so
// the cron can fan out tenant-by-tenant with predictable cost.
//
// Time windows (UTC, since SQLite + DateTime fields are UTC):
//   yesterday  : [now - 24h, now)
//   dayBefore  : [now - 48h, now - 24h)
//   week       : [now - 7d,  now)        (used for averages / baselines)
//
// Returns plain numbers — formatting and percentages are computed later in
// `insights.ts` so this module stays trivially testable.

import { prisma } from "@/lib/db";

export interface DailyAggregate {
  userId: string;
  generatedAt: Date;

  // ---- Yesterday ----
  messages: number; // total messages (user + assistant)
  userMessages: number; // inbound from customers
  assistantMessages: number; // outbound from bot/admin
  newCustomers: number; // first message ever yesterday
  ordersCount: number;
  ordersRevenueMinor: number; // sum of total (smallest currency unit, EGP)
  hotLeads: number; // customers with leadScore >= 70 active in last 7d
  hotLeadsAwaiting: number; // hot leads where last msg is from customer (no bot reply)
  unresolvedEscalations: number;
  conversionRatePct: number;
  topHourLocal: number | null; // hour of day with most user messages (server tz)

  // ---- Comparisons ----
  messagesDayBefore: number;
  messagesAvg7d: number;
  ordersDayBefore: number;
  ordersAvg7d: number;
  revenueAvg7dMinor: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function aggregateForUser(
  userId: string,
  now: Date = new Date(),
): Promise<DailyAggregate> {
  const dayStart = new Date(now.getTime() - DAY);
  const dayBeforeStart = new Date(now.getTime() - 2 * DAY);
  const weekStart = new Date(now.getTime() - 7 * DAY);

  // Run independent queries in parallel — same pattern as dashboard/page.tsx.
  const [
    yMsgs,
    yUserMsgs,
    yAsstMsgs,
    dbMsgs,
    weekMsgs,
    yOrders,
    dbOrders,
    weekOrders,
    weekRevenue,
    yNewCustomers,
    hotLeadsCount,
    hotLeadsAwaitingCount,
    unresolvedEscalations,
    yMsgsByHour,
  ] = await Promise.all([
    // total messages yesterday (this user's conversations only)
    prisma.message.count({
      where: {
        createdAt: { gte: dayStart, lt: now },
        conversation: { customer: { userId } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: dayStart, lt: now },
        role: "user",
        conversation: { customer: { userId } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: dayStart, lt: now },
        role: "assistant",
        conversation: { customer: { userId } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: dayBeforeStart, lt: dayStart },
        conversation: { customer: { userId } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: weekStart, lt: now },
        conversation: { customer: { userId } },
      },
    }),
    prisma.order.findMany({
      where: { userId, createdAt: { gte: dayStart, lt: now } },
      select: { total: true },
    }),
    prisma.order.count({
      where: { userId, createdAt: { gte: dayBeforeStart, lt: dayStart } },
    }),
    prisma.order.count({
      where: { userId, createdAt: { gte: weekStart, lt: now } },
    }),
    prisma.order.findMany({
      where: { userId, createdAt: { gte: weekStart, lt: now } },
      select: { total: true },
    }),
    prisma.customer.count({
      where: { userId, createdAt: { gte: dayStart, lt: now } },
    }),
    prisma.customer.count({
      where: {
        userId,
        leadScore: { gte: 70 } as any,
        lastSeenAt: { gte: weekStart },
      },
    }),
    // hot leads where the last message is from customer (no bot reply yet)
    // — done as a raw lookup at the end via a separate query for clarity.
    countHotLeadsAwaiting(userId, weekStart),
    (prisma as any).escalationTicket?.count
      ? (prisma as any).escalationTicket
          .count({
            where: {
              userId,
              status: { in: ["open", "acknowledged", "human_active"] },
            },
          })
          .catch(() => 0)
      : Promise.resolve(0),
    // best hour: group user messages by hour-of-day for yesterday
    prisma.$queryRawUnsafe<{ h: number; n: number }[]>(
      `SELECT CAST(strftime('%H', m.createdAt) AS INTEGER) AS h, COUNT(*) AS n
       FROM Message m
       JOIN Conversation c ON c.id = m.conversationId
       JOIN Customer cu    ON cu.id = c.customerId
       WHERE cu.userId = ? AND m.role = 'user'
         AND m.createdAt >= ? AND m.createdAt < ?
       GROUP BY h ORDER BY n DESC LIMIT 1`,
      userId,
      dayStart.toISOString(),
      now.toISOString(),
    ),
  ]);

  const ordersRevenueMinor = sum(yOrders.map((o) => o.total || 0));
  const revenueAvg7dMinor = Math.round(
    sum(weekRevenue.map((o) => o.total || 0)) / 7,
  );
  const messagesAvg7d = Math.round(weekMsgs / 7);
  const ordersAvg7d = Math.round((weekOrders / 7) * 10) / 10; // 1 decimal
  const conversionRatePct =
    yUserMsgs > 0 ? Math.round((yOrders.length / yUserMsgs) * 1000) / 10 : 0;

  const topHourLocal =
    Array.isArray(yMsgsByHour) && yMsgsByHour.length > 0
      ? Number(yMsgsByHour[0].h)
      : null;

  return {
    userId,
    generatedAt: now,
    messages: yMsgs,
    userMessages: yUserMsgs,
    assistantMessages: yAsstMsgs,
    newCustomers: yNewCustomers,
    ordersCount: yOrders.length,
    ordersRevenueMinor,
    hotLeads: hotLeadsCount,
    hotLeadsAwaiting: hotLeadsAwaitingCount,
    unresolvedEscalations,
    conversionRatePct,
    topHourLocal,
    messagesDayBefore: dbMsgs,
    messagesAvg7d,
    ordersDayBefore: dbOrders,
    ordersAvg7d,
    revenueAvg7dMinor,
  };
}

/**
 * Count customers with leadScore >= 70 whose latest conversation message is
 * from `role=user` (i.e. the merchant hasn't replied yet). Cheap query: pull
 * the candidate set, then look at the most recent message per conversation.
 */
async function countHotLeadsAwaiting(
  userId: string,
  weekStart: Date,
): Promise<number> {
  const candidates = await prisma.customer.findMany({
    where: {
      userId,
      leadScore: { gte: 70 } as any,
      lastSeenAt: { gte: weekStart },
    },
    select: {
      id: true,
      conversation: {
        select: {
          id: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { role: true },
          },
        },
      },
    },
    take: 200, // sane upper bound
  });
  let n = 0;
  for (const c of candidates) {
    const last = c.conversation?.messages[0];
    if (last && last.role === "user") n++;
  }
  return n;
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
