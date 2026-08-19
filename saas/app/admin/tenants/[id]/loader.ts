// Tenant 360 data loader — bounded, real aggregation over existing models.
// No new business logic: reuses User/Subscription/Bot/Order/Customer/Wallet/
// PaymentProof/Incident/AuditLog + the deterministic tenant-health scorer.
// Every query is scoped to the single tenant and capped. Returns null when the
// tenant does not exist so the page can 404 cleanly.

import { prisma } from "@/lib/db";
import { getTenantHealth, type TenantHealth } from "@/lib/admin/tenant-health";

export type Tenant360 = {
  user: { id: string; email: string; name: string | null; phone: string | null; createdAt: Date; suspended: boolean; approvalStatus: string };
  subscription: { status: string; planName: string; billingCycle: string; startedAt: Date; expiresAt: Date; trialEndsAt: Date | null; msgsUsed: number; aiRequestsUsed: number; broadcastsUsed: number } | null;
  bot: { whatsappStatus: string; whatsappPhone: string | null; connectionMode: string } | null;
  wallet: { balanceUsd: number; status: string; totalToppedUpUsd: number; totalSpentUsd: number } | null;
  counts: { orders: number; customers: number; ordersLast7d: number; openIncidents: number };
  revenueEgp: number;
  recentOrders: { id: string; total: number; currency: string; status: string; createdAt: Date }[];
  recentPayments: { id: string; amountUsd: number; status: string; methodKey: string; createdAt: Date }[];
  incidents: { id: string; title: string; severity: string; status: string; createdAt: Date }[];
  security: { id: string; action: string; actorEmail: string | null; targetType: string | null; createdAt: Date }[];
  health: TenantHealth;
};

export async function loadTenant360(id: string): Promise<Tenant360 | null> {
  const user = await prisma.user
    .findUnique({
      where: { id },
      select: { id: true, email: true, name: true, phone: true, createdAt: true, suspended: true, approvalStatus: true },
    })
    .catch(() => null);
  if (!user) return null;

  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400000);

  const [sub, bot, wallet, ordersCount, customersCount, ordersLast7d, openIncidents, deliveredAgg, recentOrders, recentPayments, incidents, security, health] =
    await Promise.all([
      prisma.subscription
        .findUnique({ where: { userId: id }, include: { plan: { select: { name: true } } } })
        .catch(() => null),
      prisma.bot.findUnique({ where: { userId: id }, select: { whatsappStatus: true, whatsappPhone: true, connectionMode: true } }).catch(() => null),
      (prisma as any).wallet?.findUnique({ where: { userId: id }, select: { balanceUsd: true, status: true, totalToppedUpUsd: true, totalSpentUsd: true } }).catch(() => null) ?? null,
      prisma.order.count({ where: { userId: id } }).catch(() => 0),
      prisma.customer.count({ where: { userId: id } }).catch(() => 0),
      prisma.order.count({ where: { userId: id, createdAt: { gte: weekAgo } } }).catch(() => 0),
      (prisma as any).incident?.count({ where: { userId: id, status: { in: ["open", "assigned"] } } }).catch(() => 0) ?? 0,
      prisma.order.aggregate({ where: { userId: id, status: "delivered" }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } }) as any),
      prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, total: true, currency: true, status: true, createdAt: true } }).catch(() => []),
      (prisma as any).paymentProof?.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, amountUsd: true, status: true, methodKey: true, createdAt: true } }).catch(() => []) ?? [],
      (prisma as any).incident?.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, severity: true, status: true, createdAt: true } }).catch(() => []) ?? [],
      (prisma as any).auditLog?.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true, action: true, actorEmail: true, targetType: true, createdAt: true } }).catch(() => []) ?? [],
      getTenantHealth(id),
    ]);

  return {
    user,
    subscription: sub
      ? {
          status: sub.status,
          planName: (sub as any).plan?.name ?? "—",
          billingCycle: sub.billingCycle,
          startedAt: sub.startedAt,
          expiresAt: sub.expiresAt,
          trialEndsAt: (sub as any).trialEndsAt ?? null,
          msgsUsed: sub.msgsUsed ?? 0,
          aiRequestsUsed: (sub as any).aiRequestsUsed ?? 0,
          broadcastsUsed: (sub as any).broadcastsUsed ?? 0,
        }
      : null,
    bot: bot ? { whatsappStatus: bot.whatsappStatus, whatsappPhone: bot.whatsappPhone, connectionMode: bot.connectionMode } : null,
    wallet: wallet ? { balanceUsd: wallet.balanceUsd ?? 0, status: wallet.status ?? "—", totalToppedUpUsd: wallet.totalToppedUpUsd ?? 0, totalSpentUsd: wallet.totalSpentUsd ?? 0 } : null,
    counts: { orders: ordersCount, customers: customersCount, ordersLast7d, openIncidents },
    revenueEgp: (deliveredAgg as any)?._sum?.total ?? 0,
    recentOrders,
    recentPayments,
    incidents,
    security,
    health,
  };
}
