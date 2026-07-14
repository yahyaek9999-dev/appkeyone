/**
 * Trial grants: shared by the admin trial-management route and self-serve
 * signup. A trial creates/updates the user's Subscription with status="trial"
 * and a trial window (trialStartsAt/trialEndsAt) — isActiveSubscription()
 * treats an unexpired trial the same as an active paid subscription, so this
 * is the single source of truth for "how does a user get unblocked."
 */

import { prisma } from "@/lib/db";

export async function resolveTrialPlan(planSlug?: string | null) {
  if (planSlug) {
    const p = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (p) return p;
  }
  // Prefer the cheapest public catalog plan (k_*) so the trial mirrors a real
  // entry tier; fall back to any plan if none are seeded.
  const kPlans = await prisma.plan.findMany({
    where: { slug: { startsWith: "k_" } },
    orderBy: { priceUsd: "asc" },
  });
  if (kPlans.length) return kPlans[0];
  return prisma.plan.findFirst({ orderBy: { priceUsd: "asc" } });
}

export async function grantTrial(
  userId: string,
  hours: number,
  opts: { planSlug?: string | null; grantedBy: string; approve?: boolean } = { grantedBy: "system" },
) {
  const plan = await resolveTrialPlan(opts.planSlug);
  if (!plan) return null;

  const now = new Date();
  const ends = new Date(now.getTime() + hours * 3_600_000);

  const trialData = {
    planId: plan.id,
    status: "trial",
    startedAt: now,
    expiresAt: ends,
    trialStartsAt: now,
    trialEndsAt: ends,
    trialDurationHours: hours,
    trialGrantedBy: opts.grantedBy,
  } as any;

  const sub = await prisma.subscription.upsert({
    where: { userId },
    update: trialData,
    create: { userId, ...trialData },
  });

  if (opts.approve) {
    await prisma.user
      .update({
        where: { id: userId },
        data: { approvalStatus: "approved", approvedAt: now, approvedBy: opts.grantedBy } as any,
      })
      .catch(() => {});
  }

  return { sub, plan, trialEndsAt: ends };
}
