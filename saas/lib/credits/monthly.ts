/**
 * lib/credits/monthly.ts — per-plan MONTHLY broadcast-credit grant.
 *
 * Completes the "Plan → Monthly Credits" link of the broadcast-credit model:
 * each active public-plan (k_*) subscriber is auto-granted their tier's monthly
 * allotment (catalog MONTHLY_BROADCAST_CREDITS) on top of the existing
 * usage-decrement + extra-purchase flows.
 *
 * Ledger-first + idempotent per (user, period) via key `monthly:<userId>:<YYYY-MM>`
 * so re-running the cron within the same month never double-grants (the credit
 * engine's @unique idempotencyKey turns a replay into a no-op). Flag-gated OFF
 * (creditFlags.monthlyEnabled). Never touches the WhatsApp send pipeline.
 */
import { prisma } from "@/lib/db";
import { credit } from "./credits";
import { monthlyBroadcastCreditsForSlug } from "@/lib/pricing/catalog";

/** Billing period key in UTC, e.g. "2026-06". */
export function billingPeriod(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface MonthlyGrantOutcome {
  userId: string;
  slug: string;
  amount: number;
  granted: boolean;
  replay: boolean;
  balanceAfter: number;
}

/** Grant one user their tier's monthly allotment (idempotent per period). */
export async function grantMonthlyCreditsForUser(
  userId: string,
  slug: string,
  period: string = billingPeriod(),
): Promise<MonthlyGrantOutcome> {
  const amount = monthlyBroadcastCreditsForSlug(slug);
  if (amount <= 0) {
    return { userId, slug, amount: 0, granted: false, replay: false, balanceAfter: 0 };
  }
  const res = await credit({
    userId,
    kind: "adjustment",
    amount,
    source: "system",
    reason: `monthly_grant:${period}`,
    idempotencyKey: `monthly:${userId}:${period}`,
    metadata: { period, slug, kind: "monthly_grant" },
  });
  return { userId, slug, amount, granted: res.recorded, replay: res.replay, balanceAfter: res.balanceAfter };
}

export interface MonthlyGrantReport {
  period: string;
  eligible: number;
  granted: number;
  replayed: number;
  skipped: number;
  creditsGranted: number;
  outcomes: MonthlyGrantOutcome[];
}

/**
 * Enumerate active public-plan (k_*) subscribers and grant each their monthly
 * allotment. Safe to run repeatedly: same-month re-runs are idempotent no-ops.
 */
export async function grantMonthlyCredits(
  opts: { period?: string; limit?: number } = {},
): Promise<MonthlyGrantReport> {
  const period = opts.period || billingPeriod();
  const now = new Date();
  const subs = await prisma.subscription.findMany({
    where: { status: "active", expiresAt: { gt: now }, plan: { slug: { startsWith: "k_" } } },
    select: { userId: true, plan: { select: { slug: true } } },
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  const report: MonthlyGrantReport = {
    period,
    eligible: subs.length,
    granted: 0,
    replayed: 0,
    skipped: 0,
    creditsGranted: 0,
    outcomes: [],
  };
  for (const s of subs) {
    const slug = s.plan?.slug || "";
    const out = await grantMonthlyCreditsForUser(s.userId, slug, period);
    report.outcomes.push(out);
    if (out.amount <= 0) report.skipped++;
    else if (out.replay) report.replayed++;
    else if (out.granted) {
      report.granted++;
      report.creditsGranted += out.amount;
    }
  }
  return report;
}
