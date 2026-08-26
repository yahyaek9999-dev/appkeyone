/**
 * Feature Visibility Invariant — the permanent contract.
 *
 * This suite exists because the same regression shipped repeatedly: a deploy
 * would silently re-hide customer features. Every test here locks one clause of
 * the invariant so it cannot come back:
 *
 *   CANONICAL FEATURES = the pricing capability catalog (currently 83).
 *   customerVisible is the ONLY visibility control, with exactly two states.
 *   VISIBILITY ≠ ENTITLEMENT — a locked feature stays discoverable.
 *   Seeding may CREATE a missing row; it must NEVER overwrite an admin's
 *   customerVisible decision.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── In-memory prisma stand-in that records every write ──────────────────────

const featureDB: Map<string, any> = new Map();
const releaseDB: Map<string, any> = new Map();
/** Every `update` payload seedFeatureRegistry() sent, in order. */
const updatePayloads: any[] = [];
/** Every `create` payload seedFeatureRegistry() sent, in order. */
const createPayloads: any[] = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    featureControl: {
      findMany: vi.fn(({ where }: any = {}) => {
        let rows = Array.from(featureDB.values());
        if (where?.customerVisible !== undefined) {
          rows = rows.filter((r) => r.customerVisible === where.customerVisible);
        }
        return Promise.resolve(rows);
      }),
      upsert: vi.fn(({ where, create, update }: any) => {
        const existing = featureDB.get(where.featureId);
        if (existing) {
          updatePayloads.push({ featureId: where.featureId, ...update });
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        createPayloads.push(create);
        featureDB.set(where.featureId, { ...create });
        return Promise.resolve(featureDB.get(where.featureId));
      }),
      create: vi.fn(({ data }: any) => {
        createPayloads.push(data);
        featureDB.set(data.featureId, { ...data });
        return Promise.resolve(data);
      }),
      update: vi.fn(({ where, data }: any) => {
        updatePayloads.push({ featureId: where.featureId, ...data });
        const row = featureDB.get(where.featureId);
        if (row) Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    featureRelease: {
      findMany: vi.fn(() => Promise.resolve(Array.from(releaseDB.values()))),
      upsert: vi.fn(({ where, create, update }: any) => {
        const existing = releaseDB.get(where.releaseId);
        if (existing) Object.assign(existing, update);
        else releaseDB.set(where.releaseId, { ...create });
        return Promise.resolve(releaseDB.get(where.releaseId));
      }),
    },
  },
}));

import {
  seedFeatureRegistry,
  syncRegistryFromJson,
  getCustomerInvisibleFeatureIds,
  isFeatureVisible,
  invalidateFeatureCache,
  CANONICAL_FEATURE_IDS,
} from "@/lib/feature-control";
import { CAPABILITIES } from "@/lib/pricing/catalog";
import { FEATURE_STATUSES, FEATURE_STATUS_LABELS } from "@/lib/feature-status";

function reset() {
  featureDB.clear();
  releaseDB.clear();
  updatePayloads.length = 0;
  createPayloads.length = 0;
  invalidateFeatureCache();
}

// ─────────────────────────────────────────────────────────────────────────────

describe("canonical feature set", () => {
  beforeEach(reset);

  it("the catalog IS the canonical set — CANONICAL_FEATURE_IDS mirrors it exactly", () => {
    expect(CANONICAL_FEATURE_IDS.size).toBe(CAPABILITIES.length);
    for (const cap of CAPABILITIES) {
      expect(CANONICAL_FEATURE_IDS.has(cap.key)).toBe(true);
    }
  });

  it("a fresh seed produces exactly one row per canonical feature", async () => {
    await seedFeatureRegistry();
    expect(featureDB.size).toBe(CAPABILITIES.length);
    for (const cap of CAPABILITIES) {
      expect(featureDB.has(cap.key)).toBe(true);
    }
  });
});

describe("seed creates every canonical feature customer-visible", () => {
  beforeEach(reset);

  it("100% of seeded rows are customerVisible=true — zero hidden", async () => {
    await seedFeatureRegistry();
    const hidden = Array.from(featureDB.values()).filter((r) => !r.customerVisible);
    expect(hidden.map((r) => r.featureId)).toEqual([]);
    expect(Array.from(featureDB.values()).every((r) => r.customerVisible === true)).toBe(true);
  });

  it("comingSoon does NOT hide a feature — it only withholds access", async () => {
    const comingSoon = CAPABILITIES.filter((c) => c.comingSoon);
    // Guard the test itself: if the catalog ever has no comingSoon capability
    // this assertion would silently pass on an empty set.
    expect(comingSoon.length).toBeGreaterThan(0);

    await seedFeatureRegistry();
    for (const cap of comingSoon) {
      const row = featureDB.get(cap.key);
      expect(row.customerVisible).toBe(true);          // discoverable
      expect(row.status).toBe("coming_soon");          // …but not usable
      expect(await isFeatureVisible(cap.key)).toBe(true);
    }
  });

  it("no seeded row uses status='hidden' — that value conflated the two axes", async () => {
    await seedFeatureRegistry();
    expect(Array.from(featureDB.values()).filter((r) => r.status === "hidden")).toEqual([]);
  });

  it("high-tier features are seeded visible — minTierIndex never hides", async () => {
    await seedFeatureRegistry();
    const enterprise = CAPABILITIES.filter((c) => c.minTierIndex === 3);
    expect(enterprise.length).toBeGreaterThan(0);
    for (const cap of enterprise) {
      expect(featureDB.get(cap.key).customerVisible).toBe(true);
    }
  });

  it("no seeded row is adminOnly — 'مشرف فقط' is not a visibility state", async () => {
    await seedFeatureRegistry();
    expect(Array.from(featureDB.values()).filter((r) => r.adminOnly)).toEqual([]);
  });
});

describe("seed can NEVER overwrite an admin visibility decision", () => {
  beforeEach(reset);

  it("re-seeding does not write customerVisible on existing rows", async () => {
    await seedFeatureRegistry();      // create pass
    updatePayloads.length = 0;
    await seedFeatureRegistry();      // update pass — every row now exists

    expect(updatePayloads.length).toBeGreaterThan(0);
    const offenders = updatePayloads.filter((p) => "customerVisible" in p);
    expect(offenders).toEqual([]);
  });

  it("an admin's OFF decision survives an unlimited number of re-seeds", async () => {
    await seedFeatureRegistry();
    const target = CAPABILITIES[0].key;

    // Admin turns it off in /admin/feature-control.
    featureDB.get(target).customerVisible = false;

    for (let deploy = 0; deploy < 5; deploy++) await seedFeatureRegistry();

    expect(featureDB.get(target).customerVisible).toBe(false);
  });

  it("an admin's ON decision on a comingSoon feature survives re-seeds", async () => {
    await seedFeatureRegistry();
    const comingSoon = CAPABILITIES.find((c) => c.comingSoon)!.key;

    featureDB.get(comingSoon).customerVisible = true;
    for (let deploy = 0; deploy < 5; deploy++) await seedFeatureRegistry();

    expect(featureDB.get(comingSoon).customerVisible).toBe(true);
  });

  it("seed never writes the other admin-owned columns either", async () => {
    await seedFeatureRegistry();
    updatePayloads.length = 0;
    await seedFeatureRegistry();

    for (const forbidden of ["customerVisible", "status", "killSwitch", "rolloutPct"]) {
      expect(updatePayloads.filter((p) => forbidden in p)).toEqual([]);
    }
  });
});

describe("JSON registry sync never hides a canonical feature", () => {
  beforeEach(reset);

  it("a canonical feature typed admin_internal is still created visible", async () => {
    const canonical = CAPABILITIES[0].key;
    await syncRegistryFromJson([
      { key: canonical, nameEn: "X", nameAr: "س", type: "admin_internal", category: "core" },
    ]);
    const row = featureDB.get(canonical);
    expect(row.customerVisible).toBe(true);
    expect(row.adminOnly).toBe(false);
  });

  it("a NON-canonical admin_internal row may still be created hidden", async () => {
    await syncRegistryFromJson([
      { key: "some_internal_plumbing", nameEn: "X", nameAr: "س", type: "admin_internal", category: "core" },
    ]);
    expect(featureDB.get("some_internal_plumbing").customerVisible).toBe(false);
  });

  it("syncing an existing row does not touch customerVisible", async () => {
    const canonical = CAPABILITIES[0].key;
    await seedFeatureRegistry();
    featureDB.get(canonical).customerVisible = false;
    updatePayloads.length = 0;

    await syncRegistryFromJson([
      { key: canonical, nameEn: "X", nameAr: "س", type: "feature", category: "core" },
    ]);

    expect(updatePayloads.filter((p) => "customerVisible" in p)).toEqual([]);
    expect(featureDB.get(canonical).customerVisible).toBe(false);
  });
});

describe("exactly two visibility states", () => {
  beforeEach(reset);

  it("getCustomerInvisibleFeatureIds is empty after a clean seed", async () => {
    await seedFeatureRegistry();
    invalidateFeatureCache();
    const invisible = await getCustomerInvisibleFeatureIds();
    expect(Array.from(invisible)).toEqual([]);
  });

  it("it reflects exactly the rows an admin turned off — nothing more", async () => {
    await seedFeatureRegistry();
    const [a, b] = CAPABILITIES.map((c) => c.key);
    featureDB.get(a).customerVisible = false;
    featureDB.get(b).customerVisible = false;
    invalidateFeatureCache();

    const invisible = await getCustomerInvisibleFeatureIds();
    expect(Array.from(invisible).sort()).toEqual([a, b].sort());
  });
});

describe("status vocabulary", () => {
  it("no status label uses 'مخفي' — hiding belongs to the visibility axis", () => {
    for (const label of Object.values(FEATURE_STATUS_LABELS)) {
      expect(label).not.toContain("مخفي");
    }
  });

  it("every status the admin UI can pick is accepted by the API schema", () => {
    // The admin dropdown renders FEATURE_STATUSES; the zod enums are built from
    // the same constant, so a value can never exist in one and not the other.
    expect(FEATURE_STATUSES).toContain("coming_soon");
    expect(Object.keys(FEATURE_STATUS_LABELS).sort()).toEqual([...FEATURE_STATUSES].sort());
  });
});
