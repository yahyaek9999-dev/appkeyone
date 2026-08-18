import { PrismaClient } from "@prisma/client";
import { getEntitlements, hasCapability } from "./lib/membership/entitlements";
import { CAPABILITIES } from "./lib/pricing/catalog";
import { isFeatureEnabled } from "./lib/feature-control";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { id: true, email: true },
  });

  if (!admin) {
    console.log("❌ No admin user found");
    process.exit(1);
  }

  const ent = await getEntitlements(admin.id);
  const adminCaps = Object.entries(ent.capabilities)
    .filter(([_, v]) => v === true)
    .map(([k]) => k);

  console.log("\n=== ADMIN CAPABILITY VERIFICATION ===\n");
  console.log(`Admin: ${admin.email}`);
  console.log(`Capabilities: ${adminCaps.length} / ${CAPABILITIES.length}`);
  console.log(`enforce: ${ent.enforce}`);
  console.log(`Unlimited: ${Object.values(ent.limits).every((v) => v === 0)}`);

  // Test feature-control bypass
  const testFeat = "white_label";
  const hasIt = await hasCapability(admin.id, testFeat);
  const isEnabled = await isFeatureEnabled(testFeat, new Set(), admin.id);

  console.log(`\nFeature-Control Test:`);
  console.log(`  ${testFeat}: hasCapability=${hasIt}, isFeatureEnabled=${isEnabled}`);

  if (
    adminCaps.length === CAPABILITIES.length &&
    ent.enforce === false &&
    Object.values(ent.limits).every((v) => v === 0) &&
    hasIt &&
    isEnabled
  ) {
    console.log("\n✅ ALL TESTS PASSED: Admin has complete unrestricted access\n");
    process.exit(0);
  } else {
    console.log("\n❌ TESTS FAILED\n");
    process.exit(1);
  }
}

main().catch(console.error);
