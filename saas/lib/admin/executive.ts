/**
 * lib/admin/executive.ts — Admin Super Center executive aggregation (Phase 6).
 * Reuses existing tables; computes MRR/ARR, revenue/profit, liabilities, usage.
 */
import { prisma } from "@/lib/db";

function round(n: number): number { return Math.round((n || 0) * 100) / 100; }

export async function getExecutiveStats() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const [activeSubs, walletAgg, brainWalletAgg, bcastWalletAgg, payAgg, metaAgg, qrActive, qrReservations, apiUsage, brainUsage, broadcastUsage, customers, customers30, planGroups, topWallets] = await Promise.all([
    prisma.subscription.findMany({ where: { status: "active", expiresAt: { gt: now } }, select: { billingCycle: true, plan: { select: { priceUsd: true, yearlyUsd: true } } } }),
    prisma.wallet.aggregate({ _sum: { balanceUsd: true } }),
    prisma.brainCreditWallet.aggregate({ _sum: { balance: true } }),
    prisma.broadcastCreditWallet.aggregate({ _sum: { balance: true } }),
    prisma.paymentTransaction.aggregate({ where: { status: "paid" }, _sum: { amountUsd: true }, _count: true }),
    prisma.metaUsageRecord.aggregate({ _sum: { costUsd: true, metaCostUsd: true } }),
    prisma.qrReservation.count({ where: { status: "active" } }),
    prisma.qrReservation.count(),
    prisma.apiRequestLog.count(),
    prisma.brainMessage.count(),
    prisma.broadcastCreditLedger.count({ where: { direction: "debit" } }),
    prisma.customer.count(),
    prisma.customer.count({ where: { createdAt: { gte: since30 } } }),
    prisma.subscription.groupBy({ by: ["planId"], where: { status: "active", expiresAt: { gt: now } }, _count: { planId: true } }),
    prisma.wallet.findMany({ orderBy: { balanceUsd: "desc" }, take: 10, select: { userId: true, balanceUsd: true, totalSpentUsd: true } }),
  ]);

  let mrr = 0;
  for (const s of activeSubs) {
    const price = s.plan?.priceUsd || 0;
    const yearly = s.plan?.yearlyUsd || 0;
    mrr += s.billingCycle === "yearly" && yearly > 0 ? yearly / 12 : price;
  }

  const metaCharged = metaAgg._sum.costUsd || 0;
  const metaCost = metaAgg._sum.metaCostUsd || 0;

  const planIds = planGroups.map((g) => g.planId);
  const plans = await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, slug: true } });
  const slugById = Object.fromEntries(plans.map((p) => [p.id, p.slug]));
  const topPlans = planGroups.map((g) => ({ slug: slugById[g.planId] || g.planId, count: g._count.planId })).sort((a, b) => b.count - a.count);

  return {
    mrr: round(mrr), arr: round(mrr * 12), activeSubs: activeSubs.length,
    topupRevenue: round(payAgg._sum.amountUsd || 0), paidCount: payAgg._count || 0,
    metaCharged: round(metaCharged), metaCost: round(metaCost), metaProfit: round(metaCharged - metaCost),
    walletLiability: round(walletAgg._sum.balanceUsd || 0),
    brainCreditsLiability: brainWalletAgg._sum.balance || 0,
    broadcastCreditsLiability: bcastWalletAgg._sum.balance || 0,
    qrActive, qrReservations, apiUsage, brainUsage, broadcastUsage,
    customers, customers30, topPlans, topWallets,
  };
}
