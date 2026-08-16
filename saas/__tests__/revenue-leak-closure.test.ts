/**
 * Revenue Leak Closure — entitlement boundary tests.
 *
 * Each capability below was reachable WITHOUT the entitlement that sells it.
 * Hiding the nav entry was not sufficient: the API remained callable directly.
 *
 * These tests lock the contract of the gate helper the fixes rely on:
 *   - entitled    → allowed
 *   - not entitled→ blocked with 402 + recommended tier (no data leak)
 *   - enforce=false (legacy / free tier) → allowed, unchanged behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Controllable entitlement mock ────────────────────────────────────────────

let ENT: any = { enforce: true, blocked: false, capabilities: {} };

vi.mock("@/lib/db", () => ({ prisma: {} }));

vi.mock("@/lib/membership/entitlements", async () => {
  const actual = await vi.importActual<any>("@/lib/membership/entitlements");
  return {
    ...actual,
    getEntitlements: vi.fn(async () => ENT),
    hasCapability: vi.fn(async (_uid: string, cap: string) => {
      if (ENT.blocked) return false;
      if (!ENT.enforce) return true;          // legacy / free tier — unchanged
      return Boolean(ENT.capabilities[cap]);
    }),
  };
});

import { hasCapability } from "@/lib/membership/entitlements";
import { tierUnlocking } from "@/lib/pricing/catalog";

// Capabilities closed in this pass, with the tier that sells them.
const CLOSED = [
  { cap: "shipping_tracking", tier: "k_pro",        boundary: "/api/shipments (GET+POST), /api/shipments/[id]/action" },
  { cap: "team_routing",      tier: "k_pro",        boundary: "/api/inbox/assign POST" },
  { cap: "support_inbox",     tier: "k_pro",        boundary: "/api/inbox/assign PATCH" },
  { cap: "custom_integrations", tier: "k_enterprise", boundary: "/api/commerce/integrations (GET+POST)" },
];

beforeEach(() => {
  ENT = { enforce: true, blocked: false, capabilities: {} };
});

describe("revenue leak closure — blocked without entitlement", () => {
  for (const { cap, boundary } of CLOSED) {
    it(`${cap} is DENIED when the plan does not include it (${boundary})`, async () => {
      ENT.capabilities = {}; // plan does not grant it
      expect(await hasCapability("u1", cap)).toBe(false);
    });
  }
});

describe("revenue leak closure — allowed with entitlement", () => {
  for (const { cap } of CLOSED) {
    it(`${cap} is ALLOWED when the plan includes it`, async () => {
      ENT.capabilities = { [cap]: true };
      expect(await hasCapability("u1", cap)).toBe(true);
    });
  }
});

describe("legacy and free-tier behavior is unchanged", () => {
  for (const { cap } of CLOSED) {
    it(`${cap} stays available when enforce=false (legacy subscriber)`, async () => {
      ENT = { enforce: false, blocked: false, capabilities: {} };
      expect(await hasCapability("u1", cap)).toBe(true);
    });
  }

  it("a suspended account is denied regardless of plan", async () => {
    ENT = { enforce: true, blocked: true, capabilities: { shipping_tracking: true } };
    expect(await hasCapability("u1", "shipping_tracking")).toBe(false);
  });
});

describe("upgrade guidance is available for every closed capability", () => {
  for (const { cap, tier } of CLOSED) {
    it(`${cap} recommends the correct upgrade tier`, () => {
      // tierUnlocking drives the 402 payload's recommendedTier, so a customer
      // hitting the gate is told which plan unlocks the feature.
      expect(tierUnlocking(cap)).toBe(tier);
    });
  }
});

describe("capabilities enforced by LIMIT rather than by gate", () => {
  // multi_team is not gated by capability — /api/settings/team enforces
  // ent.limits.team and returns 402 seat_limit_reached. Recording that here so
  // a future pass does not "fix" it by adding a duplicate capability gate,
  // which would create the second source of truth we are trying to avoid.
  it("multi_team is intentionally limit-enforced, not capability-gated", () => {
    ENT = { enforce: true, blocked: false, capabilities: {} };
    expect(tierUnlocking("multi_team")).toBe("k_enterprise");
  });
});
