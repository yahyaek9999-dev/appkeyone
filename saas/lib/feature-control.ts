// Feature Control — DB-backed feature flag system
// Admin can enable/disable/hide/beta any feature independently of env vars.
// Customer navigation + API routes check feature visibility before rendering.
//
// Rule: killSwitch=true → always disabled for customers (admin still sees it).
// Rule: !customerVisible → hidden from nav but route still accessible to admin.
// Rule: beta=true → shown only to allowed users (future: beta list).

import { prisma } from "@/lib/db";

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
}

let cache: Map<string, FeatureControlRow> | null = null;
let cacheAt = 0;
const CACHE_TTL = 30_000; // 30s

async function loadAll(): Promise<Map<string, FeatureControlRow>> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL) return cache;

  const rows = await (prisma as any).featureControl.findMany({ orderBy: { featureId: "asc" } });
  const m = new Map<string, FeatureControlRow>();
  for (const r of rows) {
    let deps: string[] = [];
    try { deps = JSON.parse(r.dependencies || "[]"); } catch {}
    m.set(r.featureId, { ...r, dependencies: deps });
  }
  cache = m;
  cacheAt = now;
  return m;
}

export function invalidateFeatureCache() {
  cache = null;
  cacheAt = 0;
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
): Promise<boolean> {
  if (visited.has(featureId) || visited.size > 20) return true; // cycle guard
  visited.add(featureId);

  const all = await loadAll();
  const f = all.get(featureId);
  if (!f) return true; // unknown feature → assume enabled
  if (f.killSwitch) return false;
  if (f.status !== "enabled") return false;

  // Recursively check all declared dependencies
  for (const dep of f.dependencies) {
    if (!(await isFeatureEnabled(dep, visited))) return false;
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
  if (f.killSwitch || f.status !== "enabled") return featureId;

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

/** Seed default feature control records for all major capabilities. */
export async function seedDefaultFeatureControls(): Promise<void> {
  const defaults: Array<Omit<FeatureControlRow, "featureId"> & { featureId: string }> = [
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
