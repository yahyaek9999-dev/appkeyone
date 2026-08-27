/**
 * Customer navigation discovery — the surfacing contract.
 *
 * Companion to feature-visibility-invariant.test.ts. That suite proves a feature
 * is marked discoverable in the registry; this one proves the customer's
 * NAVIGATION actually surfaces it.
 *
 * The regression this locks: an Enterprise customer entitled to 81 of 83
 * capabilities saw 17 of 48 nav destinations, because nav DENSITY defaulted to
 * compact and was keyed off `enforce` — a plan-enforcement flag. Entitlement had
 * leaked into discovery one layer below customerVisible.
 *
 *   navItemVisible()  → may this principal reach this destination at all?
 *                       role · activation · connection mode · modules ·
 *                       FeatureControl.customerVisible. NEVER the plan.
 *   navItemLocked()   → is it plan-locked? Changes how it RENDERS, never whether.
 *   density (simple)  → a user preference. Never a function of the plan.
 */
import { describe, it, expect } from "vitest";
import {
  navItemVisible,
  navItemLocked,
  visibleNavItems,
  NAV_FEATURE_BY_HREF,
  NAV_CAP_BY_HREF,
  WORKSPACES,
  type NavItem,
} from "@/app/dashboard/nav-items";
import { CAPABILITIES } from "@/lib/pricing/catalog";

/** Every customer-facing destination (WORKSPACES excludes ADMIN_WORKSPACE). */
const CUSTOMER_ITEMS: NavItem[] = WORKSPACES.flatMap((w) => w.items);

/** Entitlements for a tier index, straight from the catalog. */
function capsForTier(tierIndex: number): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  for (const c of CAPABILITIES) caps[c.key] = tierIndex >= c.minTierIndex;
  return caps;
}

const base = { activated: true, metaMode: "qr" as const, disabledFeatures: new Set<string>() };

describe("navigation does not vary with the plan", () => {
  it("the visible destination set is IDENTICAL at every tier", () => {
    const sets = [0, 1, 2, 3].map((t) =>
      visibleNavItems("owner", { ...base, enforce: true, caps: capsForTier(t) })
        .map((i) => i.href)
        .sort(),
    );
    for (let t = 1; t < sets.length; t++) {
      expect(sets[t], `tier ${t} nav differs from START`).toEqual(sets[0]);
    }
  });

  it("enforce=true does not remove a single destination", () => {
    const enforced = visibleNavItems("owner", { ...base, enforce: true, caps: capsForTier(0) }).map((i) => i.href).sort();
    const free = visibleNavItems("owner", { ...base, enforce: false }).map((i) => i.href).sort();
    expect(enforced).toEqual(free);
  });

  it("a START principal still SEES the Enterprise-only destinations, marked locked", () => {
    const opts = { ...base, enforce: true, caps: capsForTier(0) };
    const entHrefs = ["/dashboard/branches", "/dashboard/approvals", "/dashboard/white-label"];
    for (const href of entHrefs) {
      const item = CUSTOMER_ITEMS.find((i) => i.href === href);
      expect(item, `${href} is not a customer destination`).toBeTruthy();
      expect(navItemVisible(item!, { role: "owner", ...opts }), `${href} disappeared for START`).toBe(true);
      expect(navItemLocked(item!, { role: "owner", ...opts }), `${href} should be locked for START`).toBe(true);
    }
  });

  it("locked is never the same as hidden — every locked item is also visible", () => {
    const opts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(0) };
    const locked = CUSTOMER_ITEMS.filter((i) => navItemLocked(i, opts));
    expect(locked.length).toBeGreaterThan(0);
    for (const i of locked) {
      expect(navItemVisible(i, opts), `${i.href} is locked AND hidden`).toBe(true);
    }
  });
});

describe("customerVisible is the only thing that removes a destination", () => {
  it("an empty disabledFeatures set hides nothing", () => {
    const shown = visibleNavItems("owner", { ...base, enforce: true, caps: capsForTier(3) });
    // The one legitimate non-plan exclusion is connection mode (a QR tenant has
    // no Meta Cloud health to show). Everything else must be present.
    const hidden = CUSTOMER_ITEMS.filter((i) => !shown.some((s) => s.href === i.href));
    expect(hidden.every((i) => i.mode === "meta")).toBe(true);
  });

  it("turning customerVisible off removes exactly that destination and no other", () => {
    const opts = { ...base, enforce: true, caps: capsForTier(3) };
    const before = visibleNavItems("owner", opts).map((i) => i.href);
    const after = visibleNavItems("owner", { ...opts, disabledFeatures: new Set(["segments"]) }).map((i) => i.href);
    const removed = before.filter((h) => !after.includes(h));
    expect(removed).toEqual(
      before.filter((h) => NAV_FEATURE_BY_HREF[h] === "segments"),
    );
    expect(removed.length).toBeGreaterThan(0);
  });
});

describe("density is a preference, not an entitlement", () => {
  // accessibleWorkspaces() is module-private; the rule it applies is asserted
  // here through the exported predicates plus the documented CORE_HREFS policy:
  // compact keeps core + active, expanded keeps everything, and BOTH treat
  // locked and unlocked items identically.
  it("compact mode applies the same rule to locked and unlocked items", () => {
    const startOpts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(0) };
    const entOpts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(3) };
    // Same href set is visible for both, so compact — which filters purely on
    // href — necessarily yields the same set too.
    const startHrefs = CUSTOMER_ITEMS.filter((i) => navItemVisible(i, startOpts)).map((i) => i.href);
    const entHrefs = CUSTOMER_ITEMS.filter((i) => navItemVisible(i, entOpts)).map((i) => i.href);
    expect(startHrefs).toEqual(entHrefs);
  });
});

describe("every customer destination resolves to a real capability", () => {
  it("NAV_FEATURE_BY_HREF values that are catalog keys are genuine capabilities", () => {
    const catalog = new Set(CAPABILITIES.map((c) => c.key));
    const bad = Object.entries(NAV_FEATURE_BY_HREF)
      .filter(([, fid]) => !catalog.has(fid))
      .map(([href, fid]) => `${href} -> ${fid}`);
    expect(bad, `nav maps hrefs to non-capability ids: ${bad.join(", ")}`).toEqual([]);
  });
});

/**
 * The gate BELOW customerVisible: a nav item whose NAV_CAP_BY_HREF value is not
 * a real catalog capability locks FOREVER — `caps[cap]` is `undefined` for every
 * principal at every tier, so navItemLocked() returns true even for Enterprise.
 * The destination is visible but permanently wearing an upgrade CTA nobody can
 * satisfy. This is how /dashboard/plan (a plan-overview page with no capability
 * of its own) shipped locked to a paying Enterprise customer.
 */
describe("capability mappings resolve to real catalog capabilities", () => {
  it("every NAV_CAP_BY_HREF value is a genuine capability", () => {
    const catalog = new Set(CAPABILITIES.map((c) => c.key));
    const bad = Object.entries(NAV_CAP_BY_HREF)
      .filter(([, cap]) => !catalog.has(cap))
      .map(([href, cap]) => `${href} -> ${cap}`);
    expect(bad, `nav gates hrefs on non-capability ids: ${bad.join(", ")}`).toEqual([]);
  });

  it("the top tier owns every SHIPPED capability, so nothing shipped renders locked", () => {
    // comingSoon capabilities are deliberately excluded: the plan record does not
    // grant them yet, so production correctly renders them visible-and-locked even
    // for Enterprise (white_label is the live example). Asserting over them would
    // make this test disagree with the product on purpose.
    const soon = new Set(CAPABILITIES.filter((c) => c.comingSoon).map((c) => c.key));
    const opts = { role: "owner" as const, ...base, enforce: true, caps: capsForTier(3) };
    const locked = CUSTOMER_ITEMS
      .filter((i) => navItemLocked(i, opts))
      .filter((i) => !soon.has(NAV_CAP_BY_HREF[i.href]))
      .map((i) => i.href);
    expect(locked, `Enterprise sees locked shipped destinations: ${locked.join(", ")}`).toEqual([]);
  });
});

/**
 * Surfacing regression lock. These six were reachable only by typing the URL:
 * they had pages, capabilities and entitlement, but no workspace listed them, so
 * no customer could discover them. Re-hiding one must fail the build.
 */
describe("audited destinations stay discoverable in a customer workspace", () => {
  const SURFACED: [string, string][] = [
    ["/dashboard/plan", "home"],
    ["/dashboard/knowledge-brain", "automation"],
    ["/dashboard/brain", "automation"],
    ["/dashboard/sales-brain", "analytics"],
    ["/dashboard/suggestions", "analytics"],
    ["/dashboard/monitoring", "analytics"],
    ["/dashboard/intel", "analytics"],
    ["/dashboard/settings/bridge", "conversations"],
    ["/dashboard/meta", "conversations"],
    // multi_team: sold on Enterprise with no product behind it until the Team
    // model, the /api/teams surface and this destination shipped together.
    ["/dashboard/teams", "settings"],
  ];

  it.each(SURFACED)("%s is listed in the %s workspace", (href, wsId) => {
    const ws = WORKSPACES.find((w) => w.id === wsId);
    expect(ws, `workspace ${wsId} is gone`).toBeTruthy();
    expect(ws!.items.some((i) => i.href === href)).toBe(true);
  });

  it.each(SURFACED)("%s is visible AND unlocked for an Enterprise owner", (href) => {
    const item = CUSTOMER_ITEMS.find((i) => i.href === href)!;
    // A mode-scoped destination is only reachable by a tenant on that mode —
    // judge it under its own mode, never as if it were unconditional.
    const opts = { role: "owner" as const, ...base, metaMode: item.mode ?? "qr", enforce: true, caps: capsForTier(3) };
    expect(navItemVisible(item, opts), `${href} is hidden`).toBe(true);
    expect(navItemLocked(item, opts), `${href} is locked`).toBe(false);
  });
});
