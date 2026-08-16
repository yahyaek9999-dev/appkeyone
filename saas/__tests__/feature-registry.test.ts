/**
 * Feature Registry + Release Gating — Unit Tests
 *
 * These tests exist to prove the control plane is WIRED, not decorative.
 * The three failure modes they lock down are the ones that actually shipped:
 *
 *   1. Registry empty in production  → every gate silently passes.
 *   2. featureId ≠ capability key    → admin kill switch is a no-op, because
 *                                      getEntitlements() kills capabilities[featureId].
 *   3. Release state ignored         → "archived" train stays live.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── In-memory stores ─────────────────────────────────────────────────────────

const featureDB: Map<string, any> = new Map();
const releaseDB: Map<string, any> = new Map();

vi.mock("@/lib/db", () => ({
  prisma: {
    featureControl: {
      findMany: vi.fn(() => Promise.resolve(Array.from(featureDB.values()))),
    },
    featureRelease: {
      findMany: vi.fn(() => Promise.resolve(Array.from(releaseDB.values()))),
    },
  },
}));

import { isFeatureEnabled, featureBlockedBy, invalidateFeatureCache } from "@/lib/feature-control";
import { CAPABILITIES } from "@/lib/pricing/catalog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addFeature(featureId: string, o: Partial<{
  status: string; killSwitch: boolean; dependencies: string[]; releaseId: string | null;
}> = {}) {
  featureDB.set(featureId, {
    featureId,
    name: featureId,
    description: "",
    category: "core",
    workspace: "conversations",
    status: o.status ?? "enabled",
    customerVisible: true,
    adminOnly: false,
    beta: false,
    requiredPlan: null,
    dependencies: JSON.stringify(o.dependencies ?? []),
    requiredIntegration: null,
    mobileVisible: true,
    killSwitch: o.killSwitch ?? false,
    rolloutPct: 100,
    releaseId: o.releaseId === undefined ? null : o.releaseId,
  });
}

function addRelease(releaseId: string, status: string) {
  releaseDB.set(releaseId, { releaseId, status });
}

beforeEach(() => {
  featureDB.clear();
  releaseDB.clear();
  invalidateFeatureCache();
});

// ─── 1. Registry ↔ capability catalog contract ────────────────────────────────

describe("registry ↔ capability catalog", () => {
  it("capability catalog is non-empty (registry has something real to derive from)", () => {
    expect(CAPABILITIES.length).toBeGreaterThan(0);
  });

  it("every capability key is a usable featureId (non-empty, no whitespace)", () => {
    for (const cap of CAPABILITIES) {
      expect(cap.key).toBeTruthy();
      expect(cap.key).not.toMatch(/\s/);
    }
  });

  it("capability keys are unique — a duplicate would make one row unreachable", () => {
    const keys = CAPABILITIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every capability declares a tier index within the 4-tier model", () => {
    for (const cap of CAPABILITIES) {
      expect(cap.minTierIndex).toBeGreaterThanOrEqual(0);
      expect(cap.minTierIndex).toBeLessThanOrEqual(3);
    }
  });
});

// ─── 2. Kill switch actually disables ─────────────────────────────────────────

describe("admin kill switch", () => {
  it("enabled feature is available", async () => {
    addFeature("inbox");
    expect(await isFeatureEnabled("inbox")).toBe(true);
  });

  it("killSwitch=true disables the feature", async () => {
    addFeature("inbox", { killSwitch: true });
    expect(await isFeatureEnabled("inbox")).toBe(false);
  });

  it("status=disabled disables the feature", async () => {
    addFeature("inbox", { status: "disabled" });
    expect(await isFeatureEnabled("inbox")).toBe(false);
  });

  it("re-enabling restores availability", async () => {
    addFeature("inbox", { killSwitch: true });
    expect(await isFeatureEnabled("inbox")).toBe(false);
    invalidateFeatureCache();
    addFeature("inbox", { killSwitch: false });
    expect(await isFeatureEnabled("inbox")).toBe(true);
  });

  it("beta status stays available (shipped to a cohort, not withdrawn)", async () => {
    addFeature("bot_builder", { status: "beta" });
    expect(await isFeatureEnabled("bot_builder")).toBe(true);
  });
});

// ─── 3. Release gating ────────────────────────────────────────────────────────

describe("release train gating", () => {
  it("active release → feature available", async () => {
    addRelease("core", "active");
    addFeature("inbox", { releaseId: "core" });
    expect(await isFeatureEnabled("inbox")).toBe(true);
  });

  it("beta release → feature available", async () => {
    addRelease("commerce", "beta");
    addFeature("k1sms", { releaseId: "commerce" });
    expect(await isFeatureEnabled("k1sms")).toBe(true);
  });

  it("archived release → feature UNAVAILABLE even though the feature is enabled", async () => {
    addRelease("scale", "archived");
    addFeature("multi_whatsapp", { releaseId: "scale", status: "enabled" });
    expect(await isFeatureEnabled("multi_whatsapp")).toBe(false);
  });

  it("hidden release → feature unavailable", async () => {
    addRelease("scale", "hidden");
    addFeature("multi_whatsapp", { releaseId: "scale" });
    expect(await isFeatureEnabled("multi_whatsapp")).toBe(false);
  });

  it("draft release → feature unavailable", async () => {
    addRelease("future", "draft");
    addFeature("new_thing", { releaseId: "future" });
    expect(await isFeatureEnabled("new_thing")).toBe(false);
  });

  it("holding a train disables EVERY feature in it", async () => {
    addRelease("intelligence", "archived");
    addFeature("smart_assistant", { releaseId: "intelligence" });
    addFeature("advanced_analytics", { releaseId: "intelligence" });
    addFeature("inbox", { releaseId: "core" }); // different train, unaffected
    addRelease("core", "active");

    expect(await isFeatureEnabled("smart_assistant")).toBe(false);
    expect(await isFeatureEnabled("advanced_analytics")).toBe(false);
    expect(await isFeatureEnabled("inbox")).toBe(true);
  });

  it("unassigned release (null) is not gated", async () => {
    addFeature("orphan", { releaseId: null });
    expect(await isFeatureEnabled("orphan")).toBe(true);
  });

  it("unknown releaseId is not gated (fail-open, no accidental blackout)", async () => {
    addFeature("x", { releaseId: "does_not_exist" });
    expect(await isFeatureEnabled("x")).toBe(true);
  });

  it("featureBlockedBy names the release when the train is the blocker", async () => {
    addRelease("scale", "archived");
    addFeature("multi_whatsapp", { releaseId: "scale" });
    expect(await featureBlockedBy("multi_whatsapp")).toBe("release:scale");
  });
});

// ─── 4. Dependency chain interacts correctly with releases ────────────────────

describe("dependencies × releases", () => {
  it("dependency in an archived train blocks the dependent feature", async () => {
    addRelease("core", "archived");
    addRelease("scale", "active");
    addFeature("inbox", { releaseId: "core" });
    addFeature("support_inbox", { releaseId: "scale", dependencies: ["inbox"] });

    expect(await isFeatureEnabled("support_inbox")).toBe(false);
  });

  it("dependent feature recovers when the parent train is reactivated", async () => {
    addRelease("core", "archived");
    addRelease("scale", "active");
    addFeature("inbox", { releaseId: "core" });
    addFeature("support_inbox", { releaseId: "scale", dependencies: ["inbox"] });
    expect(await isFeatureEnabled("support_inbox")).toBe(false);

    invalidateFeatureCache();
    addRelease("core", "active");
    expect(await isFeatureEnabled("support_inbox")).toBe(true);
  });

  it("killed dependency blocks the dependent even with both trains active", async () => {
    addRelease("core", "active");
    addFeature("inbox", { releaseId: "core", killSwitch: true });
    addFeature("support_inbox", { releaseId: "core", dependencies: ["inbox"] });

    expect(await isFeatureEnabled("support_inbox")).toBe(false);
    expect(await featureBlockedBy("support_inbox")).toBe("inbox");
  });
});
