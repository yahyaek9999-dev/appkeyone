import { getCurrentUser } from "./auth";
import { prisma } from "./db";

/** Throws if the request is not made by an admin. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if ((user as any).role !== "admin") throw new Error("FORBIDDEN");
  return user;
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
