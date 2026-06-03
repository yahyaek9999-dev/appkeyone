// AI Intelligence Layer — feature flags (env kill-switches).
//
// Every new intelligence surface is dark-launchable via an env flag so it can be
// disabled per-environment WITHOUT a redeploy if anything misbehaves. The
// derivation layer is read-only and fail-closed by design (see types.ts), so the
// flags default to ENABLED and act as a kill-switch: set the env var to
// "0" / "false" / "off" to turn the feature off.
//
// Per-tenant gating (when a feature should be plan-restricted) is layered on top
// in the route via the existing `plan.featureFlags` mechanism (see
// lib/membership/plan.ts) — see intelTenantEnabled() below.

import type { EffectivePlan } from "@/lib/membership/plan";

/** Read an intelligence env flag. Defaults to `def` (true) when unset. */
export function intelFlag(name: string, def = true): boolean {
  const v = process.env[name];
  if (v == null || v === "") return def;
  const s = String(v).trim().toLowerCase();
  return !(s === "0" || s === "false" || s === "off" || s === "no");
}

/**
 * Combined env + per-plan gate for a tenant-facing intelligence feature.
 * Disabled only when the env kill-switch is off OR the plan explicitly opts out
 * (`featureFlags[planFlag] === false`). Absent plan flag = allowed (consistent
 * with the rest of the intelligence layer, which ships on for every plan).
 */
export function intelTenantEnabled(
  envFlag: string,
  plan: Pick<EffectivePlan, "featureFlags"> | null | undefined,
  planFlag: string,
): boolean {
  if (!intelFlag(envFlag)) return false;
  const flags = plan?.featureFlags;
  if (flags && flags[planFlag] === false) return false;
  return true;
}
