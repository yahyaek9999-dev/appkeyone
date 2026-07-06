/**
 * lib/brain/monthly.ts — per-plan MONTHLY Brain-credit grant (Phase 7).
 * Idempotent per (user, period); flag-gated OFF (brainFlags.monthlyEnabled).
 * Mirrors the broadcast-credit monthly grant.
 */
import { prisma } from "@/lib/db";
import { credit } from "./credits";
import { monthlyBrainCreditsForSlug } from "@/lib/pricing/catalog";

export function brainPeriod(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface BrainGrantOutcome { userId: string; slug: string; amount: number; granted: boolean; replay: boolean; balanceAfter: number; }

export async function grantMonthlyBrainCreditsForUser(userId: string, slug: string, period: string = brainPeriod()): Promise<BrainGrantOutcome> {
  const amount = monthlyBrainCreditsForSlug(slug);
  if (amount <= 0) return { userId, slug, amount: 0, granted: false, replay: false, balanceAfter: 0 };
  const res = await credit({
    userId, kind: "monthly", amount, source: "system", reason: `monthly_grant:${period}`,
    idempotencyKey: `brain-monthly:${userId}:${period}`, metadata: { period, slug },
  });
  return { userId, slug, amount, granted: res.recorded, replay: res.replay, balanceAfter: res.balanceAfter };
}

export interface BrainGrantReport { period: string; eligible: number; granted: number; replayed: number; skipped: number; creditsGranted: number; }

export async function grantMonthlyBrainCredits(opts: { period?: string; limit?: number } = {}): Promise<BrainGrantReport> {
  const period = opts.period || brainPeriod();
  const subs = await prisma.subscription.findMany({
    where: { status: "active", expiresAt: { gt: new Date() }, plan: { slug: { startsWith: "k_" } } },
    select: { userId: true, plan: { select: { slug: true } } },
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  const report: BrainGrantReport = { period, eligible: subs.length, granted: 0, replayed: 0, skipped: 0, creditsGranted: 0 };
  for (const s of subs) {
    const out = await grantMonthlyBrainCreditsForUser(s.userId, s.plan?.slug || "", period);
    if (out.amount <= 0) report.skipped++;
    else if (out.replay) report.replayed++;
    else if (out.granted) { report.granted++; report.creditsGranted += out.amount; }
  }
  return report;
}
