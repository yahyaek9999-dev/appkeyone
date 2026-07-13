/**
 * CLI entry point for lib/pricing/seed-catalog-plans.ts — creates any of the
 * 6 public KEYONE tiers (k_start … k_enterprise) that don't exist yet as DB
 * `Plan` rows. Never updates an existing row (see that file for why).
 *
 * Run standalone:  npx tsx prisma/seed-plans.ts
 * Also callable from the admin UI (Plans page → "زرع باقات الكتالوج") via
 * POST /api/admin/plans/seed-catalog — same underlying function, no tsx
 * dependency needed on the server.
 */

import { PrismaClient } from "@prisma/client";
import { seedCatalogPlans } from "../lib/pricing/seed-catalog-plans";

const prisma = new PrismaClient();

async function main() {
  const { created, alreadyExisted } = await seedCatalogPlans(prisma);
  for (const slug of created) console.log(`✓ created ${slug}`);
  for (const slug of alreadyExisted) console.log(`· ${slug} already exists, left untouched`);
  console.log(`\n${created.length} created, ${alreadyExisted.length} already existed. Legacy rows untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
