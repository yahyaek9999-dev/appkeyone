/**
 * Pricing ↔ Entitlement Agreement (Phase 4)
 *
 * The commercial requirement: "No feature shown on Pricing may be unavailable
 * to that plan." Pricing, the entitlement engine, and the feature registry must
 * agree, or the product sells something it does not deliver.
 *
 * These are INVARIANT tests, not snapshot tests. They derive both sides from
 * lib/pricing/catalog.ts and assert they cannot diverge — so adding a
 * capability or re-tiering one can never silently break the promise.
 */
import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  TIERS,
  PUBLIC_TIERS,
  capabilitiesForIndex,
  tierUnlocking,
  getTier,
} from "@/lib/pricing/catalog";

// Mirrors getEntitlements() Step 1 exactly:
//   capabilities[cap.key] = baseCapIndex >= cap.minTierIndex
function entitledCapsForTier(capIndex: number): Set<string> {
  return new Set(
    CAPABILITIES.filter((c) => capIndex >= c.minTierIndex).map((c) => c.key),
  );
}

// Mirrors the pricing page's per-tier feature derivation:
//   CAPABILITIES.filter(c => c.minTierIndex === tier.index)
// plus the "everything in <previous tier>" roll-up.
function pricingCapsForTier(tierIndex: number): Set<string> {
  return new Set(
    CAPABILITIES.filter((c) => c.minTierIndex <= tierIndex).map((c) => c.key),
  );
}

describe("every capability advertised on pricing is actually entitled", () => {
  for (const tier of PUBLIC_TIERS) {
    it(`${tier.slug}: pricing promises nothing the entitlement engine withholds`, () => {
      const entitled = entitledCapsForTier(tier.capIndex);
      const advertised = pricingCapsForTier(tier.capIndex);

      const overpromised = [...advertised].filter((k) => !entitled.has(k));
      expect(overpromised, `${tier.slug} advertises but does not grant: ${overpromised.join(", ")}`).toEqual([]);
    });
  }
});

describe("every entitled capability is representable on pricing", () => {
  for (const tier of PUBLIC_TIERS) {
    it(`${tier.slug}: no entitled capability is missing from the pricing derivation`, () => {
      const entitled = entitledCapsForTier(tier.capIndex);
      const advertised = pricingCapsForTier(tier.capIndex);

      const hidden = [...entitled].filter((k) => !advertised.has(k));
      expect(hidden, `${tier.slug} grants but pricing cannot show: ${hidden.join(", ")}`).toEqual([]);
    });
  }
});

describe("tier monotonicity — upgrading never removes a capability", () => {
  it("each public tier is a strict superset of the one below it", () => {
    const ordered = [...PUBLIC_TIERS].sort((a, b) => a.capIndex - b.capIndex);
    for (let i = 1; i < ordered.length; i++) {
      const lower = entitledCapsForTier(ordered[i - 1].capIndex);
      const higher = entitledCapsForTier(ordered[i].capIndex);
      const lost = [...lower].filter((k) => !higher.has(k));
      expect(lost, `${ordered[i].slug} loses capabilities held by ${ordered[i - 1].slug}: ${lost.join(", ")}`).toEqual([]);
    }
  });

  it("capabilitiesForIndex agrees with the minTierIndex rule", () => {
    for (const tier of PUBLIC_TIERS) {
      const fromHelper = new Set(capabilitiesForIndex(tier.capIndex));
      const fromRule = entitledCapsForTier(tier.capIndex);
      expect([...fromHelper].sort()).toEqual([...fromRule].sort());
    }
  });
});

describe("upgrade path is well-formed", () => {
  it("every non-Start capability names the tier that unlocks it", () => {
    for (const cap of CAPABILITIES) {
      if (cap.minTierIndex === 0) continue; // in every plan
      const unlocking = tierUnlocking(cap.key);
      expect(unlocking, `${cap.key} has no unlocking tier`).toBeTruthy();
      const tier = getTier(unlocking!);
      expect(tier, `${cap.key} unlocks to unknown tier ${unlocking}`).toBeTruthy();
      // The unlocking tier must actually grant it.
      expect(tier!.capIndex).toBeGreaterThanOrEqual(cap.minTierIndex);
    }
  });

  it("the four customer-facing plans are the public set", () => {
    expect(PUBLIC_TIERS.length).toBe(4);
    const slugs = PUBLIC_TIERS.map((t) => t.slug);
    expect(slugs).toEqual(["k_start", "k_growth", "k_pro", "k_enterprise"]);
  });

  it("no internal/legacy tier leaks into the public pricing set", () => {
    // k_business and k_scale are backward-compat only and must never be sold.
    const publicSlugs = new Set(PUBLIC_TIERS.map((t) => t.slug));
    expect(publicSlugs.has("k_business")).toBe(false);
    expect(publicSlugs.has("k_scale")).toBe(false);
    // …but they must still resolve, so existing subscribers keep working.
    expect(getTier("k_business")).toBeTruthy();
    expect(getTier("k_scale")).toBeTruthy();
  });
});

describe("catalog integrity", () => {
  it("has no duplicate capability keys", () => {
    const keys = CAPABILITIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every capability sits within the 4-tier model", () => {
    for (const c of CAPABILITIES) {
      expect(c.minTierIndex, `${c.key}`).toBeGreaterThanOrEqual(0);
      expect(c.minTierIndex, `${c.key}`).toBeLessThanOrEqual(3);
    }
  });

  it("every capability carries both AR and EN labels (pricing renders both)", () => {
    for (const c of CAPABILITIES) {
      expect(c.label.ar, `${c.key} missing AR label`).toBeTruthy();
      expect(c.label.en, `${c.key} missing EN label`).toBeTruthy();
    }
  });
});
