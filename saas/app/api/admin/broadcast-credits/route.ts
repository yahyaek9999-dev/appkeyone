/**
 * GET /api/admin/broadcast-credits — platform-wide broadcast-credit overview.
 * Sums wallet balances/purchased/spent, the QR slot queue counts by status, and
 * the pending purchase-request count. Admin-only; read-only.
 */
import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdmin(); }
  catch (e) { return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) }); }

  const [walletAgg, walletCount, queueGroups, pendingPurchases, campaignAgg] = await Promise.all([
    prisma.broadcastCreditWallet.aggregate({
      _sum: { balance: true, totalPurchased: true, totalSpent: true },
    }),
    prisma.broadcastCreditWallet.count(),
    prisma.qrSlotJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.broadcastCreditPurchaseRequest.count({ where: { status: "pending" } }),
    prisma.broadcast.aggregate({
      where: { viaCredits: true } as any,
      _count: { _all: true },
      _sum: { sent: true, failed: true },
    }),
  ]);

  const queue: Record<string, number> = {};
  for (const q of queueGroups) queue[q.status] = q._count._all;

  return NextResponse.json({
    ok: true,
    totals: {
      walletCount,
      totalBalance: walletAgg._sum.balance || 0,
      totalPurchased: walletAgg._sum.totalPurchased || 0,
      totalSpent: walletAgg._sum.totalSpent || 0,
      campaigns: campaignAgg._count._all,
      sent: campaignAgg._sum.sent || 0,
      failed: campaignAgg._sum.failed || 0,
      pendingPurchases,
    },
    queue,
  });
}
