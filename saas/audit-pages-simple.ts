/**
 * Simple audit: which dashboard pages exist, which are in nav, which are missing.
 */

import { promises as fs } from "fs";
import { WORKSPACES } from "./app/dashboard/nav-items";

// Pages that are genuinely internal/test/debug and NOT customer-facing
const EXCLUDE_PATTERNS = [
  "arena",
  "ai-audit",
  "command-center",
  "demo",
  "intel",
  "playground",
  "testing-arena",
  "safety",
  "compliance", // Check if this should be included
];

// Pages that are deprecated/consolidated
const DEPRECATED_PAGES: Record<string, string> = {
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

async function findAllPages(): Promise<string[]> {
  const pages: string[] = [];

  async function walkDir(dir: string, prefix: string = ""): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (
        entry.name === ".next" ||
        entry.name === "node_modules" ||
        entry.name === "layout.tsx"
      ) {
        continue;
      }

      const fullPath = `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        await walkDir(fullPath, `${prefix}${entry.name}/`);
      } else if (entry.name === "page.tsx") {
        const route =
          prefix === "" ? "/dashboard" : `/dashboard/${prefix.slice(0, -1)}`;
        pages.push(route);
      }
    }
  }

  await walkDir("/Users/yahyaemad/Desktop/appkeyone/saas/app/dashboard");
  return pages;
}

async function main() {
  const allPages = await findAllPages();
  const navRoutes = WORKSPACES.flatMap((w) => w.items.map((item) => item.href));

  // Filter pages
  const realPages = allPages.filter((page) => {
    const isExcluded = EXCLUDE_PATTERNS.some((pattern) => page.includes(pattern));
    const isDeprecated = Object.keys(DEPRECATED_PAGES).includes(page);
    return !isExcluded && !isDeprecated;
  });

  const inNav = realPages.filter((p) => navRoutes.includes(p));
  const notInNav = realPages.filter((p) => !navRoutes.includes(p));

  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║      DASHBOARD PAGE AUDIT                          ║");
  console.log("╚════════════════════════════════════════════════════╝\n");

  console.log(`Total pages on disk: ${allPages.length}`);
  console.log(`After filtering (real pages): ${realPages.length}`);
  console.log(`In navigation: ${inNav.length}`);
  console.log(`NOT in navigation: ${notInNav.length}\n`);

  if (notInNav.length > 0) {
    console.log("❌ PAGES NOT IN NAVIGATION:\n");
    for (const route of notInNav.sort()) {
      console.log(`  ${route}`);
    }
    console.log();
  }

  console.log("✓ PAGES IN NAVIGATION:\n");
  for (const route of inNav.sort()) {
    console.log(`  ${route}`);
  }

  console.log(
    `\n────────────────────────────────────────────────────\n` +
    `ROOT ISSUE: ${notInNav.length} real pages are NOT in the nav.\n` +
    `These pages exist but won't show up for admin (or any user) ` +
    `because they're not in the navigation system.\n`,
  );
}

main().catch(console.error);
