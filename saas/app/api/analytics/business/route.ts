// Business Analytics API — cohort retention, repeat-purchase rate, revenue by
// segment, and campaign ROI. Read-only; consumes lib/analytics/* so the data
// layer is never duplicated. All numbers are derived from Order facts via
// getOrderRollup (the denormalised Customer counters are 0 — never trust them).

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { getOrderRollup } from "@/lib/analytics/order-rollup";
import { computeSegments } from "@/lib/analytics/segments";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAID_STATUSES = new Set(["confirmed", "preparing", "shipped", "out_for_delivery", "delivered"]);
const DAY = 86_400_000;

async function getBroadcastROI(userId: string) {
  const broadcasts = await prisma.broadcast
    .findMany({
      where: { userId, status: { in: ["done", "sending"] }, sent: { gt: 0 } },
      select: { id: true, title: true, sent: true, failed: true, startedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    .catch(() => []);

  if (broadcasts.length === 0) return [];

  return Promise.all(
    broadcasts.map(async (bc) => {
      const threshold = bc.startedAt || bc.createdAt;
      const sentItems = await prisma.broadcastItem
        .findMany({ where: { broadcastId: bc.id, status: "sent" }, select: { customerId: true }, take: 3000 })
        .catch(() => []);
      const recipientIds = [...new Set(sentItems.map((i) => i.customerId))];

      let replied = 0;
      let conversion = 0;
      let revenue = 0;
      if (recipientIds.length > 0) {
        const [repliedRows, orders] = await Promise.all([
          prisma.message
            .findMany({
              where: { role: "user", createdAt: { gt: threshold }, conversation: { customerId: { in: recipientIds } } },
              select: { conversation: { select: { customerId: true } } },
              take: 5000,
            })
            .catch(() => []),
          prisma.order
            .findMany({
              where: { userId, customerId: { in: recipientIds }, createdAt: { gt: threshold } },
              select: { customerId: true, total: true, status: true },
              take: 5000,
            })
            .catch(() => []),
        ]);
        replied = new Set(repliedRows.map((m) => m.conversation?.customerId).filter(Boolean)).size;
        const convOrders = orders.filter((o) => PAID_STATUSES.has(o.status));
        conversion = new Set(convOrders.map((o) => o.customerId)).size;
        revenue = convOrders.reduce((s, o) => s + (o.total || 0), 0);
      }

      const sent = bc.sent || 0;
      return {
        id: bc.id,
        title: bc.title,
        sent,
        failed: bc.failed || 0,
        replied,
        conversion,
        revenue,
        replyRatePct: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
        convRatePct: sent > 0 ? Math.round((conversion / sent) * 1000) / 10 : 0,
        createdAt: bc.createdAt.toISOString(),
      };
    }),
  );
}

function buildCohortRetention(rollup: Awaited<ReturnType<typeof getOrderRollup>>) {
  // Monthly cohorts based on firstOrderAt. For each cohort month count:
  //   - total unique customers who made their first order that month
  //   - how many of them made a 2nd order (repeat_m1)
  const byMonth = new Map<string, { total: number; repeat: number }>();

  for (const [, stats] of rollup.byCustomer) {
    if (!stats.firstOrderAt) continue;
    const month = new Date(stats.firstOrderAt).toISOString().slice(0, 7);
    const agg = byMonth.get(month) || { total: 0, repeat: 0 };
    agg.total++;
    if (stats.paidOrders >= 2) agg.repeat++;
    byMonth.set(month, agg);
  }

  const cohorts = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 12)
    .map(([month, agg]) => ({
      month,
      total: agg.total,
      repeat: agg.repeat,
      retentionPct: agg.total > 0 ? Math.round((agg.repeat / agg.total) * 1000) / 10 : 0,
    }));

  return cohorts;
}

export async function GET() {
  const gate = await apiGate("advanced_analytics");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();

  const [rollup, segmentsResult, broadcastROI, orderCount30d] = await Promise.all([
    getOrderRollup(uid),
    computeSegments(uid).catch(() => null),
    getBroadcastROI(uid),
    prisma.order
      .count({ where: { userId: uid, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } })
      .catch(() => 0),
  ]);

  const cohorts = buildCohortRetention(rollup);

  const repeatPurchasePct =
    rollup.totals.customersWithOrders > 0
      ? Math.round((rollup.totals.repeatCustomers / rollup.totals.customersWithOrders) * 1000) / 10
      : 0;

  // Revenue by segment: take each segment's revenue from the computed segments.
  const segmentRevenue = (segmentsResult?.segments || [])
    .filter((s) => s.count > 0 && s.revenue > 0)
    .map((s) => ({ key: s.key, label: s.label, revenue: s.revenue, count: s.count, aov: s.aov }))
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    totals: {
      ...rollup.totals,
      repeatPurchasePct,
      orderCount30d,
    },
    cohortRetention: cohorts,
    segmentRevenue,
    broadcastROI,
    truncated: rollup.truncated,
  });
}
