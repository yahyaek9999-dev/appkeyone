/**
 * Every customer surface must be REACHABLE from the UI.
 *
 * The companion suites prove a destination that IS in the nav behaves correctly.
 * This one proves the inverse — that no customer surface is missing from the nav
 * in the first place. It reads the filesystem rather than a hand-maintained list,
 * because every list of "intentionally hidden" routes in this codebase has
 * drifted: the ADMIN_WORKSPACE policy comment described eleven pageGate() +
 * <LockedFeature> customer surfaces as operator consoles, and nobody noticed
 * until an Enterprise customer's own audit found capabilities they had paid for
 * with no way to click through to them.
 *
 * THE DEFINITION, taken from that same policy comment:
 *
 *   requireAdmin()                → platform tooling. Bounces a customer to
 *                                   /dashboard. Must NOT be in customer nav.
 *   pageGate() + <LockedFeature>  → a CUSTOMER SURFACE. It gates on a capability
 *                                   that is on the price list and renders an
 *                                   upgrade path when the plan is short. It MUST
 *                                   be reachable.
 *
 * "Reachable" means the route is a customer nav destination, or it lives beneath
 * one — a sub-page opened from its parent (settings/team from settings, sms/credits
 * from sms) is discoverable. `/dashboard` itself does not count as a parent, or
 * every route in the product would trivially pass.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { WORKSPACES } from "@/app/dashboard/nav-items";

const DASHBOARD = path.join(process.cwd(), "app", "dashboard");

function pageFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pageFiles(p, out);
    else if (e.name === "page.tsx") out.push(p);
  }
  return out;
}

/** app/dashboard/foo/bar/page.tsx -> /dashboard/foo/bar */
function routeOf(file: string): string {
  const rel = path.dirname(path.relative(DASHBOARD, file)).replace(/\\/g, "/");
  return rel === "." ? "/dashboard" : `/dashboard/${rel}`;
}

type Surface = { route: string; caps: string[] };

/** Pages that gate on a sold capability and render an upgrade path, not a bounce. */
const CUSTOMER_SURFACES: Surface[] = pageFiles(DASHBOARD)
  // Comments are stripped before ANY detection runs. This repo documents its own
  // gating rules in prose inside the pages, so a page whose comment merely
  // discusses pageGate/LockedFeature/requireAdmin must not be classified by it —
  // only real code counts.
  .map((f) => ({ file: f, src: fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "") }))
  .filter(({ src }) => /pageGate\(\s*"/.test(src) && /LockedFeature/.test(src))
  // requireAdmin() makes it platform tooling regardless of what else it does.
  .filter(({ src }) => !/requireAdmin\s*\(/.test(src))
  .map(({ file, src }) => ({
    route: routeOf(file),
    caps: [...src.matchAll(/pageGate\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]),
  }));

const NAV_HREFS: string[] = WORKSPACES.flatMap((w) => w.items).map((i) => i.href);

/** In the nav, or beneath a nav destination deeper than /dashboard. */
function reachable(route: string): boolean {
  if (NAV_HREFS.includes(route)) return true;
  return NAV_HREFS.some((h) => h !== "/dashboard" && route.startsWith(h + "/"));
}

describe("no customer surface is buried", () => {
  it("finds customer surfaces to check (the scan itself must not silently match nothing)", () => {
    expect(CUSTOMER_SURFACES.length).toBeGreaterThan(20);
  });

  it("every pageGate() + <LockedFeature> page is reachable from the customer UI", () => {
    const buried = CUSTOMER_SURFACES.filter((s) => !reachable(s.route)).map(
      (s) => `${s.route} (sells: ${s.caps.join(", ")})`,
    );
    expect(
      buried,
      `customer surfaces with no nav entry and no nav parent:\n  ${buried.join("\n  ")}`,
    ).toEqual([]);
  });

  it("/dashboard is not treated as everything's parent", () => {
    // Guards the rule above: were /dashboard allowed as a parent prefix, deleting
    // any nav item would still pass and this whole suite would be decorative.
    expect(reachable("/dashboard/a-route-that-is-in-no-workspace")).toBe(false);
  });
});
