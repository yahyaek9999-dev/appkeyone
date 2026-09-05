/**
 * Capability gating on the API surface.
 *
 * `apiGate()` is the product's single answer to "may this tenant use this paid
 * feature?", and 98 routes now depend on it. Two things are worth pinning:
 * that the gate behaves the way its callers assume, and that a feature family
 * is gated *consistently* — a paywall on the collection route with the item
 * route left open is a paywall with a side door.
 *
 * Static and pure: no database, no network, no production data.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";

const API = path.join(process.cwd(), "app/api");

function routesUnder(dir: string): string[] {
  const abs = path.join(API, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e === "route.ts") out.push(path.relative(API, p));
    }
  })(abs);
  return out.sort();
}

const src = (rel: string) => readFileSync(path.join(API, rel), "utf-8");
const gated = (rel: string) => /apiGate\(/.test(src(rel));
/**
 * A route that enforces the plan by its own means rather than through apiGate.
 * Two shapes exist in this codebase and both are real enforcement:
 *   - `feature_disabled` — blocks only the explicit premium lock, deliberately
 *     leaving free and legacy tenants working (broadcasts/generate, optimize)
 *   - `checkLimit(uid, "broadcast")` — blocks on any disallowed decision
 *     (broadcasts/ab), though it answers 403 where the rest of the product
 *     answers 402
 */
const narrowlyGated = (rel: string) =>
  /feature_disabled/.test(src(rel)) || /checkLimit\(\s*uid\s*,/.test(src(rel));

describe("apiGate contract", () => {
  const gate = readFileSync(path.join(process.cwd(), "lib/membership/gate.ts"), "utf-8");

  it("distinguishes unauthenticated, forbidden and paywalled", () => {
    // Callers branch on these three, and collapsing any two would make an
    // unpaid feature indistinguishable from a signed-out session.
    expect(gate).toMatch(/status: 401/);   // no session
    expect(gate).toMatch(/status: 403/);   // authenticated, wrong role
    expect(gate).toMatch(/status: 402/);   // authenticated, entitled role, unpaid
  });

  it("names the capability and the tier that unlocks it", () => {
    // Without these the client cannot tell the user what to do about a 402.
    expect(gate).toMatch(/capability_locked/);
    expect(gate).toMatch(/recommendedTier/);
  });
});

describe("capability keys are real", () => {
  const catalog = readFileSync(
    path.join(process.cwd(), "lib/pricing/catalog.ts"), "utf-8",
  );

  it("every gated key exists in the pricing catalog", () => {
    // A typo'd key is not a loud failure — hasCapability() returns undefined,
    // apiGate 402s, and the feature silently becomes unreachable for everyone.
    const keys = new Set<string>();
    for (const rel of routesUnder(".")) {
      for (const m of src(rel).matchAll(/apiGate\(\s*"([a-z0-9_]+)"/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(0);
    const missing = [...keys].filter((k) => !catalog.includes(`"${k}"`));
    expect(missing, `keys not in lib/pricing/catalog.ts: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("a gated feature family has no side door", () => {
  /**
   * If the collection route is gated, its item routes must be too — otherwise a
   * tenant without the capability is stopped from listing or creating, but can
   * still read, edit and delete by id.
   *
   * A route carrying its own narrower plan gate is exempt: broadcasts/generate
   * and broadcasts/optimize deliberately block only the explicit premium-lock
   * case so free and legacy tenants keep working, and layering the broader gate
   * on top would silently withdraw access those users have today.
   */
  for (const family of ["broadcasts", "products", "sms"]) {
    it(`${family}: every route is gated, or deliberately narrowly gated`, () => {
      const routes = routesUnder(family);
      expect(routes.length).toBeGreaterThan(0);
      const collection = `${family}/route.ts`;
      if (!routes.includes(collection) || !gated(collection)) return;

      const open = routes.filter((r) => !gated(r) && !narrowlyGated(r) && r !== collection);
      // Known, reasoned exclusions — each is a read of data the tenant already
      // owns, or billing data that must stay visible after a downgrade.
      const allowed = new Set([
        "products/image/[file]/route.ts", // serves an image the tenant owns
        "sms/credits/route.ts",           // the tenant's own credit balance
      ]);
      const leaks = open.filter((r) => !allowed.has(r));
      expect(leaks, `ungated routes in the ${family} family:\n${leaks.join("\n")}`).toEqual([]);
    });
  }
});
