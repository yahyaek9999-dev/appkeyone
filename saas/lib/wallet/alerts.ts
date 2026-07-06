/**
 * lib/wallet/alerts.ts — low-balance / empty-wallet detection sweep.
 *
 * Append-only + idempotent: a wallet is alerted at most once per cooldown
 * window (default 24h). Writes a SafetyAudit row (category "billing") so the
 * alert is visible in the admin dashboards, and stamps `lowBalanceNotifiedAt`
 * so the next sweep does not re-alert. Never touches the send pipeline.
 */

import { prisma } from "@/lib/db";
import { roundUsd } from "./money";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface LowBalanceSweepResult {
  scanned: number;
  alerted: number;
  empty: number;
  low: number;
}

export async function runLowBalanceSweep(): Promise<LowBalanceSweepResult> {
  const out: LowBalanceSweepResult = { scanned: 0, alerted: 0, empty: 0, low: 0 };
  // Only active wallets are worth alerting on.
  const wallets = await prisma.wallet.findMany({
    where: { status: "active" },
    select: { id: true, userId: true, balanceUsd: true, lowBalanceThresholdUsd: true, lowBalanceNotifiedAt: true },
    take: 5000,
  }).catch(() => []);

  const now = Date.now();
  for (const w of wallets) {
    out.scanned += 1;
    const bal = roundUsd(w.balanceUsd);
    const threshold = roundUsd(w.lowBalanceThresholdUsd);
    const isEmpty = bal <= 0;
    const isLow = bal > 0 && bal <= threshold;
    if (!isEmpty && !isLow) continue;
    if (isEmpty) out.empty += 1; else out.low += 1;

    const last = w.lowBalanceNotifiedAt ? new Date(w.lowBalanceNotifiedAt).getTime() : 0;
    if (now - last < COOLDOWN_MS) continue; // still inside cooldown — skip

    await prisma.safetyAudit.create({
      data: {
        userId: w.userId,
        level: isEmpty ? "critical" : "warn",
        category: "billing",
        title: isEmpty ? "رصيد المحفظة صفر" : "رصيد المحفظة منخفض",
        detail: isEmpty
          ? "نفد رصيد المحفظة. اشحن المحفظة لمتابعة رسائل Meta المدفوعة."
          : `رصيد المحفظة (${bal.toFixed(2)}$) أقل من حد التنبيه (${threshold.toFixed(2)}$).`,
        payload: JSON.stringify({ balanceUsd: bal, thresholdUsd: threshold }),
      },
    }).catch(() => {});
    await prisma.wallet.update({ where: { id: w.id }, data: { lowBalanceNotifiedAt: new Date() } }).catch(() => {});
    out.alerted += 1;
  }
  return out;
}
