/**
 * lib/payments/reconcile.ts — reconciliation + reporting for topup payments.
 *
 * Two responsibilities:
 *   - reconcilePayments(): a safety-net sweep. Re-credits any transaction that
 *     is marked paid but somehow has no ledger entry (idempotent), and expires
 *     stale created/pending intents the customer abandoned. Safe to run on a
 *     cron — every credit is idempotent by `payment:<provider>:<ref>`.
 *   - getPaymentStats(): aggregates used by the admin billing analytics
 *     (volume per provider, status mix, reconciliation health).
 */
import { prisma } from "@/lib/db";
import { credit } from "@/lib/wallet/wallet";
import { roundUsd } from "@/lib/wallet/money";

export interface ReconcileReport {
  scanned: number;
  recredited: number;
  expired: number;
  mismatches: number;
  errors: number;
}

export async function reconcilePayments(opts: { expireOlderThanMin?: number } = {}): Promise<ReconcileReport> {
  const report: ReconcileReport = { scanned: 0, recredited: 0, expired: 0, mismatches: 0, errors: 0 };

  // 1) paid-but-uncredited safety net (e.g. credit crashed after webhook ack).
  const paidNoLedger = await prisma.paymentTransaction
    .findMany({ where: { status: "paid", ledgerId: null }, take: 200 })
    .catch(() => []);
  for (const tx of paidNoLedger) {
    report.scanned++;
    report.mismatches++;
    try {
      const res = await credit({
        userId: tx.userId,
        kind: "topup",
        amountUsd: tx.amountUsd,
        source: tx.provider,
        reason: `topup:${tx.provider}:reconcile`,
        idempotencyKey: `payment:${tx.provider}:${tx.providerRef || tx.id}`,
        metadata: { provider: tx.provider, reconcile: true, transactionId: tx.id },
      });
      await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { status: "reconciled", ledgerId: res.ledgerId, reconciledAt: new Date() },
      });
      report.recredited++;
    } catch {
      report.errors++;
    }
  }

  // 2) expire abandoned intents.
  const cutoffMin = opts.expireOlderThanMin ?? 24 * 60; // 24h default
  const cutoff = new Date(Date.now() - cutoffMin * 60_000);
  const stale = await prisma.paymentTransaction
    .updateMany({
      where: { status: { in: ["created", "pending"] }, provider: { not: "manual" }, createdAt: { lt: cutoff } },
      data: { status: "expired", failureReason: "abandoned" },
    })
    .catch(() => ({ count: 0 }));
  report.expired = stale.count;

  return report;
}

export interface PaymentProviderStat {
  provider: string;
  total: number;
  paid: number;
  pending: number;
  failed: number;
  expired: number;
  paidVolumeUsd: number;
}

export interface PaymentStats {
  days: number;
  sinceISO: string;
  totals: {
    transactions: number;
    paid: number;
    pending: number;
    failed: number;
    paidVolumeUsd: number;
    uncreditedPaid: number; // reconciliation health: should be 0
  };
  byProvider: PaymentProviderStat[];
}

export async function getPaymentStats(opts: { days?: number } = {}): Promise<PaymentStats> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const rows = await prisma.paymentTransaction
    .findMany({
      where: { createdAt: { gte: since } },
      select: { provider: true, status: true, amountUsd: true, ledgerId: true },
    })
    .catch(() => []);

  const map = new Map<string, PaymentProviderStat>();
  const totals = { transactions: 0, paid: 0, pending: 0, failed: 0, paidVolumeUsd: 0, uncreditedPaid: 0 };

  for (const r of rows) {
    totals.transactions++;
    let s = map.get(r.provider);
    if (!s) {
      s = { provider: r.provider, total: 0, paid: 0, pending: 0, failed: 0, expired: 0, paidVolumeUsd: 0 };
      map.set(r.provider, s);
    }
    s.total++;
    const isPaid = r.status === "paid" || r.status === "reconciled";
    if (isPaid) {
      s.paid++;
      totals.paid++;
      s.paidVolumeUsd = roundUsd(s.paidVolumeUsd + r.amountUsd);
      totals.paidVolumeUsd = roundUsd(totals.paidVolumeUsd + r.amountUsd);
      if (!r.ledgerId) totals.uncreditedPaid++;
    } else if (r.status === "pending" || r.status === "created") {
      s.pending++;
      totals.pending++;
    } else if (r.status === "failed") {
      s.failed++;
      totals.failed++;
    } else if (r.status === "expired") {
      s.expired++;
    }
  }

  return {
    days,
    sinceISO: since.toISOString(),
    totals,
    byProvider: Array.from(map.values()).sort((a, b) => b.paidVolumeUsd - a.paidVolumeUsd),
  };
}
