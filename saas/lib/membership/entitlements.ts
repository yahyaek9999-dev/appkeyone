/**
 * Membership: capability entitlements — the SINGLE SOURCE OF TRUTH for feature gating.
 *
 * Effective entitlement is calculated as:
 *
 *   Base Plan
 *   + CustomerPlanOverride (admin custom deal — per-tenant)
 *   + EntitlementGift (sms_credits, feature_unlock, plan_upgrade, free days)
 *   + PromotionRedemption (active promotions with feature unlocks)
 *   - Admin kill switch (FeatureControl.killSwitch → always overrides)
 *   - Expired items are excluded
 *
 * Fail-open on DB errors: a gating bug must never take down production.
 * Fail-closed on admin kill-switch: that must always work.
 */

import { prisma } from "@/lib/db";
import { getEffectivePlan, type EffectivePlan } from "./plan";
import { getDisabledFeatureIds } from "@/lib/feature-control";
import {
  CAPABILITIES,
  TIERS,
  TIER_ORDER,
  PUBLIC_TIERS,
  tierUnlocking,
  getTier,
  capabilitiesForIndex,
  type TierSlug,
} from "@/lib/pricing/catalog";

export interface Entitlements {
  tier: EffectivePlan["tier"];
  slug: string;
  planName: string;
  isFallback: boolean;
  blocked: boolean;
  /**
   * Whether capability gating is enforced for this user.
   * True for k_* plan holders and free-tier when FREE_TIER_ENFORCEMENT=1.
   * False for legacy active subscribers (non-regressive).
   */
  enforce: boolean;
  /** capabilityKey → allowed (after all layered overrides applied). */
  capabilities: Record<string, boolean>;
  /** Numeric soft-limits (0 = unlimited). */
  limits: {
    team:        number;
    automations: number;
    kbDocs:      number;
    whatsapp:    number;
    broadcasts:  number;
    ai:          number;
    messages:    number;
    customers:   number;
    smsCredits:  number;
  };
  /** Which layers contributed to the final entitlements (for diagnostics). */
  sources: ("plan" | "override" | "gift" | "promotion")[];
}

/**
 * Map internal tier to capability index (4-tier model).
 * Legacy plans that pre-date k_* slugs map to their closest equivalent.
 */
const CAP_INDEX_BY_INTERNAL_TIER: Record<EffectivePlan["tier"], number> = {
  basic:     0,  // Start
  pro:       1,  // Growth
  max:       2,  // Pro
  companies: 3,  // Enterprise
};

function numFlag(flags: Record<string, any>, key: string, fallback: number): number {
  const v = flags?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function freeTierEnforcementEnabled(): boolean {
  return process.env.FREE_TIER_ENFORCEMENT === "1";
}

/**
 * Full effective entitlement calculation — the authoritative source.
 * Called by hasCapability, pageGate, apiGate, and the plan preview API.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  // Platform admins (User.role = "admin") bypass all capability gating so they
  // can see the full product as any customer would, regardless of their own plan.
  const userRow = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (userRow?.role === "admin") {
    const allCaps: Record<string, boolean> = {};
    for (const cap of CAPABILITIES) allCaps[cap.key] = true;
    return {
      tier: "companies",
      slug: "k_enterprise",
      planName: "Admin",
      isFallback: false,
      blocked: false,
      enforce: false,
      capabilities: allCaps,
      limits: { team: 0, automations: 0, kbDocs: 0, whatsapp: 0, broadcasts: 0, ai: 0, messages: 0, customers: 0, smsCredits: 0 },
      sources: ["plan"],
    };
  }

  const [plan, override, gifts, promos] = await Promise.all([
    getEffectivePlan(userId),
    fetchOverride(userId),
    fetchActiveGifts(userId),
    fetchActivePromoUnlocks(userId),
  ]);

  const flags = plan.featureFlags || {};
  const sources: Entitlements["sources"] = ["plan"];

  // ── Step 1: base plan capabilities ────────────────────────────────────────
  // Use capIndex from the catalog TierDef when available, otherwise fall back
  // to the internal-tier mapping (for legacy plan rows with no k_* slug).
  const catalogTier = getTier(plan.slug);
  const baseCapIndex = catalogTier?.capIndex ?? CAP_INDEX_BY_INTERNAL_TIER[plan.tier] ?? 0;

  const capabilities: Record<string, boolean> = {};
  for (const cap of CAPABILITIES) {
    const explicit = flags[cap.key];
    capabilities[cap.key] = typeof explicit === "boolean"
      ? explicit
      : baseCapIndex >= cap.minTierIndex;
  }

  let limits = {
    team:        numFlag(flags, "team", plan.tier === "basic" ? 1 : 0),
    automations: numFlag(flags, "automations", 0),
    kbDocs:      numFlag(flags, "kbDocs", 0),
    whatsapp:    plan.whatsappSessions,
    broadcasts:  plan.broadcastsMonthly,
    ai:          plan.aiRequestsMonthly,
    messages:    plan.monthlyMsgs,
    customers:   numFlag(flags, "customers", 0),
    smsCredits:  0,
  };

  // ── Step 2: admin custom plan override ────────────────────────────────────
  if (override) {
    sources.push("override");
    // Additional capabilities granted by the override
    try {
      const addCaps: string[] = JSON.parse(override.addCaps || "[]");
      for (const key of addCaps) {
        capabilities[key] = true;
      }
    } catch {}

    // Limit overrides
    try {
      const lo: Record<string, number> = JSON.parse(override.limitOverrides || "{}");
      for (const [k, v] of Object.entries(lo)) {
        if (typeof v === "number" && k in limits) {
          (limits as any)[k] = v;
        }
      }
    } catch {}

    // If override specifies a higher base plan, merge its capabilities in
    const overrideTier = getTier(override.baseSlug);
    if (overrideTier && overrideTier.capIndex > baseCapIndex) {
      const overrideCaps = capabilitiesForIndex(overrideTier.capIndex);
      for (const key of overrideCaps) {
        capabilities[key] = true;
      }
    }
  }

  // ── Step 3: active promotion feature unlocks ─────────────────────────────
  for (const promo of promos) {
    sources.push("promotion");
    if (promo.featureKey) capabilities[promo.featureKey] = true;
    if (promo.creditType === "sms_credits" && promo.creditAmount > 0) {
      limits.smsCredits += promo.creditAmount;
    }
    if (promo.creditType === "ai_credits" && promo.creditAmount > 0) {
      limits.ai = limits.ai === 0 ? 0 : limits.ai + promo.creditAmount;
    }
    if (promo.creditType === "broadcast_credits" && promo.creditAmount > 0) {
      limits.broadcasts = limits.broadcasts === 0 ? 0 : limits.broadcasts + promo.creditAmount;
    }
  }

  // ── Step 4: active gifts ───────────────────────────────────────────────────
  for (const gift of gifts) {
    sources.push("gift");
    switch (gift.type) {
      case "feature_unlock":
        if (gift.featureKey) capabilities[gift.featureKey] = true;
        break;
      case "plan_upgrade": {
        const giftTier = gift.planSlug ? getTier(gift.planSlug) : undefined;
        if (giftTier && giftTier.capIndex > baseCapIndex) {
          const giftCaps = capabilitiesForIndex(giftTier.capIndex);
          for (const key of giftCaps) {
            capabilities[key] = true;
          }
        }
        break;
      }
      case "sms_credits":
        limits.smsCredits += gift.amount;
        break;
      case "ai_credits":
        limits.ai = limits.ai === 0 ? 0 : limits.ai + gift.amount;
        break;
      case "broadcast_credits":
        limits.broadcasts = limits.broadcasts === 0 ? 0 : limits.broadcasts + gift.amount;
        break;
    }
  }

  // ── Step 5: admin control plane — always overrides ───────────────────────
  // A feature can be unavailable for several reasons: admin kill switch, a
  // disabled/deprecated status, a held or archived RELEASE train, or a disabled
  // dependency. getDisabledFeatureIds() resolves all of them into one set so
  // this layer can never disagree with isFeatureEnabled().
  //
  // Registry featureIds are derived from the capability catalog, so the key
  // match below is guaranteed rather than coincidental.
  // 30s-cached — safe to call on every request.
  try {
    const disabled = await getDisabledFeatureIds();
    for (const featureId of disabled) {
      if (featureId in capabilities) capabilities[featureId] = false;
    }
  } catch {
    // Fail-open: a dead FeatureControl table must never block feature access
  }

  // ── Step 6: enforcement logic ─────────────────────────────────────────────
  const isKPlan = typeof plan.slug === "string" && plan.slug.startsWith("k_");
  const enforceFreeTier = plan.isFallback && freeTierEnforcementEnabled();

  return {
    tier: plan.tier,
    slug: plan.slug,
    planName: override
      ? `${plan.planName} + مزايا مخصّصة`
      : plan.planName,
    isFallback: plan.isFallback,
    blocked: plan.blocked,
    enforce: isKPlan || enforceFreeTier,
    capabilities,
    limits,
    sources: [...new Set(sources)],
  };
}

async function fetchOverride(userId: string) {
  try {
    const now = new Date();
    return await (prisma as any).customerPlanOverride.findFirst({
      where: {
        userId,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  } catch {
    return null;
  }
}

/**
 * Returns active promotions that apply to this user and grant either a
 * feature unlock or extra credits. Called as Layer 3 of getEntitlements().
 *
 * A promotion applies to a user when:
 *   - It has an explicit PromotionRedemption row for this userId, OR
 *   - specificUserIds is empty (applies to everyone) AND it's still active
 */
async function fetchActivePromoUnlocks(userId: string): Promise<Array<{
  featureKey: string | null;
  creditType: string | null;
  creditAmount: number;
}>> {
  try {
    const now = new Date();
    // Promos redeemed by this user specifically
    const redeemed = await (prisma as any).promotionRedemption.findMany({
      where: { userId },
      include: {
        promo: {
          where: {
            status: "active",
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            type: { in: ["feature_unlock", "credit_bonus"] },
          },
        },
      },
    });

    // Also auto-apply global (no-code) active promos not yet redeemed
    const globalPromos = await (prisma as any).promotion.findMany({
      where: {
        status: "active",
        code: null, // auto-apply
        specificUserIds: "[]", // applies to all
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        type: { in: ["feature_unlock", "credit_bonus"] },
      },
    });

    const results: Array<{ featureKey: string | null; creditType: string | null; creditAmount: number }> = [];

    for (const r of redeemed) {
      if (r.promo) results.push({ featureKey: r.promo.featureKey, creditType: r.promo.creditType, creditAmount: r.promo.creditAmount ?? 0 });
    }
    for (const p of globalPromos) {
      results.push({ featureKey: p.featureKey, creditType: p.creditType, creditAmount: p.creditAmount ?? 0 });
    }
    return results;
  } catch {
    return []; // fail-open
  }
}

async function fetchActiveGifts(userId: string) {
  try {
    const now = new Date();
    return await (prisma as any).entitlementGift.findMany({
      where: {
        userId,
        used: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  } catch {
    return [];
  }
}

// ── Public helpers ─────────────────────────────────────────────────────────

export async function hasCapability(userId: string, capKey: string): Promise<boolean> {
  try {
    const ent = await getEntitlements(userId);
    if (ent.blocked) return false;
    if (!ent.enforce) return true;
    return Boolean(ent.capabilities[capKey]);
  } catch {
    return true; // fail-open: gating error must never break production
  }
}

/** Explains WHY a feature is off — for Admin diagnostics and "why is this off?" UI. */
export async function featureOffReason(
  userId: string,
  capKey: string,
): Promise<string | null> {
  try {
    const ent = await getEntitlements(userId);
    if (ent.blocked) return "الحساب موقوف";
    if (!ent.enforce) return null; // full access
    if (ent.capabilities[capKey]) return null; // feature is ON
    const unlocking = tierUnlocking(capKey);
    if (unlocking) {
      const tier = getTier(unlocking);
      return `يتطلب ${tier?.name.ar ?? unlocking}`;
    }
    return "غير متاح في خطّتك";
  } catch {
    return null;
  }
}

/** Error thrown by `requireCapability` — carries the recommended upgrade tier. */
export class PaywallError extends Error {
  capability: string;
  recommendedTier: TierSlug | null;
  status = 402;
  constructor(capability: string) {
    super(`capability_locked:${capability}`);
    this.name = "PaywallError";
    this.capability = capability;
    this.recommendedTier = tierUnlocking(capability);
  }
}

export async function requireCapability(userId: string, capKey: string): Promise<void> {
  const ok = await hasCapability(userId, capKey);
  if (!ok) throw new PaywallError(capKey);
}

export function paywallPayload(
  err: unknown,
): { error: string; capability: string; recommendedTier: string | null } | null {
  if (err instanceof PaywallError) {
    return { error: "capability_locked", capability: err.capability, recommendedTier: err.recommendedTier };
  }
  return null;
}

/** Re-exports for convenience */
export { TIER_ORDER, TIERS, PUBLIC_TIERS };
