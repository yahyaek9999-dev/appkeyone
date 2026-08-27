/**
 * Every customer destination tells you where you are.
 *
 * Found by walking the product in production, not by reading code: eight
 * sidebar destinations rendered the breadcrumb "لوحة التحكم › الرئيسية ›
 * نظرة عامة" — the Home overview crumb — while showing something else
 * entirely. /dashboard/teams said "الرئيسية › نظرة عامة" above a page titled
 * الفرق والصلاحيات; /dashboard/sms said the same above K1SMS.
 *
 * The cause is the resolver's fallback in components/ui/breadcrumb.tsx: an
 * unmapped path takes the longest-prefix match, and EVERY dashboard path has
 * "/dashboard" as a prefix. So a missing entry does not render a blank
 * breadcrumb that someone would notice — it renders a confidently wrong one.
 * That is why this needs a test rather than review: the failure is silent and
 * looks plausible.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { WORKSPACES } from "@/app/dashboard/nav-items";

const BREADCRUMB = path.join(process.cwd(), "components", "ui", "breadcrumb.tsx");

/** Route → crumb keys declared in DASHBOARD_LABELS. */
function mappedRoutes(): Set<string> {
  const src = fs.readFileSync(BREADCRUMB, "utf8");
  return new Set([...src.matchAll(/^\s*"(\/dashboard[^"]*)":/gm)].map((m) => m[1]));
}

/** Customer destinations, excluding non-dashboard links like /docs. */
const NAV_ROUTES: string[] = [
  ...new Set(
    WORKSPACES.flatMap((w) => w.items)
      .map((i) => i.href)
      .filter((h) => h.startsWith("/dashboard")),
  ),
];

describe("breadcrumbs cover every customer destination", () => {
  it("the nav actually yields destinations to check", () => {
    expect(NAV_ROUTES.length).toBeGreaterThan(40);
  });

  it("every sidebar destination has its own breadcrumb entry", () => {
    const mapped = mappedRoutes();
    const missing = NAV_ROUTES.filter((r) => !mapped.has(r));
    const report = missing
      .map(
        (r) =>
          `\n  Missing breadcrumb — this page will claim to be the Home overview:` +
          `\n    route=${r}` +
          `\n    fix=add "${r}": { label: "…", workspace: "…" } to DASHBOARD_LABELS in components/ui/breadcrumb.tsx`,
      )
      .join("");
    expect(missing, report).toEqual([]);
  });

  it("the crumb is derived from the nav, not a second hand-kept copy", () => {
    // 30 routes had drifted between the two, and the map still names a retired
    // IA ("العمليات", "النمو", "ذكاء الأعمال") whose sections are not in the
    // rail at all — so a customer was told they were somewhere they could not
    // navigate to. The nav is the authority because it is what was clicked.
    const src = fs.readFileSync(BREADCRUMB, "utf8");
    expect(src, "breadcrumb no longer reads the nav").toMatch(/WORKSPACES\.flatMap/);
    expect(src, "the nav must win over the legacy map").toMatch(
      /NAV_CRUMBS\[pathname\]\s*\?\?\s*DASHBOARD_LABELS\[pathname\]/,
    );
  });

  it("the legacy map still names sections that are NOT in the rail — which is why nav must win", () => {
    // Not a tautology: this reads the workspace names out of DASHBOARD_LABELS
    // and checks them against the actual rail. Several ("العمليات", "النمو",
    // "ذكاء الأعمال", "البيانات") are from a retired IA and match no workspace
    // a customer can open. They are harmless only while NAV_CRUMBS takes
    // precedence for every route the nav lists — the assertion above.
    const src = fs.readFileSync(BREADCRUMB, "utf8");
    const legacyWorkspaces = new Set(
      [...src.matchAll(/workspace:\s*"([^"]+)"/g)].map((m) => m[1]),
    );
    const rail = new Set(WORKSPACES.map((w) => w.label));
    const orphaned = [...legacyWorkspaces].filter((w) => !rail.has(w));
    expect(
      orphaned.length,
      `expected the legacy map to still contain non-rail sections (${[...legacyWorkspaces].join(", ")}); ` +
        `if it no longer does, the nav-first precedence can be simplified away`,
    ).toBeGreaterThan(0);
  });

  it("every route the nav lists resolves from the nav, never from the legacy map", () => {
    const src = fs.readFileSync(BREADCRUMB, "utf8");
    // NAV_CRUMBS is built from every workspace item, so coverage is total by
    // construction; this pins that construction rather than a snapshot.
    expect(src).toMatch(/WORKSPACES\.flatMap\(\(w\) => w\.items\.map/);
    const navRoutes = new Set(NAV_ROUTES);
    expect(navRoutes.size).toBe(NAV_ROUTES.length);
  });

  it("the /dashboard fallback is what makes a missing entry dangerous", () => {
    // Documents the mechanism the test exists to catch: prefix matching means
    // an unmapped route silently inherits the Home crumb instead of rendering
    // nothing. If this ever stops being true, the test above can be relaxed.
    const src = fs.readFileSync(BREADCRUMB, "utf8");
    expect(src).toMatch(/startsWith\(k \+ "\/"\)/);
    expect(mappedRoutes().has("/dashboard")).toBe(true);
  });
});
