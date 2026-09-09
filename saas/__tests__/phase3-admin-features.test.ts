/**
 * The canonical feature catalogue.
 *
 * `project-knowledge/master-feature-registry.json` is the product's feature
 * inventory. This suite pins the reconciliation between the number the product
 * programme quotes and the number of rows in the file, because those two are
 * routinely confused:
 *
 *   98 registry entries
 *     = 83 customer-facing  (62 `feature` + 21 `subfeature`)
 *     + 15 `admin_internal` (never shown to a customer)
 *
 * **83 is the canonical feature count**, and it is exactly the customerVisible
 * set. Of those 83, one — White Label — is held back by the visibility engine
 * (`lib/feature-control.ts`, `status: "hidden"`), which is where the
 * programme's "82 customer-visible + 1 hidden" comes from. Registry
 * `customerVisible` means "this is a customer feature, not an admin tool"; it
 * is NOT an entitlement and NOT a live visibility decision. Visibility ≠
 * entitlement ≠ capability — do not collapse them.
 *
 * This file previously asserted a 77-entry snapshot against a schema the
 * registry no longer has (`status`, `implemented`, `adminVisible`,
 * `discoverable`, `parentFeature`, and bare `start`/`pro` plan names). It had
 * been failing 17 assertions on the production baseline, which is worse than
 * having no test: a permanently red suite is not a gate. It asserts the real
 * schema now.
 */
import { describe, test, expect, beforeAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";

interface Feature {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  type: "feature" | "subfeature" | "admin_internal";
  category: string;
  capability: string;
  routes: string[];
  apiFamilies: string[];
  customerVisible: boolean;
  requiredPlan: "k_start" | "k_growth" | "k_pro" | "k_enterprise" | "k_admin";
}

/** The counts the product programme quotes. Change these only with the product. */
const CANONICAL_CUSTOMER_FEATURES = 83;
const ADMIN_INTERNAL_FEATURES = 15;
const TOTAL_REGISTRY_ENTRIES = CANONICAL_CUSTOMER_FEATURES + ADMIN_INTERNAL_FEATURES;

describe("master feature registry", () => {
  let features: Feature[] = [];

  beforeAll(async () => {
    const registryPath = path.join(
      process.cwd(),
      "project-knowledge/master-feature-registry.json",
    );
    features = JSON.parse(await fs.readFile(registryPath, "utf-8"));
  });

  describe("the 83/98 reconciliation", () => {
    test("holds every canonical feature plus the admin tools", () => {
      expect(features.length).toBe(TOTAL_REGISTRY_ENTRIES);
    });

    test("counts 83 customer-facing features — the canonical number", () => {
      const customer = features.filter((f) => f.customerVisible);
      expect(customer.length).toBe(CANONICAL_CUSTOMER_FEATURES);
    });

    test("splits those 83 into top-level features and sub-features", () => {
      const core = features.filter((f) => f.type === "feature");
      const sub = features.filter((f) => f.type === "subfeature");
      expect(core.length + sub.length).toBe(CANONICAL_CUSTOMER_FEATURES);
    });

    test("keeps admin/internal tooling out of the customer count", () => {
      const admin = features.filter((f) => f.type === "admin_internal");
      expect(admin.length).toBe(ADMIN_INTERNAL_FEATURES);
      // The distinction only means something if it is total: an admin tool that
      // is also marked customer-facing would inflate the canonical 83.
      expect(admin.every((f) => f.customerVisible === false)).toBe(true);
    });

    test("marks every feature and sub-feature customer-facing", () => {
      const productFeatures = features.filter((f) => f.type !== "admin_internal");
      expect(productFeatures.every((f) => f.customerVisible === true)).toBe(true);
    });
  });

  describe("catalogue integrity", () => {
    test("gives every entry the fields the catalogue is keyed on", () => {
      for (const f of features) {
        expect(f.id, `id on ${f.key}`).toBeTruthy();
        expect(f.key, `key on ${f.id}`).toBeTruthy();
        expect(f.nameEn, `nameEn on ${f.id}`).toBeTruthy();
        expect(f.nameAr, `nameAr on ${f.id}`).toBeTruthy();
        expect(f.category, `category on ${f.id}`).toBeTruthy();
        expect(f.capability, `capability on ${f.id}`).toBeTruthy();
        expect(Array.isArray(f.routes), `routes on ${f.id}`).toBe(true);
        expect(Array.isArray(f.apiFamilies), `apiFamilies on ${f.id}`).toBe(true);
        expect(typeof f.customerVisible, `customerVisible on ${f.id}`).toBe("boolean");
      }
    });

    test("keeps ids unique", () => {
      const ids = features.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("keeps keys unique", () => {
      const keys = features.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    test("uses only the three known entry types", () => {
      const valid = ["feature", "subfeature", "admin_internal"];
      for (const f of features) expect(valid, f.id).toContain(f.type);
    });

    test("uses only real plan tiers", () => {
      // The k_ prefix is the plan-code namespace shared with the entitlements
      // engine; bare "start"/"pro" names are the pre-namespacing spelling and
      // would silently miss every entitlement lookup.
      const valid = ["k_start", "k_growth", "k_pro", "k_enterprise", "k_admin"];
      for (const f of features) expect(valid, f.id).toContain(f.requiredPlan);
    });

    test("reserves the admin plan tier for admin tooling", () => {
      for (const f of features) {
        if (f.requiredPlan === "k_admin") expect(f.type, f.id).toBe("admin_internal");
      }
    });
  });

  describe("White Label — the one held-back feature", () => {
    test("is a customer feature in the registry, gated to enterprise", () => {
      const wl = features.find((f) => f.key === "white_label");
      expect(wl).toBeDefined();
      expect(wl!.type).toBe("feature");
      expect(wl!.customerVisible).toBe(true);
      expect(wl!.requiredPlan).toBe("k_enterprise");
    });

    test("has a separate admin-side configuration entry", () => {
      const admin = features.find((f) => f.key === "white_label_admin");
      expect(admin).toBeDefined();
      expect(admin!.type).toBe("admin_internal");
      expect(admin!.customerVisible).toBe(false);
    });
  });
});
