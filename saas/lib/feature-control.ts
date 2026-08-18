// Feature Control — DB-backed feature flag system
// Admin can enable/disable/hide/beta any feature independently of env vars.
// Customer navigation + API routes check feature visibility before rendering.
//
// Rule: killSwitch=true → always disabled for customers (admin still sees it).
// Rule: !customerVisible → hidden from nav but route still accessible to admin.
// Rule: beta=true → shown only to allowed users (future: beta list).

import { prisma } from "@/lib/db";
import { CAPABILITIES, PUBLIC_TIERS } from "@/lib/pricing/catalog";

export interface FeatureControlRow {
  featureId: string;
  name: string;
  description: string;
  category: string;
  workspace: string;
  status: string;
  customerVisible: boolean;
  adminOnly: boolean;
  beta: boolean;
  requiredPlan: string | null;
  dependencies: string[];
  requiredIntegration: string | null;
  mobileVisible: boolean;
  killSwitch: boolean;
  rolloutPct: number;
  releaseId: string | null;
  // Classification
  featureSource: string;   // "registry" | "legacy_db"
  featureType: string;     // "feature" | "subfeature" | "admin_internal" | "legacy_unmapped" | "legacy_mapped"
  adminVisible: boolean;
}

let cache: Map<string, FeatureControlRow> | null = null;
let cacheAt = 0;
const CACHE_TTL = 30_000; // 30s

/**
 * Guards the empty-table auto-seed so a cold start with an empty registry
 * doesn't fire one seed per concurrent request. Reset only by process restart —
 * a failed seed retries on the next boot rather than hammering the DB.
 */
let autoSeedAttempted = false;

async function loadAll(): Promise<Map<string, FeatureControlRow>> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  let rows = await (prisma as any).featureControl.findMany({ orderBy: { featureId: "asc" } });

  // Self-heal: an empty registry means every feature gate silently passes and
  // the admin UI shows "0 features". Seed it from the capability catalog on
  // first sight rather than shipping a dead control plane.
  if (rows.length === 0 && !autoSeedAttempted) {
    autoSeedAttempted = true;
    try {
      await seedFeatureRegistry();
      rows = await (prisma as any).featureControl.findMany({ orderBy: { featureId: "asc" } });
    } catch {
      // Leave rows empty — isFeatureEnabled() fails open, so the product keeps
      // working; the next boot retries the seed.
    }
  }
  const m = new Map<string, FeatureControlRow>();
  for (const r of rows) {
    let deps: string[] = [];
    try { deps = JSON.parse(r.dependencies || "[]"); } catch {}
    m.set(r.featureId, {
      ...r,
      dependencies: deps,
      featureSource: r.featureSource ?? "legacy_db",
      featureType: r.featureType ?? "feature",
      adminVisible: r.adminVisible ?? true,
    });
  }
  cache = m;
  cacheAt = now;
  return m;
}

export function invalidateFeatureCache() {
  cache = null;
  cacheAt = 0;
  releaseCache = null;
  releaseCacheAt = 0;
}

// ── Release gating ───────────────────────────────────────────────────────────
// A feature ships inside a release train. The release's lifecycle state gates
// availability independently of the feature's own status, so Admin can hold or
// pull an entire train without touching each feature.
//
//   active   → features available
//   beta     → features available (beta cohort; rollout % still applies)
//   draft    → not yet shipped        → unavailable
//   hidden   → held back              → unavailable
//   archived → withdrawn              → unavailable

let releaseCache: Map<string, string> | null = null;   // releaseId → status
let releaseCacheAt = 0;

const RELEASE_STATES_AVAILABLE = new Set(["active", "beta"]);

async function loadReleaseStates(): Promise<Map<string, string>> {
  const now = Date.now();
  if (releaseCache && now - releaseCacheAt < CACHE_TTL) return releaseCache;

  const m = new Map<string, string>();
  try {
    const rows = await (prisma as any).featureRelease.findMany({
      select: { releaseId: true, status: true },
    });
    for (const r of rows) m.set(r.releaseId, r.status);
  } catch {
    // Fail-open: an unreadable release table must not black out the product.
  }
  releaseCache = m;
  releaseCacheAt = now;
  return m;
}

/** True when the feature's release train is in a customer-available state. */
async function releaseAllows(releaseId: string | null): Promise<boolean> {
  if (!releaseId) return true;                    // unassigned → not gated
  const states = await loadReleaseStates();
  const status = states.get(releaseId);
  if (!status) return true;                       // unknown release → not gated
  return RELEASE_STATES_AVAILABLE.has(status);
}

/**
 * Check if a feature is enabled for customer display.
 * Recursively resolves the dependency chain — if any dependency is disabled
 * (killSwitch, status≠enabled), this feature is also disabled.
 *
 * Cycles are broken by the visited set; max depth 20.
 */
export async function isFeatureEnabled(
  featureId: string,
  visited: Set<string> = new Set(),
  userId?: string,
): Promise<boolean> {
  // Admin users always have full feature access.
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role === "admin") return true;
    } catch {
      // Fail open on DB error
    }
  }

  if (visited.has(featureId) || visited.size > 20) return true; // cycle guard
  visited.add(featureId);

  const all = await loadAll();
  const f = all.get(featureId);
  if (!f) return true; // unknown feature → assume enabled
  if (f.killSwitch) return false;
  if (f.status !== "enabled" && f.status !== "beta") return false;

  // Release train gating — a held/withdrawn train disables everything in it.
  if (!(await releaseAllows(f.releaseId))) return false;

  // Recursively check all declared dependencies
  for (const dep of f.dependencies) {
    if (!(await isFeatureEnabled(dep, visited, userId))) return false;
  }
  return true;
}

/**
 * Returns the first blocked dependency in the chain, or null if the feature
 * is fully enabled. Used by "Why is this off?" diagnostics.
 */
export async function featureBlockedBy(
  featureId: string,
  visited: Set<string> = new Set(),
): Promise<string | null> {
  if (visited.has(featureId) || visited.size > 20) return null;
  visited.add(featureId);

  const all = await loadAll();
  const f = all.get(featureId);
  if (!f) return null;
  if (f.killSwitch || (f.status !== "enabled" && f.status !== "beta")) return featureId;
  if (!(await releaseAllows(f.releaseId))) return `release:${f.releaseId}`;

  for (const dep of f.dependencies) {
    const blocked = await featureBlockedBy(dep, visited);
    if (blocked) return blocked;
  }
  return null;
}

/** Check if a feature is visible to customers in navigation. */
export async function isFeatureVisible(featureId: string): Promise<boolean> {
  const all = await loadAll();
  const f = all.get(featureId);
  if (!f) return true;
  if (f.killSwitch) return false;
  if (!f.customerVisible) return false;
  if (f.adminOnly) return false;
  if (f.status === "disabled" || f.status === "hidden" || f.status === "deprecated") return false;
  return true;
}

/** Get all features for admin display (all statuses). */
export async function getAllFeatures(): Promise<FeatureControlRow[]> {
  const all = await loadAll();
  return Array.from(all.values());
}

/**
 * The set of featureIds that are NOT available right now, for ANY reason —
 * kill switch, status, or a held/withdrawn release train.
 *
 * This is what the entitlement engine consumes. Checking killSwitch alone (as
 * an earlier revision did) meant archiving a release had no effect on plan
 * capabilities; routing every reason through one helper keeps the entitlement
 * layer and the isFeatureEnabled() call sites in agreement.
 */
export async function getDisabledFeatureIds(): Promise<Set<string>> {
  const disabled = new Set<string>();
  try {
    const all = await loadAll();
    const releaseStates = await loadReleaseStates();

    for (const f of all.values()) {
      if (f.killSwitch) { disabled.add(f.featureId); continue; }
      if (f.status !== "enabled" && f.status !== "beta") { disabled.add(f.featureId); continue; }
      if (f.releaseId) {
        const st = releaseStates.get(f.releaseId);
        if (st && !RELEASE_STATES_AVAILABLE.has(st)) disabled.add(f.featureId);
      }
    }

    // Propagate: a feature whose dependency is disabled is itself disabled.
    // Bounded relaxation — the dependency graph is shallow and the cycle guard
    // in isFeatureEnabled() already rejects loops.
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (const f of all.values()) {
        if (disabled.has(f.featureId)) continue;
        if (f.dependencies.some((d) => disabled.has(d))) {
          disabled.add(f.featureId);
          changed = true;
        }
      }
      if (!changed) break;
    }
  } catch {
    // Fail-open: return whatever we resolved rather than blacking out features.
  }
  return disabled;
}

/** Upsert a feature control record (admin action). */
export async function upsertFeature(
  featureId: string,
  data: Partial<Omit<FeatureControlRow, "featureId">>,
  changedBy?: string,
): Promise<FeatureControlRow> {
  const deps = data.dependencies ? JSON.stringify(data.dependencies) : undefined;
  const row = await (prisma as any).featureControl.upsert({
    where: { featureId },
    create: {
      featureId,
      name: data.name ?? featureId,
      description: data.description ?? "",
      category: data.category ?? "general",
      workspace: data.workspace ?? "ops",
      status: data.status ?? "enabled",
      customerVisible: data.customerVisible ?? true,
      adminOnly: data.adminOnly ?? false,
      beta: data.beta ?? false,
      requiredPlan: data.requiredPlan ?? null,
      dependencies: deps ?? "[]",
      requiredIntegration: data.requiredIntegration ?? null,
      mobileVisible: data.mobileVisible ?? true,
      killSwitch: data.killSwitch ?? false,
      rolloutPct: data.rolloutPct ?? 100,
      releaseId: data.releaseId ?? null,
      changedBy: changedBy ?? null,
    },
    update: {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status && { status: data.status }),
      ...(data.customerVisible !== undefined && { customerVisible: data.customerVisible }),
      ...(data.adminOnly !== undefined && { adminOnly: data.adminOnly }),
      ...(data.beta !== undefined && { beta: data.beta }),
      ...(data.killSwitch !== undefined && { killSwitch: data.killSwitch }),
      ...(data.rolloutPct !== undefined && { rolloutPct: data.rolloutPct }),
      ...(data.requiredPlan !== undefined && { requiredPlan: data.requiredPlan }),
      ...(data.releaseId !== undefined && { releaseId: data.releaseId }),
      ...(deps && { dependencies: deps }),
      changedBy: changedBy ?? null,
    },
  });

  invalidateFeatureCache();
  let parsedDeps: string[] = [];
  try { parsedDeps = JSON.parse(row.dependencies || "[]"); } catch {}
  return { ...row, dependencies: parsedDeps };
}

// ── Canonical feature registry ───────────────────────────────────────────────
//
// The registry is DERIVED from the pricing capability catalog, not hand-written.
// That guarantees three things that a hand-maintained list cannot:
//
//   1. featureId === capability key. getEntitlements() Step 5 kills
//      `capabilities[featureId]`, so if these ever drift the admin kill switch
//      silently becomes a no-op. Deriving them makes drift impossible.
//   2. No invented features. Every row corresponds to a capability a customer
//      can actually buy.
//   3. requiredPlan stays in lock-step with the pricing matrix.

/** Capability category → the customer nav workspace that surfaces it. */
const WORKSPACE_BY_CATEGORY: Record<string, string> = {
  core:         "conversations",
  automation:   "automation",
  team:         "settings",
  intelligence: "analytics",
  analytics:    "analytics",
  commerce:     "sales",
  messaging:    "marketing",
  scale:        "settings",
  operations:   "settings",
  enterprise:   "settings",
};

/** Per-capability workspace override (takes precedence over category default). */
const WORKSPACE_BY_KEY: Record<string, string> = {
  bot_configuration:    "conversations",
  compliance_monitoring: "settings",
  meta_cloud:           "settings",
  monitoring_center:    "analytics",
  broadcast_credits:    "marketing",
  safety_controls:      "settings",
  revenue_pro:          "analytics",
  whatsapp_health:      "conversations",
  ai_operations:        "analytics",
  system_health:        "settings",
};

/** Capability category → the release train it shipped in. */
const RELEASE_BY_CATEGORY: Record<string, string> = {
  core:         "core",
  automation:   "automation",
  team:         "scale",
  intelligence: "intelligence",
  analytics:    "intelligence",
  commerce:     "commerce",
  messaging:    "commerce",
  scale:        "scale",
  operations:   "core",
  enterprise:   "scale",
};

/** Per-capability release override. */
const RELEASE_BY_KEY: Record<string, string> = {
  bot_configuration:    "core",
  compliance_monitoring: "core",
  meta_cloud:           "automation",
  monitoring_center:    "automation",
  broadcast_credits:    "commerce",
  safety_controls:      "intelligence",
  revenue_pro:          "intelligence",
  whatsapp_health:      "core",
  ai_operations:        "intelligence",
  system_health:        "core",
};

/**
 * Real dependency edges. Only genuine runtime dependencies are listed — a
 * feature appears here ONLY if disabling the parent actually breaks it.
 */
const REAL_DEPENDENCIES: Record<string, string[]> = {
  human_handoff:          ["flow_builder"],
  team_routing:           ["team"],
  support_inbox:          ["inbox"],
  shipping_tracking:      ["order_management"],
  smart_campaign_builder: ["broadcasts"],
  recovery:               ["broadcasts"],
  revenue_copilot:        ["smart_assistant"],
  next_best_action:       ["smart_assistant"],
  revenue_attribution:    ["advanced_analytics"],
  forecasting:            ["advanced_analytics"],
  funnel_analytics:       ["advanced_analytics"],
  business_performance:   ["basic_analytics"],
  customer_segmentation:  ["segments"],
  multi_team:             ["team"],
  approval_workflows:     ["team"],
  sms_messaging:          ["k1sms"],
  qr_broadcast_queue:     ["broadcasts"],
  coupons_discounts:      ["order_management"],
  escalations:            ["inbox"],
  audit_log:              ["team"],
  broadcast_credits:      ["broadcasts"],
  monitoring_center:      ["basic_analytics"],
  revenue_pro:            ["advanced_analytics"],
  safety_controls:        ["inbox"],
  compliance_monitoring:  ["inbox"],
  meta_cloud:             ["whatsapp_connection"],
  whatsapp_health:        ["whatsapp_connection"],
  ai_operations:          ["bot_configuration"],
};

/** Integrations a feature genuinely cannot run without. */
const REQUIRED_INTEGRATION: Record<string, string> = {
  k1sms:             "sms_provider",
  sms_messaging:     "sms_provider",
  shipping_tracking: "shipping_provider",
};

/** The baseline release trains, seeded alongside the registry. */
const RELEASE_TRAINS: Array<{ releaseId: string; name: string; description: string; status: string; sortOrder: number }> = [
  { releaseId: "core",         name: "الإصدار الأساسي",        description: "التواصل الأساسي: صندوق الوارد، الردود التلقائية، إدارة العملاء والطلبات.", status: "active", sortOrder: 1 },
  { releaseId: "automation",   name: "إصدار الأتمتة",          description: "الحملات، الاستعادة، الشرائح، منشئ المحادثات، ساعات العمل.",              status: "active", sortOrder: 2 },
  { releaseId: "intelligence", name: "إصدار الذكاء والتحليلات", description: "المساعد الذكي، قاعدة المعرفة، التحليلات المتقدّمة، إسناد الإيرادات.",      status: "active", sortOrder: 3 },
  { releaseId: "commerce",     name: "إصدار التجارة",          description: "K1SMS، الشحن والتتبّع، الولاء والمكافآت.",                                status: "active", sortOrder: 4 },
  { releaseId: "scale",        name: "إصدار التوسّع",           description: "الأرقام المتعدّدة، الفروع، الفرق، الموافقات، التكاملات المخصّصة.",          status: "active", sortOrder: 5 },
];

/**
 * Seed / reconcile the canonical feature registry from the capability catalog.
 *
 * Idempotent and NON-DESTRUCTIVE: `create` populates a missing row, `update`
 * only refreshes descriptive fields (name/category/plan/deps). It NEVER
 * overwrites the admin-controlled columns — status, killSwitch, customerVisible,
 * rolloutPct — so re-running this can't silently re-enable something an admin
 * turned off.
 *
 * Returns counts so the caller can report what actually happened.
 */
export async function seedFeatureRegistry(): Promise<{ features: number; releases: number }> {
  // 1. Release trains first (features reference releaseId).
  for (const r of RELEASE_TRAINS) {
    await (prisma as any).featureRelease.upsert({
      where:  { releaseId: r.releaseId },
      create: r,
      update: { name: r.name, description: r.description, sortOrder: r.sortOrder },
    });
  }

  // 2. One registry row per real, purchasable capability.
  const tierSlugByIndex = PUBLIC_TIERS.map((t: any) => t.slug);

  for (const cap of CAPABILITIES) {
    const requiredPlan = cap.minTierIndex > 0 ? tierSlugByIndex[cap.minTierIndex] ?? null : null;
    const deps = REAL_DEPENDENCIES[cap.key] ?? [];
    const workspace = WORKSPACE_BY_KEY[cap.key] ?? WORKSPACE_BY_CATEGORY[cap.category] ?? "settings";
    const releaseId = RELEASE_BY_KEY[cap.key] ?? RELEASE_BY_CATEGORY[cap.category] ?? "core";

    await (prisma as any).featureControl.upsert({
      where: { featureId: cap.key },
      create: {
        featureId:           cap.key,
        name:                cap.label.ar,
        description:         cap.label.en,
        category:            cap.category,
        workspace,
        // comingSoon capabilities ship hidden — visible to admin, not to customers.
        status:              cap.comingSoon ? "hidden" : "enabled",
        customerVisible:     !cap.comingSoon,
        adminOnly:           false,
        beta:                Boolean(cap.comingSoon),
        requiredPlan,
        dependencies:        JSON.stringify(deps),
        requiredIntegration: REQUIRED_INTEGRATION[cap.key] ?? null,
        mobileVisible:       true,
        killSwitch:          false,
        rolloutPct:          100,
        releaseId,
      },
      update: {
        // Descriptive + plan metadata is re-derived from the catalog…
        name:                cap.label.ar,
        description:         cap.label.en,
        category:            cap.category,
        workspace,
        requiredPlan,
        dependencies:        JSON.stringify(deps),
        requiredIntegration: REQUIRED_INTEGRATION[cap.key] ?? null,
        releaseId,
        // …but status / killSwitch / customerVisible / rolloutPct are the
        // admin's to own. Never reset them here.
      },
    });
  }

  invalidateFeatureCache();
  return { features: CAPABILITIES.length, releases: RELEASE_TRAINS.length };
}

/** @deprecated Superseded by seedFeatureRegistry(); kept for the older admin call-site. */
export async function seedDefaultFeatureControls(): Promise<void> {
  const defaults: Array<Record<string, any>> = [
    // ─── Messaging ────────────────────────────────────────────────────────────
    { featureId: "k1sms", name: "K1SMS — رسائل SMS", description: "بنية تحتية رسائل SMS للطلبات والتحقق والتنبيهات", category: "messaging", workspace: "ops", status: "enabled", customerVisible: true, adminOnly: false, beta: true, requiredPlan: null, dependencies: [], requiredIntegration: "sms_provider", mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "commerce" },
    { featureId: "k1sms_otp", name: "OTP — رمز التحقق", description: "رموز التحقق المؤقتة عبر SMS", category: "messaging", workspace: "settings", status: "enabled", customerVisible: false, adminOnly: true, beta: true, requiredPlan: null, dependencies: ["k1sms"], requiredIntegration: "sms_provider", mobileVisible: false, killSwitch: false, rolloutPct: 100, releaseId: "commerce" },
    { featureId: "k1sms_order_confirmation", name: "تأكيد الطلب SMS", description: "إرسال SMS عند إنشاء طلب جديد", category: "messaging", workspace: "ops", status: "enabled", customerVisible: true, adminOnly: false, beta: true, requiredPlan: null, dependencies: ["k1sms"], requiredIntegration: "sms_provider", mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "commerce" },
    { featureId: "k1sms_order_status", name: "حالة الطلب SMS", description: "إشعارات SMS عند تغيير حالة الطلب", category: "messaging", workspace: "ops", status: "enabled", customerVisible: true, adminOnly: false, beta: true, requiredPlan: null, dependencies: ["k1sms"], requiredIntegration: "sms_provider", mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "commerce" },

    // ─── Commerce ─────────────────────────────────────────────────────────────
    { featureId: "shipping_tracking", name: "الشحن والتتبع", description: "إدارة الشحنات وتتبعها مع إشعارات للعملاء", category: "commerce", workspace: "sales", status: "enabled", customerVisible: true, adminOnly: false, beta: false, requiredPlan: null, dependencies: ["orders"], requiredIntegration: null, mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "commerce" },
    { featureId: "meta_cost_control", name: "إدارة تكاليف Meta", description: "تتبع وإدارة تكاليف رسائل Meta Cloud", category: "commerce", workspace: "ops", status: "enabled", customerVisible: true, adminOnly: false, beta: false, requiredPlan: null, dependencies: [], requiredIntegration: null, mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "intelligence" },

    // ─── Support / Bot ────────────────────────────────────────────────────────
    { featureId: "bot_builder", name: "منشئ المحادثات", description: "مُنشئ تدفقات المحادثة المرئي مع عقد وتحويل للإنسان", category: "support", workspace: "ai", status: "enabled", customerVisible: true, adminOnly: false, beta: true, requiredPlan: "k_growth", dependencies: [], requiredIntegration: null, mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "automation" },
    { featureId: "human_handoff", name: "التحويل للإنسان", description: "تحويل المحادثات من البوت إلى موظف بشري", category: "support", workspace: "ops", status: "enabled", customerVisible: true, adminOnly: false, beta: false, requiredPlan: null, dependencies: ["bot_builder"], requiredIntegration: null, mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "automation" },
    { featureId: "team_routing", name: "توجيه الفرق", description: "توجيه تلقائي للمحادثات بين أعضاء الفريق والأقسام", category: "support", workspace: "ops", status: "enabled", customerVisible: true, adminOnly: false, beta: false, requiredPlan: "k_pro", dependencies: [], requiredIntegration: null, mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "scale" },
    { featureId: "support_inbox", name: "صندوق الدعم المتقدم", description: "صفوف انتظار المحادثات ومؤشرات SLA وإدارة الحالات", category: "support", workspace: "customers", status: "enabled", customerVisible: true, adminOnly: false, beta: false, requiredPlan: null, dependencies: [], requiredIntegration: null, mobileVisible: true, killSwitch: false, rolloutPct: 100, releaseId: "core" },

    // ─── AI / Intelligence ────────────────────────────────────────────────────
    { featureId: "flow_builder_legacy", name: "منشئ المسارات (القديم)", description: "نظام الأتمتة المرئي القديم — استبداله بـ bot_builder", category: "ai", workspace: "ops", status: "hidden", customerVisible: false, adminOnly: true, beta: false, requiredPlan: null, dependencies: [], requiredIntegration: null, mobileVisible: false, killSwitch: false, rolloutPct: 0, releaseId: null },
    { featureId: "agents", name: "نظام الوكلاء", description: "وكلاء AI متعددون بذاكرة مشتركة", category: "ai", workspace: "ai", status: "beta", customerVisible: false, adminOnly: true, beta: true, requiredPlan: "k_pro", dependencies: [], requiredIntegration: null, mobileVisible: false, killSwitch: false, rolloutPct: 100, releaseId: "intelligence" },
    { featureId: "white_label", name: "الواجهة البيضاء", description: "تخصيص الماركة والألوان للموزعين", category: "settings", workspace: "settings", status: "hidden", customerVisible: false, adminOnly: true, beta: true, requiredPlan: "k_enterprise", dependencies: [], requiredIntegration: null, mobileVisible: false, killSwitch: false, rolloutPct: 0, releaseId: "scale" },
  ];

  for (const f of defaults) {
    const { featureId, ...rest } = f;
    await (prisma as any).featureControl.upsert({
      where: { featureId },
      create: { featureId, ...rest, dependencies: JSON.stringify(rest.dependencies) },
      update: {}, // don't overwrite admin changes
    });
  }

  invalidateFeatureCache();
}

// ── Registry-driven sync ─────────────────────────────────────────────────────
//
// Syncs the master-feature-registry.json to FeatureControl DB rows.
// SAFE: only inserts missing rows — never touches admin-controlled columns
// (status, killSwitch, customerVisible, rolloutPct) on existing rows.

export interface RegistryEntry {
  key: string;
  nameEn: string;
  nameAr: string;
  type: string;
  category: string;
  capability?: string;
  customerVisible?: boolean;
  requiredPlan?: string | null;
}

// ── Legacy key → canonical feature mapping ──────────────────────────────────
// Legacy rows whose featureId is a capability-level key (from old seeding) that
// maps to a canonical registry feature under a different key. Keeps both rows
// alive; just classifies the legacy one as "legacy_mapped".
const LEGACY_MAPPED_KEYS = new Set([
  'advanced_analytics','advanced_insights','advanced_reporting','ai_operations',
  'api_access','auto_reply','basic_analytics','broadcast_credits','broadcasts',
  'compliance_monitoring','custom_integrations','customer_segmentation',
  'data_export','forecasting','funnel_analytics','human_handoff','inbox',
  'integrations','k1sms','loyalty_rewards','meta_cloud','multi_branch',
  'multi_team','multi_whatsapp','my_work','next_best_action','products',
  'recovery','revenue_pro','safety_controls','segments','smart_assistant',
  'smart_campaign_builder','sms_messaging','support_inbox','team','team_routing',
  'wallet',
]);

export async function syncRegistryFromJson(
  registry: RegistryEntry[],
): Promise<{ added: number; existing: number }> {
  const existingRows = await (prisma as any).featureControl.findMany({ select: { featureId: true } });
  const existingSet = new Set<string>(existingRows.map((r: any) => r.featureId as string));

  let added = 0;
  let existing = 0;

  for (const f of registry) {
    if (existingSet.has(f.key)) {
      // Update source/type on existing registry-backed rows (idempotent)
      await (prisma as any).featureControl.update({
        where: { featureId: f.key },
        data: {
          featureSource: 'registry',
          featureType: f.type ?? 'feature',
          adminVisible: true,
        },
      });
      existing++;
      continue;
    }

    const isAdmin = f.type === 'admin_internal';
    await (prisma as any).featureControl.create({
      data: {
        featureId:       f.key,
        name:            f.nameAr || f.nameEn,
        description:     f.nameEn,
        category:        f.category,
        workspace:       f.category,
        status:          'enabled',
        customerVisible: isAdmin ? false : (f.customerVisible ?? true),
        adminOnly:       isAdmin,
        beta:            false,
        requiredPlan:    f.requiredPlan ?? null,
        dependencies:    '[]',
        requiredIntegration: null,
        mobileVisible:   !isAdmin,
        killSwitch:      false,
        rolloutPct:      100,
        releaseId:       null,
        featureSource:   'registry',
        featureType:     f.type ?? 'feature',
        adminVisible:    true,
      },
    });
    added++;
  }

  // Also update legacy rows with their classification
  await classifyLegacyRows(existingSet, new Set(registry.map((f: RegistryEntry) => f.key)));

  invalidateFeatureCache();
  return { added, existing };
}

/**
 * Classify legacy (non-registry) rows with featureSource="legacy_db" and
 * featureType="legacy_mapped" or "legacy_unmapped".
 * SAFE: only updates featureSource/featureType/adminVisible — never changes
 * status, killSwitch, customerVisible, rolloutPct, or any admin-controlled field.
 */
export async function classifyLegacyRows(
  allExistingKeys?: Set<string>,
  registryKeys?: Set<string>,
): Promise<{ classified: number }> {
  const existing = allExistingKeys ?? new Set<string>(
    (await (prisma as any).featureControl.findMany({ select: { featureId: true } }))
      .map((r: any) => r.featureId as string),
  );
  const regKeys = registryKeys ?? new Set<string>(existing); // fallback: treat all as non-legacy

  let classified = 0;
  for (const fid of existing) {
    if (regKeys.has(fid)) continue; // skip registry-backed rows
    const legacyType = LEGACY_MAPPED_KEYS.has(fid) ? 'legacy_mapped' : 'legacy_unmapped';
    await (prisma as any).featureControl.update({
      where: { featureId: fid },
      data: {
        featureSource: 'legacy_db',
        featureType: legacyType,
        adminVisible: true,
      },
    });
    classified++;
  }
  return { classified };
}

/**
 * Returns the set of featureIds that are NOT customer-visible.
 * Used by the dashboard nav to suppress customer-invisible features.
 * Admin users bypass this entirely.
 */
export async function getCustomerInvisibleFeatureIds(): Promise<Set<string>> {
  const rows = await (prisma as any).featureControl.findMany({
    where: { customerVisible: false },
    select: { featureId: true },
  });
  return new Set<string>(rows.map((r: any) => r.featureId as string));
}
