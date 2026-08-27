/**
 * What the customer reads about their own plan must be in their language, and
 * two screens must not disagree about the same number.
 *
 * Both defects here were found by opening the pages as an Enterprise customer:
 *
 *   /dashboard/plan   rendered its widget chips as monospace machine keys —
 *                     `smart_assistant`, `knowledge_base`, `api_access` — and
 *                     keyed the limits table `messages` / `ai` / `whatsapp`,
 *                     even though every one of those has an Arabic label in the
 *                     pricing catalog.
 *
 *   /dashboard/settings/numbers  said "0 من 9999 رقمة مستخدمة" while
 *                     /dashboard/plan said WhatsApp numbers were unlimited.
 *                     Both were reading the same plan. The Plan table has no
 *                     "unlimited" encoding for whatsappSessions, so the seed
 *                     writes 9999 where the catalog says 0; getEntitlements()
 *                     passed that straight through despite documenting
 *                     "0 = unlimited", so the only screen that read the DB
 *                     value showed the sentinel to the customer.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAPABILITIES } from "@/lib/pricing/catalog";
import { allPlanDashboards } from "@/lib/plans/dashboards";
import { UNLIMITED_WHATSAPP_SESSIONS } from "@/lib/pricing/seed-catalog-plans";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("the plan page speaks Arabic, not machine keys", () => {
  it("every widget key any plan can show has an Arabic label available", () => {
    const catalog = new Set(CAPABILITIES.map((c) => c.key));
    // The two non-capability widget keys getPlanDashboard() always prepends.
    const extra = new Set(["customers", "orders"]);
    const widgets = new Set(allPlanDashboards().flatMap((d) => d.widgets));
    expect(widgets.size).toBeGreaterThan(0);

    const unlabelled = [...widgets].filter((w) => !catalog.has(w) && !extra.has(w));
    expect(
      unlabelled,
      `these would render as raw English chips on /dashboard/plan: ${unlabelled.join(", ")}\n` +
        `fix=add the key to CAP_AR in app/dashboard/plan/page.tsx, or give it a catalog entry`,
    ).toEqual([]);
  });

  it("every limit key any plan can show has an Arabic label", () => {
    const src = read("app/dashboard/plan/page.tsx");
    const block = src.slice(src.indexOf("const LIMIT_AR"), src.indexOf("export default"));
    const labelled = new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
    const keys = new Set(allPlanDashboards().flatMap((d) => Object.keys(d.limits)));

    const missing = [...keys].filter((k) => !labelled.has(k));
    expect(missing, `unlabelled limit rows on /dashboard/plan: ${missing.join(", ")}`).toEqual([]);
  });

  it("the page no longer renders keys in a monospace chip", () => {
    // font-mono on the chips was the tell that raw identifiers were on screen.
    const src = read("app/dashboard/plan/page.tsx");
    expect(src).not.toMatch(/font-mono/);
  });
});

describe("unlimited means unlimited on every screen", () => {
  it("the seed's sentinel is imported by its reader, never re-typed", () => {
    // A second literal 9999 in the reader is exactly how the two screens
    // drifted apart in the first place.
    const ent = read("lib/membership/entitlements.ts");
    expect(ent).toMatch(/UNLIMITED_WHATSAPP_SESSIONS/);
    expect(ent, "entitlements hard-codes the sentinel instead of importing it").not.toMatch(/9999/);
  });

  it("getEntitlements translates the sentinel back to the documented 0", () => {
    const ent = read("lib/membership/entitlements.ts");
    expect(ent).toMatch(
      /whatsapp:\s*plan\.whatsappSessions\s*>=\s*UNLIMITED_WHATSAPP_SESSIONS\s*\?\s*0\s*:/,
    );
  });

  it("the sentinel is the value the seed actually writes", () => {
    const seed = read("lib/pricing/seed-catalog-plans.ts");
    expect(UNLIMITED_WHATSAPP_SESSIONS).toBe(9999);
    expect(seed).toMatch(/whatsappSessions:\s*tier\.limits\.whatsapp === 0 \? UNLIMITED_WHATSAPP_SESSIONS/);
  });

  it("the numbers page treats 0 — and therefore unlimited — as unlimited", () => {
    const src = read("app/dashboard/settings/numbers/numbers-client.tsx");
    expect(src).toMatch(/numberLimit === 0\s*\n?\s*\?\s*"أرقام واتساب غير محدودة"/);
    // and no longer builds a plural by appending ة to رقم
    expect(src, 'still renders "رقمة"').not.toMatch(/رقم\$\{/);
  });
});
