/**
 * Additive seed for the 6 public KEYONE tiers (k_start … k_enterprise).
 *
 * - Idempotent upsert by slug. Does NOT touch legacy plan rows
 *   (starter / pro / business / enterprise / max / companies), so existing
 *   subscribers are unaffected.
 * - DB numbers are DERIVED from lib/pricing/catalog.ts (single source of truth).
 * - Run standalone:  npx tsx prisma/seed-plans.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  TIERS,
  CAPABILITIES,
  featureFlagsForTier,
  type TierDef,
} from "../lib/pricing/catalog";

/** Human-readable Arabic feature bullets for the marketing `features` JSON. */
function featureBullets(tier: TierDef): string[] {
  const unlocked = CAPABILITIES.filter((c) => tier.index >= c.minTierIndex);
  const bullets: string[] = [];

  // Headline limits first.
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
      tier.limits.team === 0
        ? "أعضاء فريق غير محدودين"
        : `${tier.limits.team} أعضاء فريق`,
    );
  }
  if (tier.index >= 1) {
    bullets.push(
      tier.limits.broadcasts === 0
        ? "حملات بثّ غير محدودة"
        : `${tier.limits.broadcasts} حملات بثّ شهرياً`,
    );
  }

  // Then a few signature capabilities for this tier (cap at ~8 total).
  for (const cap of unlocked) {
    if (bullets.length >= 8) break;
    if (["inbox", "auto_reply", "customer_management"].includes(cap.key)) continue;
    bullets.push(cap.label.ar + (cap.comingSoon ? " (قريباً)" : ""));
  }
  return bullets;
}

export async function seedPlans(prisma: PrismaClient) {
  for (const tier of TIERS) {
    const isContact = Boolean(tier.contactSales);
    const flags = featureFlagsForTier(tier);

    const row = {
      slug: tier.slug,
      name: tier.name.ar,
      nameEn: tier.name.en,
      // Contact-sales tier stores 0 (UI renders "Contact sales" via catalog).
      priceUsd: tier.priceUsdMonthly ?? 0,
      yearlyUsd: tier.priceUsdYearly ?? null,
      monthlyMsgs: tier.limits.messages,
      description: tier.tagline.ar,
      features: JSON.stringify(featureBullets(tier)),
      highlight: tier.popular ? "الأكثر طلباً" : null,
      popular: Boolean(tier.popular),
      sortOrder: 10 + tier.index, // keep clear of legacy rows (1–6)
      tier: tier.internalTier,
      aiRequestsMonthly: tier.limits.ai,
      broadcastsMonthly: tier.limits.broadcasts,
      whatsappSessions: tier.limits.whatsapp === 0 ? 9999 : tier.limits.whatsapp,
      metaAccess: tier.metaAccess,
      analyticsAccess: tier.analyticsAccess,
      queuePriority: tier.index * 4,
      rateLimitPerMin: [30, 60, 90, 120, 200, 300][tier.index] ?? 60,
      featureFlags: JSON.stringify(flags),
    };

    await prisma.plan.upsert({
      where: { slug: tier.slug },
      update: row,
      create: row,
    });
    console.log(
      `✓ ${tier.slug.padEnd(14)} ${isContact ? "Custom" : "$" + row.priceUsd}/mo  (${row.monthlyMsgs || "∞"} msgs)`,
    );
  }
  console.log(`\n✓ Seeded ${TIERS.length} public plans. Legacy rows untouched.`);
}

// Standalone runner: `npx tsx prisma/seed-plans.ts`. No-op when imported (e.g. by seed.ts).
if (process.argv[1] && /seed-plans\.(ts|js|mjs|cjs)$/.test(process.argv[1])) {
  const prisma = new PrismaClient();
  seedPlans(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
