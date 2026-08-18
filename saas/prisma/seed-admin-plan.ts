/**
 * Seeds the internal k_admin Plan row and assigns it to all users with
 * role="admin". This plan has all capabilities enabled, unlimited quotas,
 * and is invisible on the pricing page (not in PUBLIC_TIERS / catalog.ts).
 *
 * Safe to re-run — idempotent. Updates admin subscriptions in-place.
 *
 * Run:  npx tsx prisma/seed-admin-plan.ts
 */

import { PrismaClient } from "@prisma/client";
import { CAPABILITIES } from "../lib/pricing/catalog";

const prisma = new PrismaClient();

const ADMIN_PLAN_SLUG = "k_admin";

async function main() {
  // Build featureFlags with every capability key set to true.
  const allFlags: Record<string, boolean> = {};
  for (const cap of CAPABILITIES) {
    allFlags[cap.key] = true;
  }

  // Create or leave the Plan row unchanged (upsert but preserve if exists).
  const existing = await prisma.plan.findUnique({ where: { slug: ADMIN_PLAN_SLUG } });

  let plan: { id: string };
  if (existing) {
    plan = existing;
    console.log(`· k_admin plan already exists (id=${existing.id}), left untouched`);
  } else {
    plan = await prisma.plan.create({
      data: {
        slug: ADMIN_PLAN_SLUG,
        name: "أدمن المنصة",
        nameEn: "Platform Admin",
        priceUsd: 0,
        yearlyUsd: 0,
        monthlyMsgs: 0,          // 0 = unlimited
        aiRequestsMonthly: 0,
        broadcastsMonthly: 0,
        whatsappSessions: 999,
        metaAccess: "full",
        analyticsAccess: "advanced",
        queuePriority: 100,
        rateLimitPerMin: 9999,
        tier: "companies",
        features: JSON.stringify(CAPABILITIES.map((c) => c.label.ar)),
        description: "وصول كامل لجميع مميزات المنصة — للاستخدام الداخلي فقط",
        popular: false,
        sortOrder: 9999,        // won't appear anywhere public
        status: "active",
        featureFlags: JSON.stringify(allFlags),
      },
      select: { id: true },
    });
    console.log(`✓ created k_admin plan (id=${plan.id})`);
  }

  // Find all admin users.
  const admins = await prisma.user.findMany({
    where: { role: "admin" } as any,
    select: { id: true, email: true } as any,
  }) as Array<{ id: string; email: string }>;

  if (admins.length === 0) {
    console.log("· no admin users found — done");
    return;
  }

  const far = new Date("2099-12-31T23:59:59Z");

  for (const admin of admins) {
    const sub = await (prisma as any).subscription.findUnique({
      where: { userId: admin.id },
      select: { id: true, planId: true, status: true },
    });

    if (sub) {
      await (prisma as any).subscription.update({
        where: { userId: admin.id },
        data: {
          planId: plan.id,
          status: "active",
          expiresAt: far,
          adminNote: "Admin plan — platform internal",
        },
      });
      console.log(`✓ updated subscription for ${admin.email}`);
    } else {
      await (prisma as any).subscription.create({
        data: {
          userId: admin.id,
          planId: plan.id,
          status: "active",
          billingCycle: "yearly",
          startedAt: new Date(),
          expiresAt: far,
          adminNote: "Admin plan — platform internal",
        },
      });
      console.log(`✓ created subscription for ${admin.email}`);
    }
  }

  console.log(`\n✓ admin plan seeded — ${admins.length} admin(s) assigned`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
