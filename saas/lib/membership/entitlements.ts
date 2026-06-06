/**
 * Membership: capability entitlements — the central feature gate.
 *
 * Built on top of `getEffectivePlan()` (lib/membership/plan.ts). Reads the
 * per-user `featureFlags` (written by the catalog-driven seed) and the plan
 * tier to answer "can this user use capability X" + "what are the numeric
 * soft-limits (team / automations / kbDocs)".
 *
 * Additive: this does NOT replace existing `checkLimit()` usage-counter gates;
 * it complements them for boolean feature availability. Fail-open on errors so
 * a gating bug never takes down production.
 */

import { getEffectivePlan, type EffectivePlan } from "./plan";
import {
  CAPABILITIES,
  TIERS,
  TIER_ORDER,
  tierUnlocking,
  type TierSlug,
} from "@/lib/pricing/catalog";

export interface Entitlements {
  tier: EffectivePlan["tier"];
  slug: string;
  planName: string;
  isFallback: boolean;
  blocked: boolean;
  /**
   * Whether capability gating should be ENFORCED for this user. True only when
   * the user is on a new public plan (k_* slug). Legacy-slug and no-subscription
   * users are never locked out of features they already use — this keeps Phase 2
   * enforcement fully non-regressive on the live base.
   */
  enforce: boolean;
  /** capabilityKey -> allowed. */
  capabilities: Record<string, boolean>;
  /** Numeric soft-limits (0 = unlimited). */
  limits: {
    team: number;
    automations: number;
    kbDocs: number;
    whatsapp: number;
    broadcasts: number;
    ai: number;
    messages: number;
  };
}

/**
 * Map an internal gating tier (basic|pro|max|companies) to the cheapest public
 * catalog tier index, so capability resolution has a sensible default even for
 * users sitting on a legacy plan row.
 */
const INDEX_BY_INTERNAL_TIER: Record<EffectivePlan["tier"], number> = {
  basic: 0,
  pro: 2,
  max: 3,
  companies: 5,
};

function numFlag(
  flags: Record<string, any>,
  key: string,
  fallback: number,
): number {
  const v = flags?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const plan = await getEffectivePlan(userId);
  const flags = plan.featureFlags || {};

  // Resolve capability booleans. A plan's own featureFlags win when present;
  // otherwise we derive from the tier ladder so legacy plans behave sensibly.
  const fallbackIndex = INDEX_BY_INTERNAL_TIER[plan.tier] ?? 0;
  const capabilities: Record<string, boolean> = {};
  for (const cap of CAPABILITIES) {
    const explicit = flags[cap.key];
    capabilities[cap.key] =
      typeof explicit === "boolean"
        ? explicit
        : fallbackIndex >= cap.minTierIndex;
  }

  return {
    tier: plan.tier,
    slug: plan.slug,
    planName: plan.planName,
    isFallback: plan.isFallback,
    blocked: plan.blocked,
    // Enforce only for the new public catalog plans. Everyone else (legacy
    // slugs, no subscription) keeps full access — non-regressive by design.
    enforce: typeof plan.slug === "string" && plan.slug.startsWith("k_"),
    capabilities,
    limits: {
      team: numFlag(flags, "team", plan.tier === "basic" ? 1 : 0),
      automations: numFlag(flags, "automations", 0),
      kbDocs: numFlag(flags, "kbDocs", 0),
      whatsapp: plan.whatsappSessions,
      broadcasts: plan.broadcastsMonthly,
      ai: plan.aiRequestsMonthly,
      messages: plan.monthlyMsgs,
    },
  };
}

export async function hasCapability(
  userId: string,
  capKey: string,
): Promise<boolean> {
  try {
    const ent = await getEntitlements(userId);
    if (ent.blocked) return false;
    // Non-enforced users (legacy / no-sub) keep full access.
    if (!ent.enforce) return true;
    return Boolean(ent.capabilities[capKey]);
  } catch {
    return true; // fail-open
  }
}

/** Error thrown by `requireCapability` — carries the recommended upgrade tier. */
export class PaywallError extends Error {
  capability: string;
  recommendedTier: TierSlug | null;
  status = 402; // Payment Required
  constructor(capability: string) {
    super(`capability_locked:${capability}`);
    this.name = "PaywallError";
    this.capability = capability;
    this.recommendedTier = tierUnlocking(capability);
  }
}

/**
 * Server-side guard for API routes / server actions. Throws `PaywallError`
 * when the user's plan does not include the capability. Callers convert it
 * into a 402 JSON the upgrade modal understands:
 *   { error: "capability_locked", capability, recommendedTier }
 */
export async function requireCapability(
  userId: string,
  capKey: string,
): Promise<void> {
  const ok = await hasCapability(userId, capKey);
  if (!ok) throw new PaywallError(capKey);
}

/** Convert any thrown error into a paywall JSON payload, or null if unrelated. */
export function paywallPayload(
  err: unknown,
): { error: string; capability: string; recommendedTier: string | null } | null {
  if (err instanceof PaywallError) {
    return {
      error: "capability_locked",
      capability: err.capability,
      recommendedTier: err.recommendedTier,
    };
  }
  return null;
}

/** Public tier slugs in order — re-export for convenience. */
export { TIER_ORDER, TIERS };
