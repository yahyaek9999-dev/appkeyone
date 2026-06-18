/**
 * lib/brain/learning.ts — Daily Learning Pipeline (Phase 10).
 * Inputs: BrainInsights, Orders, sales/support outcomes. Output: anonymized
 * GlobalBrainPatterns. Records a DailyBrainLearning run. No tenant data stored.
 */
import { prisma } from "@/lib/db";
import { aggregateGlobalInsights } from "./global";

export function learningPeriod(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function patternTypeFor(insightType: string): string {
  if (insightType === "PRICE_OBJECTION" || insightType === "DISCOUNT_REQUEST") return "objection";
  if (insightType === "BUYING_SIGNAL") return "buying_signal";
  if (insightType === "ANGRY_CUSTOMER") return "support_resolution";
  return "lead_outcome";
}

export async function runDailyBrainLearning(period = learningPeriod()): Promise<{ insightsProcessed: number; ordersProcessed: number; patternsCreated: number; patternsUpdated: number }> {
  const agg = await aggregateGlobalInsights("all");
  const byType = await prisma.brainInsight.groupBy({ by: ["type"], _count: { type: true } });
  const ordersCount = await prisma.order.count();
  const wonProfiles = await prisma.brainProfile.count({ where: { stage: "won" } });
  const totalProfiles = await prisma.brainProfile.count();
  const successRate = totalProfiles > 0 ? Math.round((wonProfiles / totalProfiles) * 1000) / 1000 : 0;

  let created = 0, updated = 0;
  for (const r of byType) {
    const patternType = patternTypeFor(r.type);
    const existing = await prisma.globalBrainPattern.findUnique({ where: { patternType_key_industry: { patternType, key: r.type, industry: "all" } } }).catch(() => null);
    if (existing) {
      await prisma.globalBrainPattern.update({ where: { id: existing.id }, data: { occurrences: r._count.type, successRate, sampleSize: totalProfiles } }).catch(() => {});
      updated++;
    } else {
      await prisma.globalBrainPattern.create({ data: { patternType, key: r.type, industry: "all", occurrences: r._count.type, successRate, sampleSize: totalProfiles, context: "auto" } }).catch(() => {});
      created++;
    }
  }

  await prisma.dailyBrainLearning.upsert({
    where: { period },
    create: { period, insightsProcessed: agg.total, ordersProcessed: ordersCount, patternsCreated: created, patternsUpdated: updated, status: "ok", detail: `won=${wonProfiles}/${totalProfiles}` },
    update: { insightsProcessed: agg.total, ordersProcessed: ordersCount, patternsCreated: created, patternsUpdated: updated, status: "ok", detail: `won=${wonProfiles}/${totalProfiles}` },
  }).catch(() => {});

  return { insightsProcessed: agg.total, ordersProcessed: ordersCount, patternsCreated: created, patternsUpdated: updated };
}
