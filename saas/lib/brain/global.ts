/**
 * lib/brain/global.ts — Global Brain (Phase 1). Anonymized cross-tenant
 * aggregation. NEVER stores tenant/customer identity — only counts + patterns.
 */
import { prisma } from "@/lib/db";

/** Aggregate Brain insight COUNTS across all tenants into GlobalBrainInsight. */
export async function aggregateGlobalInsights(period = "all"): Promise<{ types: number; total: number }> {
  const byType = await prisma.brainInsight.groupBy({ by: ["type"], _count: { type: true } });
  let total = 0;
  for (const r of byType) {
    const count = r._count.type;
    total += count;
    await prisma.globalBrainInsight.upsert({
      where: { type_industry_dialect_period: { type: r.type, industry: "all", dialect: "", period } },
      create: { type: r.type, industry: "all", dialect: "", period, count, weight: count },
      update: { count, weight: count },
    }).catch(() => {});
  }
  return { types: byType.length, total };
}

export async function getGlobalBrainStats() {
  const [insights, patterns, knowledge, topInsights, topPatterns] = await Promise.all([
    prisma.globalBrainInsight.count(),
    prisma.globalBrainPattern.count(),
    prisma.globalBrainKnowledge.count(),
    prisma.globalBrainInsight.findMany({ orderBy: { count: "desc" }, take: 20, select: { type: true, industry: true, count: true } }),
    prisma.globalBrainPattern.findMany({ orderBy: { occurrences: "desc" }, take: 20, select: { patternType: true, key: true, occurrences: true, successRate: true, industry: true } }),
  ]);
  return { insights, patterns, knowledge, topInsights, topPatterns };
}
