import { getAuthContext } from "./auth";
import { prisma } from "./db";

/** Platform roles an admin may assign from the UI (user | finance | admin). */
export const ASSIGNABLE_PLATFORM_ROLES = ["user", "finance", "admin"] as const;
export type AssignablePlatformRole = (typeof ASSIGNABLE_PLATFORM_ROLES)[number];

/**
 * Throws if the request is not made by a platform admin.
 * SECURITY: requires an OWNER session whose User.role is "admin". A team member
 * (member session) NEVER inherits platform-admin, even if their owner is one.
 */
export async function requireAdmin() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("UNAUTHORIZED");
  if (!ctx.isOwner || (ctx.user as any).role !== "admin") throw new Error("FORBIDDEN");
  return ctx.user;
}

/**
 * Throws unless the requester is a platform admin OR a finance-role owner.
 * Used for money operations (Meta credit/settle, payment reviews).
 */
export async function requireFinanceAccess() {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("UNAUTHORIZED");
  const role = (ctx.user as any).role;
  if (!ctx.isOwner || (role !== "admin" && role !== "finance")) throw new Error("FORBIDDEN");
  return ctx.user;
}

/** Returns the singleton site config row, creating it on first access. */
export async function getSiteConfig() {
  return prisma.siteConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export type SubscriptionStatus = "pending" | "active" | "expired" | "canceled";

/** Resolve effective subscription state for a user (or null when none). */
export function evaluateSubscription(
  sub: {
    status: string;
    expiresAt: Date;
    msgsUsed: number;
    plan: { monthlyMsgs: number };
  } | null,
):
  | {
      allowed: false;
      reason: "none" | "pending" | "expired" | "canceled" | "quota";
    }
  | { allowed: true; remaining: number } {
  if (!sub) return { allowed: false, reason: "none" };
  if (sub.status === "pending") return { allowed: false, reason: "pending" };
  if (sub.status === "canceled") return { allowed: false, reason: "canceled" };
  const now = Date.now();
  if (sub.status === "expired" || sub.expiresAt.getTime() < now)
    return { allowed: false, reason: "expired" };
  if (sub.msgsUsed >= sub.plan.monthlyMsgs)
    return { allowed: false, reason: "quota" };
  return { allowed: true, remaining: sub.plan.monthlyMsgs - sub.msgsUsed };
}
