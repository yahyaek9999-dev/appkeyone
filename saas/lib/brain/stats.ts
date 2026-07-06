/**
 * lib/brain/stats.ts — aggregations for the Brain Centers (Phase 10 + 11).
 */
import { prisma } from "@/lib/db";

export async function getBrainAdminStats() {
  const [memoryRecords, profiles, brainMessages, creditsAgg, walletCount, byType, byDialect, byIndustry, usedAgg] = await Promise.all([
    prisma.brainMemory.count(),
    prisma.brainProfile.count(),
    prisma.brainMessage.count(),
    prisma.brainCreditWallet.aggregate({ _sum: { balance: true, totalSpent: true } }),
    prisma.brainCreditWallet.count(),
    prisma.brainInsight.groupBy({ by: ["type"], _count: { type: true } }),
    prisma.brainProfile.groupBy({ by: ["dialect"], _count: { dialect: true } }),
    prisma.brainProfile.groupBy({ by: ["industry"], _count: { industry: true } }),
    prisma.brainMessage.aggregate({ _sum: { creditsUsed: true } }),
  ]);
  return {
    memoryRecords, profiles, brainMessages,
    creditsBalance: creditsAgg._sum.balance || 0,
    creditsSpent: creditsAgg._sum.totalSpent || 0,
    walletCount,
    creditsUsed: usedAgg._sum.creditsUsed || 0,
    byType: byType.map((r) => ({ type: r.type, count: r._count.type })).sort((a, b) => b.count - a.count),
    byDialect: byDialect.map((r) => ({ dialect: r.dialect || "—", count: r._count.dialect })).sort((a, b) => b.count - a.count),
    byIndustry: byIndustry.map((r) => ({ industry: r.industry, count: r._count.industry })).sort((a, b) => b.count - a.count),
  };
}

export async function getBrainTenantStats(userId: string) {
  const [memoryRecords, brainMessages, wallet, byType, topProfiles, usedAgg] = await Promise.all([
    prisma.brainMemory.count({ where: { userId } }),
    prisma.brainMessage.count({ where: { userId } }),
    prisma.brainCreditWallet.findUnique({ where: { userId } }),
    prisma.brainInsight.groupBy({ by: ["type"], where: { userId }, _count: { type: true } }),
    prisma.brainProfile.findMany({ where: { userId }, orderBy: { leadScore: "desc" }, take: 20, select: { customerId: true, industry: true, dialect: true, leadScore: true, stage: true, updatedAt: true } }),
    prisma.brainMessage.aggregate({ where: { userId }, _sum: { creditsUsed: true } }),
  ]);
  return {
    memoryRecords, brainMessages,
    balance: wallet?.balance || 0,
    totalSpent: wallet?.totalSpent || 0,
    creditsUsed: usedAgg._sum.creditsUsed || 0,
    byType: byType.map((r) => ({ type: r.type, count: r._count.type })).sort((a, b) => b.count - a.count),
    topProfiles,
  };
}
