/**
 * Messaging analytics — Phase 4.
 *
 * Returns counts and rolling rates for the merchant's outbound traffic
 * across BOTH providers. Used by the compliance dashboard and any future
 * admin tooling. Data source: WaMessage + WaComplianceAudit (real rows).
 *
 * Query:
 *   GET /api/analytics/messaging?windowHours=24
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const url = new URL(req.url);
  const windowHours = Math.min(Math.max(Number(url.searchParams.get("windowHours") || 24), 1), 24 * 30);
  const since = new Date(Date.now() - windowHours * 3_600_000);

  const [byStatus, byProvider, blocks] = await Promise.all([
    (prisma as any).waMessage.groupBy({
      by: ["status"],
      where: { userId: user.id, queuedAt: { gte: since } },
      _count: { status: true },
    }),
    (prisma as any).waMessage.groupBy({
      by: ["provider", "status"],
      where: { userId: user.id, queuedAt: { gte: since } },
      _count: { _all: true },
    }),
    (prisma as any).waComplianceAudit.groupBy({
      by: ["category", "action"],
      where: { userId: user.id, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const r of byStatus) statusCounts[r.status] = r._count.status;

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const sent = (statusCounts.sent || 0) + (statusCounts.delivered || 0) + (statusCounts.read || 0);
  const failed = statusCounts.failed || 0;
  const deliveredRate = sent > 0 ? Math.round(((statusCounts.delivered || 0) + (statusCounts.read || 0)) / sent * 100) : 0;
  const readRate = sent > 0 ? Math.round((statusCounts.read || 0) / sent * 100) : 0;
  const failureRate = total > 0 ? Math.round(failed / total * 100) : 0;

  return NextResponse.json({
    ok: true,
    windowHours,
    total,
    statusCounts,
    rates: { deliveredPct: deliveredRate, readPct: readRate, failurePct: failureRate },
    byProvider,
    compliance: blocks,
  });
}
