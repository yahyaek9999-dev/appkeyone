/**
 * Comprehensive audit: which real dashboard pages are implemented,
 * which are in nav, which are visible to admin, which are missing.
 */

import { promises as fs } from "fs";
import { PrismaClient } from "@prisma/client";
import { getEntitlements } from "./lib/membership/entitlements";
import { WORKSPACES } from "./app/dashboard/nav-items";

const prisma = new PrismaClient();

// Pages that are genuinely internal/test/debug and NOT customer-facing
const EXCLUDE_PATTERNS = [
  "arena", // testing harness
  "ai-audit", // QA
  "command-center", // internal ops
  "demo", // seeds fake data
  "intel", // monitoring internals
  "playground", // QA harness
  "testing-arena", // QA harness
  "safety", // anti-ban internals
  "compliance", // deliverability internals (but check if comingSoon)
];

// Pages that are deprecated/consolidated into other pages
const DEPRECATED_PAGES = {
  "/dashboard/brain": "/dashboard/knowledge",
  "/dashboard/knowledge-brain": "/dashboard/knowledge",
  "/dashboard/sales-brain": "/dashboard/business-intelligence",
  "/dashboard/broadcasts": "/dashboard/broadcasts-pro",
  "/dashboard/plan": "/dashboard/usage",
  "/dashboard/revenue-forecast": "/dashboard/revenue-copilot",
  "/dashboard/suggestions": "/dashboard/revenue-copilot",
  "/dashboard/meta": "/dashboard/billing",
  "/dashboard/monitoring": "/dashboard/analytics",
  "/dashboard/whatsapp": "/dashboard/settings/numbers",
};

async function findAllPages(): Promise<Map<string, boolean>> {
  const pages = new Map<string, boolean>();

  const result = await fs.readdir("/Users/yahyaemad/Desktop/appkeyone/saas/app/dashboard", {
    recursive: true,
  });

  for (const file of result) {
    if (
      file.endsWith("page.tsx") &&
      !file.includes(".next") &&
      !file.includes("node_modules")
    ) {
      // Extract route from path
      const pathParts = file
        .split("/")
        .filter((p) => p !== "page.tsx" && p !== "dashboard" && p !== "app");
      const route = `/dashboard/${pathParts.join("/")}`;

      // Check if should be excluded
      const shouldExclude = EXCLUDE_PATTERNS.some(
        (pattern) => route.includes(pattern),
      );

      if (!shouldExclude && !Object.keys(DEPRECATED_PAGES).includes(route)) {
        pages.set(route, true);
      }
    }
  }

  return pages;
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    select: { id: true, email: true },
  });

  if (!admin) {
    console.log("❌ No admin found");
    return;
  }

  const allPages = await findAllPages();
  const navRoutes = WORKSPACES.flatMap((w) =>
    w.items.map((item) => item.href),
  );

  const ent = await getEntitlements(admin.id);

  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║      DASHBOARD PAGE VISIBILITY AUDIT               ║");
  console.log("╚════════════════════════════════════════════════════╝\n");

  console.log(`Real implemented pages: ${allPages.size}`);
  console.log(`Nav routes: ${navRoutes.length}`);
  console.log(`Admin capabilities: ${Object.entries(ent.capabilities).filter(([_, v]) => v).length} / 68\n`);

  // Categorize pages
  const inNav = new Set<string>();
  const notInNav = new Set<string>();
  const deprecated = new Set<string>();

  for (const page of allPages.keys()) {
    if (Object.keys(DEPRECATED_PAGES).includes(page)) {
      deprecated.add(page);
    } else if (navRoutes.includes(page)) {
      inNav.add(page);
    } else {
      notInNav.add(page);
    }
  }

  console.log("PAGES IN NAVIGATION:");
  console.log(`  ✓ ${inNav.size} pages`);
  for (const route of Array.from(inNav).sort()) {
    console.log(`    ${route}`);
  }

  if (notInNav.size > 0) {
    console.log("\n❌ PAGES NOT IN NAVIGATION:");
    console.log(`  ${notInNav.size} pages`);
    for (const route of Array.from(notInNav).sort()) {
      console.log(`    ${route}`);
    }
  }

  if (deprecated.size > 0) {
    console.log("\n⚠️  DEPRECATED/CONSOLIDATED PAGES:");
    console.log(`  ${deprecated.size} pages`);
    for (const route of Array.from(deprecated).sort()) {
      console.log(`    ${route} → ${DEPRECATED_PAGES[route as keyof typeof DEPRECATED_PAGES]}`);
    }
  }

  console.log("\n────────────────────────────────────────────────────\n");
  console.log("ROOT ISSUE: Pages not in nav are not visible to admin.\n");

  await prisma.$disconnect();
}

main().catch(console.error);
