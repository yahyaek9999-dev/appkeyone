// Feature explainability — CONSUMES the canonical feature-control engine.
//
// This does NOT compute a second entitlement/feature-control result. The final
// availability verdict comes from lib/feature-control's isFeatureEnabled(); the
// first blocking node comes from featureBlockedBy(). This module only composes
// those canonical results plus the feature's own FeatureControl row into a
// human-readable trace (base status, kill switch, release train, dependencies,
// rollout, plan gate, final status, exact reason).
//
// Additive: no new engine, no schema change.

import { getAllFeatures, isFeatureEnabled, featureBlockedBy, type FeatureControlRow } from "@/lib/feature-control";

export type ExplainFactor = {
  key: "kill_switch" | "status" | "release" | "dependency" | "rollout" | "plan";
  label: string;
  value: string;
  /** ok = not blocking, block = the/a blocking reason, info = neutral context. */
  verdict: "ok" | "block" | "info";
};

export type DependencyNode = {
  featureId: string;
  name: string;
  available: boolean;
  /** Present when this dependency is itself blocked. */
  blockedBy?: string | null;
};

export type FeatureExplanation = {
  featureId: string;
  name: string;
  available: boolean; // canonical verdict from isFeatureEnabled()
  /** The single most-important reason the feature is off, or null when available. */
  reason: string | null;
  /** The first blocking node id from featureBlockedBy() ("release:<id>" possible). */
  blockedBy: string | null;
  factors: ExplainFactor[];
  dependencies: DependencyNode[];
};

function statusLabel(s: string): string {
  const m: Record<string, string> = { enabled: "مُفعّل", beta: "تجريبي", disabled: "مُعطّل", hidden: "مخفي", deprecated: "متقادم" };
  return m[s] || s;
}

/**
 * Build a full explanation for one feature. `all` may be passed to avoid
 * re-reading the feature map when explaining many features in a loop.
 */
export async function explainFeature(featureId: string, all?: Map<string, FeatureControlRow>): Promise<FeatureExplanation | null> {
  const map = all ?? new Map((await getAllFeatures()).map((f) => [f.featureId, f]));
  const f = map.get(featureId);
  if (!f) return null;

  // Canonical results — the source of truth. We never re-derive these.
  const [available, blockedBy] = await Promise.all([
    isFeatureEnabled(featureId),
    featureBlockedBy(featureId),
  ]);

  // Resolve each direct dependency's availability via the same engine.
  const dependencies: DependencyNode[] = [];
  for (const depId of f.dependencies) {
    const dep = map.get(depId);
    const depOk = await isFeatureEnabled(depId);
    dependencies.push({
      featureId: depId,
      name: dep?.name || depId,
      available: depOk,
      blockedBy: depOk ? null : await featureBlockedBy(depId),
    });
  }

  // Compose the factor list (context — the verdict itself stays canonical).
  const factors: ExplainFactor[] = [];

  factors.push({
    key: "kill_switch",
    label: "مفتاح الإيقاف الطارئ",
    value: f.killSwitch ? "مُفعّل" : "مُطفأ",
    verdict: f.killSwitch ? "block" : "ok",
  });

  const statusOk = f.status === "enabled" || f.status === "beta";
  factors.push({
    key: "status",
    label: "الحالة",
    value: statusLabel(f.status),
    verdict: statusOk ? "ok" : "block",
  });

  const releaseBlocked = typeof blockedBy === "string" && blockedBy.startsWith("release:");
  factors.push({
    key: "release",
    label: "قطار الإصدار",
    value: f.releaseId || "—",
    verdict: f.releaseId ? (releaseBlocked ? "block" : "ok") : "info",
  });

  const depBlocked = dependencies.some((d) => !d.available);
  factors.push({
    key: "dependency",
    label: "الاعتماديات",
    value: dependencies.length ? dependencies.map((d) => d.name).join("، ") : "لا يوجد",
    verdict: dependencies.length ? (depBlocked ? "block" : "ok") : "info",
  });

  factors.push({
    key: "rollout",
    label: "نسبة الإطلاق",
    value: `${f.rolloutPct}%`,
    verdict: f.rolloutPct < 100 ? "info" : "ok",
  });

  factors.push({
    key: "plan",
    label: "الباقة المطلوبة",
    value: f.requiredPlan || "أي باقة",
    verdict: f.requiredPlan ? "info" : "ok",
  });

  // Exact reason — derived from the canonical blockedBy, mapped to a message.
  let reason: string | null = null;
  if (!available) {
    if (f.killSwitch) {
      reason = "مفتاح الإيقاف الطارئ مُفعّل";
    } else if (!statusOk) {
      reason = `الحالة "${statusLabel(f.status)}" تُعطّل الميزة`;
    } else if (releaseBlocked) {
      reason = `قطار الإصدار "${f.releaseId}" غير متاح للعملاء`;
    } else if (blockedBy && blockedBy !== featureId) {
      const depName = map.get(blockedBy)?.name || blockedBy;
      reason = `اعتمادية مطلوبة غير متاحة: "${depName}"`;
    } else {
      reason = "غير متاحة (راجع العوامل)";
    }
  }

  return {
    featureId,
    name: f.name,
    available,
    reason,
    blockedBy: blockedBy ?? null,
    factors,
    dependencies,
  };
}

/** Explain every known feature (bounded — the registry is small). */
export async function explainAllFeatures(): Promise<FeatureExplanation[]> {
  const rows = await getAllFeatures();
  const map = new Map(rows.map((f) => [f.featureId, f]));
  const out: FeatureExplanation[] = [];
  for (const f of rows) {
    const ex = await explainFeature(f.featureId, map);
    if (ex) out.push(ex);
  }
  return out;
}
