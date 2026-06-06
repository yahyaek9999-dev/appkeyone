/**
 * Membership: plan resolution + feature-flag parsing.
 *
 * Single read-only entry point that returns "what is this user allowed to do"
 * with stable defaults, regardless of which legacy plan slug they're on.
 *
 * Design notes:
 *   - Free / no-subscription users get a safe minimal default (no Meta, no
 *     broadcasts, low quota) — they keep working but can't escalate.
 *   - Suspended users get `blocked: true`. All gates short-circuit.
 *   - Plan field overrides win when set; otherwise we fall back to the
 *     plan-slug heuristic so the OLD plan rows (starter / business /
 *     enterprise) keep behaving sensibly without a data migration.
 */

import { prisma } from "@/lib/db";

export interface EffectivePlan {
  /** True when no usable subscription is found (or it's expired). */
  isFallback: boolean;
  /** True when the user account is suspended — gate everything off. */
  blocked: boolean;
  /** Display tier label. */
  tier: "basic" | "pro" | "max" | "companies";
  /** Plan slug as stored in DB (or "none"). */
  slug: string;
  planName: string;

  // Limits — 0 means UNLIMITED (we never block when 0).
  monthlyMsgs: number;
  aiRequestsMonthly: number;
  broadcastsMonthly: number;
  whatsappSessions: number;

  // Permissions
  metaAccess: "none" | "limited" | "full";
  analyticsAccess: "basic" | "advanced";
  queuePriority: number;
  rateLimitPerMin: number;
  featureFlags: Record<string, boolean | string | number>;

  // Reason hint when blocked / fallback (debug + UI).
  reason: string;
}

const TIER_BY_SLUG: Record<string, EffectivePlan["tier"]> = {
  // Legacy slugs (existing subscribers — do not remove).
  starter: "basic", basic: "basic",
  pro: "pro",
  business: "max", max: "max",
  enterprise: "companies", companies: "companies",
  // New public catalog slugs (k_*) → internal gating tier.
  k_start: "basic",
  k_growth: "pro",
  k_pro: "pro",
  k_business: "max",
  k_scale: "max",
  k_enterprise: "companies",
};

const META_BY_TIER: Record<EffectivePlan["tier"], EffectivePlan["metaAccess"]> = {
  basic: "none",
  pro: "none",
  max: "limited",
  companies: "full",
};

const ANALYTICS_BY_TIER: Record<EffectivePlan["tier"], EffectivePlan["analyticsAccess"]> = {
  basic: "basic",
  pro: "basic",
  max: "advanced",
  companies: "advanced",
};

const QUEUE_PRIO_BY_TIER: Record<EffectivePlan["tier"], number> = {
  basic: 0,
  pro: 5,
  max: 10,
  companies: 20,
};

const RATE_BY_TIER: Record<EffectivePlan["tier"], number> = {
  basic: 30,
  pro: 60,
  max: 120,
  companies: 300,
};

function parseFlags(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

const FALLBACK: Omit<EffectivePlan, "blocked" | "reason"> = {
  isFallback: true,
  tier: "basic",
  slug: "none",
  planName: "بدون اشتراك",
  monthlyMsgs: 100,
  aiRequestsMonthly: 100,
  broadcastsMonthly: 0,
  whatsappSessions: 1,
  metaAccess: "none",
  analyticsAccess: "basic",
  queuePriority: 0,
  rateLimitPerMin: 15,
  featureFlags: {},
};

export async function getEffectivePlan(userId: string): Promise<EffectivePlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      // @ts-ignore — added in membership phase
      suspended: true,
      // @ts-ignore
      suspendedReason: true,
      subscription: { include: { plan: true } },
    } as any,
  }) as any;

  if (!user) {
    return { ...FALLBACK, blocked: true, reason: "user_not_found" };
  }
  if (user.suspended) {
    return { ...FALLBACK, blocked: true, reason: user.suspendedReason || "suspended" };
  }

  const sub = user.subscription;
  if (!sub || sub.status !== "active" || sub.expiresAt < new Date()) {
    return { ...FALLBACK, blocked: false, reason: sub ? `inactive:${sub.status}` : "no_subscription" };
  }

  const plan = sub.plan;
  const tier = (plan.tier as EffectivePlan["tier"]) || TIER_BY_SLUG[plan.slug] || "basic";

  // Plan-level fields win when set (>0 / non-empty). Otherwise fall back to
  // tier defaults so old plan rows keep working without a data migration.
  const aiMonthly       = plan.aiRequestsMonthly ?? 0;
  const broadcastsMonth = plan.broadcastsMonthly ?? 0;
  const sessions        = plan.whatsappSessions ?? 1;
  const metaAccess      = (plan.metaAccess as EffectivePlan["metaAccess"]) || META_BY_TIER[tier];
  const analyticsAccess = (plan.analyticsAccess as EffectivePlan["analyticsAccess"]) || ANALYTICS_BY_TIER[tier];
  const queuePriority   = plan.queuePriority ?? QUEUE_PRIO_BY_TIER[tier];
  const rateLimitPerMin = plan.rateLimitPerMin ?? RATE_BY_TIER[tier];

  return {
    isFallback: false,
    blocked: false,
    tier,
    slug: plan.slug,
    planName: plan.name,
    monthlyMsgs: plan.monthlyMsgs ?? 0,
    aiRequestsMonthly: aiMonthly,
    broadcastsMonthly: broadcastsMonth,
    whatsappSessions: sessions,
    metaAccess,
    analyticsAccess,
    queuePriority,
    rateLimitPerMin,
    featureFlags: parseFlags(plan.featureFlags),
    reason: "ok",
  };
}

/** Cheap convenience used by UI badges. */
export function tierBadge(tier: EffectivePlan["tier"]): { label: string; color: string } {
  switch (tier) {
    case "companies": return { label: "Companies", color: "bg-purple-500/20 text-purple-300" };
    case "max":       return { label: "Max",       color: "bg-brand-500/20 text-brand-300" };
    case "pro":       return { label: "Pro",       color: "bg-emerald-500/20 text-emerald-300" };
    default:          return { label: "Basic",     color: "bg-slate-500/20 text-slate-300" };
  }
}
