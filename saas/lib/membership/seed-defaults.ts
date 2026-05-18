/**
 * One-shot defaults seeder for the new Plan fields.
 *
 * Populates `tier / aiRequestsMonthly / broadcastsMonthly / whatsappSessions
 * / metaAccess / analyticsAccess / queuePriority / rateLimitPerMin /
 * featureFlags` for the canonical slugs (Pro, Max, Companies + legacy
 * starter/business/enterprise) WITHOUT touching pricing, monthlyMsgs, or
 * any other already-populated field.
 *
 * Safe to run repeatedly — each plan is a single upsert with merge semantics.
 *
 * Invocation:
 *   - Manually:  `npx tsx saas/scripts/seed-membership-defaults.ts`
 *   - Or via:    POST /api/admin/membership/seed-defaults  (admin-only)
 */

import { prisma } from "@/lib/db";

interface PlanDefault {
  slug: string;
  tier: "basic" | "pro" | "max" | "companies";
  aiRequestsMonthly: number;
  broadcastsMonthly: number;
  whatsappSessions: number;
  metaAccess: "none" | "limited" | "full";
  analyticsAccess: "basic" | "advanced";
  queuePriority: number;
  rateLimitPerMin: number;
  featureFlags: Record<string, any>;
}

export const PLAN_DEFAULTS: PlanDefault[] = [
  // --- Legacy plans → mapped to closest tier so they keep working sensibly ---
  { slug: "starter",    tier: "basic",     aiRequestsMonthly: 1000,   broadcastsMonthly: 5,    whatsappSessions: 1, metaAccess: "none",    analyticsAccess: "basic",    queuePriority: 0,  rateLimitPerMin: 30,  featureFlags: { broadcasts: true, knowledge_base: true } },
  { slug: "pro",        tier: "pro",       aiRequestsMonthly: 5000,   broadcastsMonthly: 20,   whatsappSessions: 2, metaAccess: "none",    analyticsAccess: "basic",    queuePriority: 5,  rateLimitPerMin: 60,  featureFlags: { broadcasts: true, knowledge_base: true, follow_ups: true } },
  { slug: "business",   tier: "max",       aiRequestsMonthly: 20000,  broadcastsMonthly: 50,   whatsappSessions: 3, metaAccess: "limited", analyticsAccess: "advanced", queuePriority: 10, rateLimitPerMin: 120, featureFlags: { broadcasts: true, knowledge_base: true, follow_ups: true, templates: true, daily_report: true } },
  { slug: "enterprise", tier: "companies", aiRequestsMonthly: 0,      broadcastsMonthly: 0,    whatsappSessions: 10, metaAccess: "full",   analyticsAccess: "advanced", queuePriority: 20, rateLimitPerMin: 300, featureFlags: { broadcasts: true, knowledge_base: true, follow_ups: true, templates: true, daily_report: true, api_access: true } },

  // --- New canonical tiers (Pro / Max / Companies) ---
  { slug: "max",        tier: "max",       aiRequestsMonthly: 30000,  broadcastsMonthly: 100,  whatsappSessions: 4,  metaAccess: "limited", analyticsAccess: "advanced", queuePriority: 10, rateLimitPerMin: 120, featureFlags: { broadcasts: true, knowledge_base: true, follow_ups: true, templates: true, daily_report: true } },
  { slug: "companies",  tier: "companies", aiRequestsMonthly: 0,      broadcastsMonthly: 0,    whatsappSessions: 999, metaAccess: "full",   analyticsAccess: "advanced", queuePriority: 20, rateLimitPerMin: 300, featureFlags: { broadcasts: true, knowledge_base: true, follow_ups: true, templates: true, daily_report: true, api_access: true, custom_persona: true } },
];

export async function seedMembershipDefaults(): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  for (const def of PLAN_DEFAULTS) {
    const exists = await prisma.plan.findUnique({ where: { slug: def.slug } });
    if (!exists) { skipped++; continue; }
    await prisma.plan.update({
      where: { slug: def.slug },
      data: {
        tier: def.tier,
        aiRequestsMonthly: def.aiRequestsMonthly,
        broadcastsMonthly: def.broadcastsMonthly,
        whatsappSessions: def.whatsappSessions,
        metaAccess: def.metaAccess,
        analyticsAccess: def.analyticsAccess,
        queuePriority: def.queuePriority,
        rateLimitPerMin: def.rateLimitPerMin,
        featureFlags: JSON.stringify(def.featureFlags),
      } as any,
    });
    updated++;
  }
  return { updated, skipped };
}
