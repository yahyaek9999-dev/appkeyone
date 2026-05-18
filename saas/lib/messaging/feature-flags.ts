/**
 * Hybrid WhatsApp — feature flags.
 *
 * Layered defense so Meta Cloud routing never activates by accident:
 *   1. Global env flag `META_CLOUD_ENABLED=1` MUST be set.
 *   2. Merchant's plan tier must allow it (see PLAN_META_ACCESS).
 *   3. The Bot's connectionMode must be normalized to "meta_cloud".
 *   4. metaAccessTokenEnc must be present.
 *
 * All four conditions must be true. Any single failure means we fall back
 * to QR mode, which preserves current production behavior.
 *
 * IMPORTANT: This file is the ONLY place where META routing eligibility is
 * computed. Never duplicate this logic elsewhere.
 */

import { prisma } from "@/lib/db";
import { normalizeConnectionMode } from "./mode";

/** Global kill switch — set to "1" in production env to allow Meta routing. */
export function metaCloudGloballyEnabled(): boolean {
  return process.env.META_CLOUD_ENABLED === "1";
}

/**
 * Per-plan Meta Cloud access level.
 *   - "none"    → Pro and below. QR only.
 *   - "limited" → Max. Meta inbound + outbound to opted-in users, capped throughput.
 *   - "full"    → Companies / Enterprise. No platform-imposed cap.
 *
 * The actual messaging caps still apply via `Plan.monthlyMsgs` — this only
 * controls whether the Meta Cloud routing path is even considered.
 */
export type MetaAccessLevel = "none" | "limited" | "full";

const PLAN_META_ACCESS: Record<string, MetaAccessLevel> = {
  // Legacy plans
  starter: "none",
  pro: "none",
  business: "limited",
  enterprise: "full",
  // Refreshed tiers (Issue #12)
  max: "limited",
  companies: "full",
};

export function planMetaAccess(planSlug: string | null | undefined): MetaAccessLevel {
  if (!planSlug) return "none";
  return PLAN_META_ACCESS[planSlug.toLowerCase()] ?? "none";
}

/**
 * Top-level eligibility check used by the provider factory. Returns the
 * effective decision + a reason string useful for logging and the UI.
 */
export interface MetaEligibility {
  allowed: boolean;
  reason: "ok" | "global_disabled" | "plan_blocked" | "mode_not_meta" | "missing_token";
  access: MetaAccessLevel;
}

export async function metaCloudAllowedForUser(userId: string): Promise<MetaEligibility> {
  if (!metaCloudGloballyEnabled()) {
    return { allowed: false, reason: "global_disabled", access: "none" };
  }

  // We pull bot + subscription + plan in a single query.
  const [bot, sub] = await Promise.all([
    prisma.bot.findUnique({
      where: { userId },
      select: {
        connectionMode: true,
        // @ts-ignore — added in Phase 1 schema
        metaAccessTokenEnc: true,
      } as any,
    }) as any,
    prisma.subscription.findUnique({
      where: { userId },
      select: { status: true, plan: { select: { slug: true } } },
    }),
  ]);

  if (!bot) {
    return { allowed: false, reason: "mode_not_meta", access: "none" };
  }

  const planSlug = sub?.status === "active" ? sub.plan?.slug : null;
  const access = planMetaAccess(planSlug);
  if (access === "none") {
    return { allowed: false, reason: "plan_blocked", access };
  }

  const mode = normalizeConnectionMode(bot.connectionMode);
  if (mode !== "meta_cloud") {
    return { allowed: false, reason: "mode_not_meta", access };
  }

  if (!bot.metaAccessTokenEnc) {
    return { allowed: false, reason: "missing_token", access };
  }

  return { allowed: true, reason: "ok", access };
}
