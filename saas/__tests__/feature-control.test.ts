/**
 * Feature Control — Unit Tests
 *
 * Tests dependency chain, cycle guard, killSwitch, and visibility rules.
 * Prisma is mocked with in-memory store to isolate pure logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── In-memory feature store ──────────────────────────────────────────────────

const featureDB: Map<string, any> = new Map();

vi.mock("@/lib/db", () => ({
  prisma: {
    featureControl: {
      findMany: vi.fn(() => Promise.resolve(Array.from(featureDB.values()))),
    },
  },
}));

// ─── Import after mock ────────────────────────────────────────────────────────

import {
  isFeatureEnabled,
  featureBlockedBy,
  isFeatureVisible,
  invalidateFeatureCache,
} from "@/lib/feature-control";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addFeature(featureId: string, overrides: Partial<{
  status: string;
  killSwitch: boolean;
  customerVisible: boolean;
  adminOnly: boolean;
  dependencies: string[];
}> = {}) {
  featureDB.set(featureId, {
    featureId,
    name: featureId,
    description: "",
    category: "core",
    workspace: "all",
    status: "enabled",
    customerVisible: true,
    adminOnly: false,
    beta: false,
    requiredPlan: null,
    dependencies: JSON.stringify(overrides.dependencies || []),
    requiredIntegration: null,
    mobileVisible: true,
    killSwitch: false,
    rolloutPct: 100,
    releaseId: null,
    ...overrides,
    // Serialize dependencies back for mock
    ...(overrides.dependencies !== undefined
      ? { dependencies: JSON.stringify(overrides.dependencies) }
      : {}),
  });
  invalidateFeatureCache();
}

function clearFeatures() {
  featureDB.clear();
  invalidateFeatureCache();
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("Feature Control — isFeatureEnabled", () => {
  beforeEach(clearFeatures);

  it("F1. unknown feature: returns true (assume enabled)", async () => {
    const result = await isFeatureEnabled("unknown-feature-xyz");
    expect(result).toBe(true);
  });

  it("F2. enabled feature with no deps: returns true", async () => {
    addFeature("inbox");
    expect(await isFeatureEnabled("inbox")).toBe(true);
  });

  it("F3. killSwitch=true: returns false immediately", async () => {
    addFeature("inbox", { killSwitch: true });
    expect(await isFeatureEnabled("inbox")).toBe(false);
  });

  it("F4. status=disabled: returns false", async () => {
    addFeature("inbox", { status: "disabled" });
    expect(await isFeatureEnabled("inbox")).toBe(false);
  });

  it("F5. status=hidden: returns false", async () => {
    addFeature("inbox", { status: "hidden" });
    expect(await isFeatureEnabled("inbox")).toBe(false);
  });

  it("F6. status=deprecated: returns false", async () => {
    addFeature("reports", { status: "deprecated" });
    expect(await isFeatureEnabled("reports")).toBe(false);
  });

  it("F7. dependency chain: A enabled, B depends on A → B enabled", async () => {
    addFeature("whatsapp");
    addFeature("inbox", { dependencies: ["whatsapp"] });
    expect(await isFeatureEnabled("inbox")).toBe(true);
  });

  it("F8. dependency chain: A disabled, B depends on A → B disabled", async () => {
    addFeature("whatsapp", { status: "disabled" });
    addFeature("inbox", { dependencies: ["whatsapp"] });
    expect(await isFeatureEnabled("inbox")).toBe(false);
  });

  it("F9. deep dependency chain: C→B→A, A killed → C disabled", async () => {
    addFeature("whatsapp", { killSwitch: true });
    addFeature("inbox", { dependencies: ["whatsapp"] });
    addFeature("broadcast", { dependencies: ["inbox"] });
    expect(await isFeatureEnabled("broadcast")).toBe(false);
  });

  it("F10. circular dependency (A→B→A): cycle guard returns true (does not hang)", async () => {
    addFeature("feat-a", { dependencies: ["feat-b"] });
    addFeature("feat-b", { dependencies: ["feat-a"] });
    // Should not infinite-loop — cycle guard breaks it
    const result = await isFeatureEnabled("feat-a");
    expect(typeof result).toBe("boolean"); // Just needs to return without hanging
  });

  it("F11. max depth 20: deeply nested chain terminates", async () => {
    // Create 25-deep chain
    for (let i = 0; i < 25; i++) {
      addFeature(`dep-${i}`, {
        dependencies: i > 0 ? [`dep-${i - 1}`] : [],
      });
    }
    const result = await isFeatureEnabled("dep-24");
    expect(typeof result).toBe("boolean");
  });

  it("F12. multiple deps: all must be enabled", async () => {
    addFeature("sms");
    addFeature("credits");
    addFeature("sms-otp", { dependencies: ["sms", "credits"] });
    expect(await isFeatureEnabled("sms-otp")).toBe(true);
  });

  it("F13. multiple deps: one disabled → feature disabled", async () => {
    addFeature("sms");
    addFeature("credits", { status: "disabled" });
    addFeature("sms-otp", { dependencies: ["sms", "credits"] });
    expect(await isFeatureEnabled("sms-otp")).toBe(false);
  });
});

describe("Feature Control — featureBlockedBy", () => {
  beforeEach(clearFeatures);

  it("FB1. fully enabled: returns null", async () => {
    addFeature("inbox");
    expect(await featureBlockedBy("inbox")).toBeNull();
  });

  it("FB2. killSwitch on self: returns self", async () => {
    addFeature("inbox", { killSwitch: true });
    expect(await featureBlockedBy("inbox")).toBe("inbox");
  });

  it("FB3. blocked by dependency: returns dependency id", async () => {
    addFeature("whatsapp", { status: "disabled" });
    addFeature("inbox", { dependencies: ["whatsapp"] });
    expect(await featureBlockedBy("inbox")).toBe("whatsapp");
  });

  it("FB4. deep chain blocked: returns the root blocking feature", async () => {
    addFeature("base", { killSwitch: true });
    addFeature("mid", { dependencies: ["base"] });
    addFeature("top", { dependencies: ["mid"] });
    // Should return "base" (first blocked in chain)
    const blocker = await featureBlockedBy("top");
    expect(blocker).toBe("base");
  });
});

describe("Feature Control — isFeatureVisible", () => {
  beforeEach(clearFeatures);

  it("FV1. unknown feature: visible by default", async () => {
    expect(await isFeatureVisible("unknown")).toBe(true);
  });

  it("FV2. killSwitch=true: not visible", async () => {
    addFeature("inbox", { killSwitch: true });
    expect(await isFeatureVisible("inbox")).toBe(false);
  });

  it("FV3. customerVisible=false: not visible to customers", async () => {
    addFeature("admin-panel", { customerVisible: false });
    expect(await isFeatureVisible("admin-panel")).toBe(false);
  });

  it("FV4. adminOnly=true: not visible to customers", async () => {
    addFeature("analytics", { adminOnly: true });
    expect(await isFeatureVisible("analytics")).toBe(false);
  });

  it("FV5. status=disabled: not visible", async () => {
    addFeature("reports", { status: "disabled" });
    expect(await isFeatureVisible("reports")).toBe(false);
  });

  it("FV6. fully visible feature: returns true", async () => {
    addFeature("inbox");
    expect(await isFeatureVisible("inbox")).toBe(true);
  });
});

describe("Feature Control — Admin enable/disable cycle", () => {
  beforeEach(clearFeatures);

  it("FA1. admin disable → feature off → admin re-enable → feature on", async () => {
    addFeature("promotions");
    expect(await isFeatureEnabled("promotions")).toBe(true);

    // Admin disables
    featureDB.set("promotions", { ...featureDB.get("promotions"), status: "disabled" });
    invalidateFeatureCache();
    expect(await isFeatureEnabled("promotions")).toBe(false);

    // Admin re-enables
    featureDB.set("promotions", { ...featureDB.get("promotions"), status: "enabled" });
    invalidateFeatureCache();
    expect(await isFeatureEnabled("promotions")).toBe(true);
  });

  it("FA2. killSwitch toggle: overrides status=enabled", async () => {
    addFeature("broadcast");
    expect(await isFeatureEnabled("broadcast")).toBe(true);

    // Admin hits kill switch
    featureDB.set("broadcast", { ...featureDB.get("broadcast"), killSwitch: true });
    invalidateFeatureCache();
    expect(await isFeatureEnabled("broadcast")).toBe(false);

    // Admin removes kill switch
    featureDB.set("broadcast", { ...featureDB.get("broadcast"), killSwitch: false });
    invalidateFeatureCache();
    expect(await isFeatureEnabled("broadcast")).toBe(true);
  });
});
