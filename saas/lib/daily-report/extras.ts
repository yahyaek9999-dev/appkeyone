// Daily Report — Growth Suite enrichment.
//
// Bounded, read-only extras the owner digest now includes: best-seller,
// low-stock alerts, customers-needing-follow-up, at-risk customers, and the
// top-converting recent campaign. Each query is independently guarded so a
// single failure never breaks the digest. Called once/day per user by cron.

import { prisma } from "@/lib/db";
import { detectFollowUpOps } from "@/lib/intel/follow-up-ops";
import { computeBroadcastAnalytics } from "@/lib/broadcasts/analytics";

const DAY = 86_400_000;

export interface DigestExtras {
  bestSeller: { name: string; qty: number } | null;
  lowStockCount: number;
  lowStockSample: string[];
  followUpsNeeded: number;
  atRiskCount: number;
  topCampaign: { title: string; convRatePct: number } | null;
}

export async function buildDigestExtras(userId: string, now: Date = new Date()): Promise<DigestExtras> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);

  const [bestSellerRows, lowStock, followUps, atRiskCount, recentBroadcasts] = await Promise.all([
    prisma.$queryRawUnsafe<{ name: string; qty: number }[]>(
      `SELECT oi.name AS name, SUM(oi.quantity) AS qty
       FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
       WHERE o."userId" = $1 AND o."createdAt" >= $2 AND o.status != 'canceled'
       GROUP BY oi.name ORDER BY qty DESC LIMIT 1`,
      userId,
      weekAgo,
    ).catch(() => [] as { name: string; qty: number }[]),
    prisma.product
      .findMany({ where: { userId, active: true, stock: { lte: 3 } }, select: { name: true }, take: 5 })
      .catch(() => [] as { name: string }[]),
    detectFollowUpOps(userId, now).catch(() => [] as any[]),
    prisma.customer.count({ where: { userId, churnRiskScore: { gte: 50 } } }).catch(() => 0),
    prisma.broadcast
      .findMany({ where: { userId, status: "done" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, title: true } })
      .catch(() => [] as { id: string; title: string }[]),
  ]);

  // Top-converting recent campaign (bounded to the last 3 done broadcasts).
  let topCampaign: DigestExtras["topCampaign"] = null;
  for (const b of recentBroadcasts) {
    const stats = await computeBroadcastAnalytics(userId, b.id).catch(() => null);
    if (stats && (!topCampaign || stats.convRatePct > topCampaign.convRatePct)) {
      topCampaign = { title: b.title, convRatePct: stats.convRatePct };
    }
  }

  return {
    bestSeller: bestSellerRows[0] ? { name: String(bestSellerRows[0].name || "—"), qty: Number(bestSellerRows[0].qty || 0) } : null,
    lowStockCount: lowStock.length,
    lowStockSample: lowStock.map((p) => p.name),
    followUpsNeeded: Array.isArray(followUps) ? followUps.length : 0,
    atRiskCount,
    topCampaign,
  };
}
