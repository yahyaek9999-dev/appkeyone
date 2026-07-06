/**
 * lib/admin/reports.ts — Executive Reporting (Phase 11). Daily/weekly/monthly
 * windows over existing tables.
 */
import { prisma } from "@/lib/db";

function round(n: number): number { return Math.round((n || 0) * 100) / 100; }

export type ReportPeriod = "daily" | "weekly" | "monthly";

export async function generateExecutiveReport(period: ReportPeriod) {
  const now = new Date();
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const since = new Date(now.getTime() - days * 86400000);
  const [pay, meta, walletDebit, brainUsage, customers, orders] = await Promise.all([
    prisma.paymentTransaction.aggregate({ where: { status: "paid", reconciledAt: { gte: since } }, _sum: { amountUsd: true } }),
    prisma.metaUsageRecord.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true, metaCostUsd: true } }),
    prisma.walletLedger.aggregate({ where: { direction: "debit", createdAt: { gte: since } }, _sum: { amountUsd: true } }),
    prisma.brainMessage.count({ where: { createdAt: { gte: since } } }),
    prisma.customer.count({ where: { createdAt: { gte: since } } }),
    prisma.order.count({ where: { createdAt: { gte: since } } }),
  ]);
  const metaCharged = round(meta._sum.costUsd || 0);
  const metaCost = round(meta._sum.metaCostUsd || 0);
  return {
    period, since: since.toISOString(), days,
    revenue: round(pay._sum.amountUsd || 0),
    profit: round(metaCharged - metaCost),
    metaUsage: metaCharged, metaCost,
    walletUsage: round(walletDebit._sum.amountUsd || 0),
    brainUsage, customerGrowth: customers, orders,
  };
}

export async function getAllReports() {
  const [daily, weekly, monthly] = await Promise.all([
    generateExecutiveReport("daily"),
    generateExecutiveReport("weekly"),
    generateExecutiveReport("monthly"),
  ]);
  return { daily, weekly, monthly };
}
