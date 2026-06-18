/**
 * GET /api/broadcast-credits/analytics — aggregate stats for this user's
 * credit-funded campaigns: campaign count, recipients, sent, failed, and credits
 * spent/refunded (from the credit ledger). Backs the Analytics tiles on the
 * credit-campaigns dashboard. Owner-only via "broadcasts" gate. Read-only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await apiGate("broadcasts", "broadcasts");
  if (g.response) return g.response;
  const uid = g.uid!;

  const [agg, byStatus, ledger] = await Promise.all([
    prisma.broadcast.aggregate({
      where: { userId: uid, viaCredits: true } as any,
      _count: { _all: true },
      _sum: { total: true, sent: true, failed: true },
    }),
    prisma.broadcast.groupBy({
      by: ["status"],
      where: { userId: uid, viaCredits: true } as any,
      _count: { _all: true },
    }),
    prisma.broadcastCreditLedger.findMany({
      where: { userId: uid },
      select: { direction: true, kind: true, amount: true },
    }),
  ]);

  // Credits spent on campaigns vs refunded back (net consumption picture).
  let spent = 0;
  let refunded = 0;
  for (const r of ledger) {
    if (r.direction === "debit" && r.kind === "campaign") spent += r.amount;
    else if (r.direction === "credit" && r.kind === "refund") refunded += r.amount;
  }

  const statusCounts: Record<string, number> = {};
  for (const s of byStatus) statusCounts[s.status] = s._count._all;

  return NextResponse.json({
    ok: true,
    totals: {
      campaigns: agg._count._all,
      recipients: agg._sum.total || 0,
      sent: agg._sum.sent || 0,
      failed: agg._sum.failed || 0,
      creditsSpent: spent,
      creditsRefunded: refunded,
    },
    byStatus: statusCounts,
  });
}
