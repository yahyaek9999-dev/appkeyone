// Sales Brain — revenue.ts
//
// Revenue Intelligence for the Sales Brain command center. Pure read-only,
// no LLM, computed entirely from the existing Order / OrderItem / Customer
// tables. Single userId per call so the dashboard request stays cheap.
//
// Money is stored as integer EGP in the schema (Order.total, OrderItem.*),
// so every number here is already in whole EGP — no minor-unit conversion.

import { prisma } from "@/lib/db";
import { startOfLocalDay, localYmd } from "@/lib/tz";

const DAY = 24 * 60 * 60 * 1000;
const REVENUE_TZ = "Africa/Cairo";

export interface BestSeller {
  name: string;
  qty: number;
  revenue: number;
}

export interface RevenueIntel {
  // ---- Money ----
  revenueToday: number; // sum(order.total) for orders created today
  revenue7d: number; // trailing 7 days
  aov: number; // average order value over the trailing 7 days
  // ---- Trend ----
  weeklyTrend: { day: string; total: number }[]; // last 7 days, oldest → newest
  // ---- Conversion ----
  conversionRatePct: number; // 7d orders / 7d customers who messaged
  // ---- Loyalty ----
  repeatCustomers: number; // customers with >= 2 confirmed orders
  customersWithOrders: number;
  // ---- Catalog ----
  bestSellers: BestSeller[]; // top 8 by quantity (last 30 days)
}

export async function revenueIntelligence(
  userId: string,
  now: Date = new Date(),
): Promise<RevenueIntel> {
  // Local (Cairo) day boundary, not the server's own local time — a plain
  // setHours(0,0,0,0) runs in UTC on the production box, ~3h off this market.
  const todayStart = startOfLocalDay(REVENUE_TZ, now);
  const weekStart = new Date(now.getTime() - 7 * DAY);
  const monthStart = new Date(now.getTime() - 30 * DAY);

  const [
    todayOrders,
    weekOrders,
    activeCustomers7d,
    customerOrderRows,
    bestSellerRows,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { userId, createdAt: { gte: todayStart } },
      select: { total: true },
    }),
    prisma.order.findMany({
      where: { userId, createdAt: { gte: weekStart } },
      select: { total: true, createdAt: true },
    }),
    // distinct customers who sent a message in the last 7 days
    prisma.customer.count({
      where: { userId, lastSeenAt: { gte: weekStart } },
    }),
    // repeat-customer + total-with-orders rollups (uses denormalized orderCount).
    // Guarded like the best-sellers query below: if the column is unavailable
    // on a not-yet-migrated DB, degrade to 0 instead of 500-ing the dashboard.
    prisma.customer
      .findMany({
        where: { userId, orderCount: { gt: 0 } },
        select: { orderCount: true },
      })
      .catch(() => [] as { orderCount: number }[]),
    // best sellers — OrderItem has no userId, so join through Order.
    // "Order" is quoted because ORDER is a SQL keyword.
    prisma.$queryRawUnsafe<{ name: string; qty: number; revenue: number }[]>(
      `SELECT oi.name AS name,
              SUM(oi.quantity) AS qty,
              SUM(oi."lineTotal") AS revenue
       FROM "OrderItem" oi
       JOIN "Order" o ON o.id = oi."orderId"
       WHERE o."userId" = $1 AND o."createdAt" >= $2
       GROUP BY oi.name
       ORDER BY qty DESC
       LIMIT 8`,
      userId,
      // Pass the Date object directly — Prisma's raw query adapter converts it
      // to the correct DB representation (INTEGER epoch-ms on SQLite,
      // TIMESTAMP on PostgreSQL). Avoid .toISOString() which sends TEXT
      // and fails to match SQLite's INTEGER storage, AND avoid .getTime()
      // which sends a bare integer that PG won't understand.
      monthStart,
    ).catch(() => []),
  ]);

  const revenueToday = sum(todayOrders.map((o) => o.total || 0));
  const revenue7d = sum(weekOrders.map((o) => o.total || 0));
  const aov =
    weekOrders.length > 0 ? Math.round(revenue7d / weekOrders.length) : 0;

  // Weekly trend: bucket the 7d orders by local (Cairo) calendar day, oldest
  // → newest — localYmd, not toISOString(), so orders placed late evening
  // Cairo time (still early UTC the next day) land in the right bucket.
  const trendMap = new Map<string, number>();
  for (const o of weekOrders) {
    const key = localYmd(REVENUE_TZ, o.createdAt);
    trendMap.set(key, (trendMap.get(key) || 0) + (o.total || 0));
  }
  const weeklyTrend: { day: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    const key = localYmd(REVENUE_TZ, d);
    weeklyTrend.push({ day: key, total: trendMap.get(key) || 0 });
  }

  const conversionRatePct =
    activeCustomers7d > 0
      ? Math.round((weekOrders.length / activeCustomers7d) * 1000) / 10
      : 0;

  const customersWithOrders = customerOrderRows.length;
  const repeatCustomers = customerOrderRows.filter(
    (c) => (c.orderCount || 0) >= 2,
  ).length;

  const bestSellers: BestSeller[] = (bestSellerRows || []).map((r) => ({
    name: String(r.name || "—"),
    qty: Number(r.qty || 0),
    revenue: Number(r.revenue || 0),
  }));

  return {
    revenueToday,
    revenue7d,
    aov,
    weeklyTrend,
    conversionRatePct,
    repeatCustomers,
    customersWithOrders,
    bestSellers,
  };
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}
