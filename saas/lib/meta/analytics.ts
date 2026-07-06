/**
 * Meta Enterprise — platform analytics (admin dashboard).
 * Aggregates conversations, cost, revenue, category/country breakdown, top
 * customers, daily trend, and open-incident count from the live tables.
 */

import { prisma } from "@/lib/db";

export async function getMetaAnalytics(opts: { days?: number } = {}) {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = since.toISOString().slice(0, 10);

  const [convAgg, byCategory, byCountry, txnAgg, topRaw, dailyRaw, openIncidents] =
    await Promise.all([
      prisma.metaConversation.aggregate({
        where: { windowStart: { gte: since } },
        _count: { _all: true },
        _sum: { costMicroUsd: true, chargedMicroUsd: true },
      }),
      prisma.metaConversation.groupBy({
        by: ["category"],
        where: { windowStart: { gte: since } },
        _count: { _all: true },
        _sum: { chargedMicroUsd: true },
      }),
      prisma.metaConversation.groupBy({
        by: ["country"],
        where: { windowStart: { gte: since } },
        _count: { _all: true },
      }),
      prisma.metaTransaction.aggregate({
        where: { kind: "charge", createdAt: { gte: since } },
        _sum: { amountEgp: true },
      }),
      prisma.metaConversation.groupBy({
        by: ["userId"],
        where: { windowStart: { gte: since } },
        _count: { _all: true },
        _sum: { chargedMicroUsd: true },
        orderBy: { _sum: { chargedMicroUsd: "desc" } },
        take: 10,
      }),
      prisma.metaUsageDaily.findMany({
        where: { day: { gte: sinceDay } },
        orderBy: { day: "asc" },
      }),
      prisma.metaIncident.count({ where: { status: { in: ["open", "acknowledged"] } } }),
    ]);

  const ids = topRaw.map((t) => t.userId);
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const topCustomers = topRaw.map((t) => ({
    userId: t.userId,
    name: byId.get(t.userId)?.name || byId.get(t.userId)?.email || t.userId,
    conversations: t._count._all,
    chargedMicroUsd: t._sum.chargedMicroUsd ?? 0,
  }));

  const dailyMap = new Map<string, number>();
  for (const d of dailyRaw) dailyMap.set(d.day, (dailyMap.get(d.day) ?? 0) + d.conversations);
  const trend = Array.from(dailyMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, conversations]) => ({ day, conversations }));

  const charged = convAgg._sum.chargedMicroUsd ?? 0;
  const cost = convAgg._sum.costMicroUsd ?? 0;
  return {
    days,
    totals: {
      conversations: convAgg._count._all,
      costMicroUsd: cost,
      chargedMicroUsd: charged,
      revenueMicroUsd: charged - cost,
      chargedEgp: Math.abs(txnAgg._sum.amountEgp ?? 0),
    },
    byCategory: byCategory.map((c) => ({
      category: c.category,
      conversations: c._count._all,
      chargedMicroUsd: c._sum.chargedMicroUsd ?? 0,
    })),
    byCountry: byCountry.map((c) => ({ country: c.country, conversations: c._count._all })),
    topCustomers,
    trend,
    openIncidents,
  };
}

export function analyticsToCsv(a: Awaited<ReturnType<typeof getMetaAnalytics>>): string {
  const lines: string[] = ["section,key,conversations,charged_usd"];
  lines.push(`totals,all,${a.totals.conversations},${(a.totals.chargedMicroUsd / 1e6).toFixed(4)}`);
  for (const c of a.byCategory)
    lines.push(`category,${c.category},${c.conversations},${(c.chargedMicroUsd / 1e6).toFixed(4)}`);
  for (const c of a.byCountry) lines.push(`country,${c.country},${c.conversations},`);
  for (const t of a.topCustomers)
    lines.push(
      `top_customer,"${(t.name || "").replace(/"/g, '""')}",${t.conversations},${(t.chargedMicroUsd / 1e6).toFixed(4)}`,
    );
  return lines.join("\n");
}
