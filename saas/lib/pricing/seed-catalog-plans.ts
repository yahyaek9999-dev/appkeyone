/**
 * Bootstrap the 6 public KEYONE tiers (k_start … k_enterprise) as DB `Plan`
 * rows, derived from lib/pricing/catalog.ts.
 *
 * CREATE-ONLY. This used to `update` every field on every run, which meant
 * re-running it after an admin repriced a plan via /api/admin/plans (an
 * explicitly supported, documented action — see that route's own comment:
 * "priceUsd... owner can reprice without a developer") would silently
 * overwrite the admin's edit back to the catalog default. Once a row exists,
 * the DB is authoritative and this function never touches it again — it only
 * fills in rows that don't exist yet. This makes it safe to call from
 * anywhere, anytime (an admin button, a deploy step, a fresh install) without
 * ever clobbering a real pricing decision.
 */

import type { PrismaClient } from "@prisma/client";
import { TIERS, CAPABILITIES, featureFlagsForTier, type TierDef } from "./catalog";

/**
 * The Plan table has no "unlimited" encoding for whatsappSessions, so the seed
 * writes this sentinel where the catalog says 0 (= unlimited). Every reader must
 * translate it back — see getEntitlements(), whose contract is "0 = unlimited".
 * Exported rather than repeated: a copy of the number in the reader is exactly
 * how an Enterprise customer came to see "0 من 9999 رقمة مستخدمة" on their own
 * numbers page while the plan page said unlimited.
 */
export const UNLIMITED_WHATSAPP_SESSIONS = 9999;

function featureBullets(tier: TierDef): string[] {
  const unlocked = CAPABILITIES.filter((c) => tier.capIndex >= c.minTierIndex);
  const bullets: string[] = [];

  bullets.push(
    tier.limits.messages === 0
      ? "رسائل غير محدودة شهرياً"
      : `${tier.limits.messages.toLocaleString("en-US")} رسالة شهرياً`,
  );
  bullets.push(
    tier.limits.whatsapp === 0
      ? "أرقام واتساب غير محدودة"
      : tier.limits.whatsapp === 1
        ? "ربط رقم واتساب واحد"
        : `ربط ${tier.limits.whatsapp} أرقام واتساب`,
  );
  if (tier.limits.team !== 1) {
    bullets.push(
      tier.limits.team === 0 ? "أعضاء فريق غير محدودين" : `${tier.limits.team} أعضاء فريق`,
    );
  }
  if (tier.capIndex >= 1) {
    bullets.push(
      tier.limits.broadcasts === 0
        ? "حملات بثّ غير محدودة"
        : `${tier.limits.broadcasts} حملات بثّ شهرياً`,
    );
  }
  for (const cap of unlocked) {
    if (bullets.length >= 8) break;
    if (["inbox", "auto_reply", "customer_management"].includes(cap.key)) continue;
    bullets.push(cap.label.ar + (cap.comingSoon ? " (قريباً)" : ""));
  }
  return bullets;
}

export interface SeedCatalogResult {
  created: string[];
  alreadyExisted: string[];
}

/** Create any missing k_* catalog plans. Never updates an existing row. */
export async function seedCatalogPlans(prisma: PrismaClient): Promise<SeedCatalogResult> {
  const created: string[] = [];
  const alreadyExisted: string[] = [];

  for (const tier of TIERS) {
    const existing = await prisma.plan.findUnique({ where: { slug: tier.slug }, select: { slug: true } });
    if (existing) {
      alreadyExisted.push(tier.slug);
      continue;
    }

    const flags = featureFlagsForTier(tier);
    await prisma.plan.create({
      data: {
        slug: tier.slug,
        name: tier.name.ar,
        nameEn: tier.name.en,
        priceUsd: tier.priceUsdMonthly ?? 0,
        yearlyUsd: tier.priceUsdYearly ?? null,
        monthlyMsgs: tier.limits.messages,
        description: tier.tagline.ar,
        features: JSON.stringify(featureBullets(tier)),
        highlight: tier.popular ? "الأكثر طلباً" : null,
        popular: Boolean(tier.popular),
        sortOrder: 10 + tier.index,
        tier: tier.internalTier,
        aiRequestsMonthly: tier.limits.ai,
        broadcastsMonthly: tier.limits.broadcasts,
        whatsappSessions: tier.limits.whatsapp === 0 ? UNLIMITED_WHATSAPP_SESSIONS : tier.limits.whatsapp,
        metaAccess: tier.metaAccess,
        analyticsAccess: tier.analyticsAccess,
        queuePriority: tier.index * 4,
        rateLimitPerMin: [30, 60, 90, 120, 200, 300][tier.index] ?? 60,
        featureFlags: JSON.stringify(flags),
      },
    });
    created.push(tier.slug);
  }

  return { created, alreadyExisted };
}
