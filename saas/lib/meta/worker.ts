/**
 * Meta Enterprise — background worker / scheduler.
 *
 * A single idempotent cron tick orchestrates the operational engines:
 *   recover (DLQ drain) → settle (cost processor) → rollups (analytics
 *   processor) → health sweep (monitor) → cleanup. Driven by /api/cron/meta on
 *   a VPS schedule; safe to run repeatedly.
 */

import { prisma } from "@/lib/db";
import { settlePendingConversations, rollupDay, rollupInvoice } from "./billing";
import { runHealthSweep } from "./health";

/** DLQ drain: reset conversations stuck in "failed" back to "pending" so the
 *  next settle pass retries them. */
export async function recoverFailedConversations(limit = 1000): Promise<number> {
  const failed = await prisma.metaConversation.findMany({
    where: { billingStatus: "failed" },
    select: { id: true },
    take: limit,
  });
  if (failed.length) {
    await prisma.metaConversation.updateMany({
      where: { id: { in: failed.map((f) => f.id) } },
      data: { billingStatus: "pending" },
    });
  }
  return failed.length;
}

/** Cleanup: prune old sync history (>30d) and long-resolved incidents (>90d). */
export async function cleanupMetaOperational() {
  const now = Date.now();
  const syncCut = new Date(now - 30 * 86_400_000);
  const incCut = new Date(now - 90 * 86_400_000);
  const [sync, inc] = await Promise.all([
    prisma.metaSyncHistory.deleteMany({ where: { createdAt: { lt: syncCut } } }),
    prisma.metaIncident.deleteMany({
      where: { status: { in: ["resolved", "auto_resolved"] }, resolvedAt: { lt: incCut } },
    }),
  ]);
  return { syncDeleted: sync.count, incidentsDeleted: inc.count };
}

/** One full cron tick. Returns a structured summary for logging/monitoring. */
export async function runMetaCronTick(opts: { maxTenants?: number } = {}) {
  const t0 = Date.now();
  const recovered = await recoverFailedConversations();

  const tenants = await prisma.metaTenant.findMany({
    where: { deletedAt: null },
    select: { userId: true },
    take: opts.maxTenants ?? 1000,
  });
  const today = new Date().toISOString().slice(0, 10);
  const period = today.slice(0, 7);
  let settled = 0;
  let usdDebited = 0;
  for (const t of tenants) {
    const s = await settlePendingConversations(t.userId);
    settled += s.charged;
    usdDebited += s.usdDebited;
    await rollupDay(t.userId, today);
    await rollupInvoice(t.userId, period);
  }

  const health = await runHealthSweep();
  const cleanup = await cleanupMetaOperational();
  return {
    recovered,
    tenants: tenants.length,
    settled,
    usdDebited,
    health,
    cleanup,
    durationMs: Date.now() - t0,
  };
}
