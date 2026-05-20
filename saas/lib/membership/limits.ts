/**
 * Membership: usage counters + limit checks.
 *
 * Three responsibilities:
 *   1. Atomically increment per-user counters (msgs / ai requests / broadcasts).
 *   2. Roll the counters at the start of each calendar month.
 *   3. Return a structured "allowed / blocked + remaining" decision that
 *      callers can show in UI or use as a hard gate.
 *
 * IMPORTANT: a 0 in the matching plan limit means UNLIMITED. We never block
 * when the cap is 0 — that's how we keep legacy plans working without a
 * data migration.
 */

import { prisma } from "@/lib/db";
import { getEffectivePlan, type EffectivePlan } from "./plan";

export type LimitKind = "messages" | "ai" | "broadcast";

export interface LimitDecision {
  allowed: boolean;
  reason:
    | "ok"
    | "suspended"
    | "no_subscription"
    | "expired"
    | "exhausted"
    | "feature_disabled";
  used: number;
  cap: number; // 0 = unlimited
  remaining: number; // Number.POSITIVE_INFINITY when unlimited
  resetAt: Date | null;
  plan: EffectivePlan;
}

function startOfNextMonth(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
}
function startOfThisMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Roll counters when the stored reset anchor predates the current calendar
 * month. Returns the (possibly-updated) Subscription row. Cheap no-op when
 * we're still inside the same month.
 */
async function rollIfNeeded(userId: string) {
  const sub = (await prisma.subscription.findUnique({
    where: { userId },
  })) as any;
  if (!sub) return null;
  const now = new Date();
  const monthStart = startOfThisMonth(now);
  const lastReset = sub.usageResetAt ? new Date(sub.usageResetAt) : new Date(0);
  if (lastReset < monthStart) {
    await prisma.subscription
      .update({
        where: { userId },
        data: {
          msgsUsed: 0,
          aiRequestsUsed: 0,
          broadcastsUsed: 0,
          usageResetAt: now,
        } as any,
      })
      .catch(() => {});
    sub.msgsUsed = 0;
    sub.aiRequestsUsed = 0;
    sub.broadcastsUsed = 0;
    sub.usageResetAt = now;
  }
  return sub;
}

function pickCounter(
  kind: LimitKind,
  sub: any,
  plan: EffectivePlan,
): { used: number; cap: number; field: string } {
  switch (kind) {
    case "messages":
      return {
        used: sub?.msgsUsed ?? 0,
        cap: plan.monthlyMsgs,
        field: "msgsUsed",
      };
    case "ai":
      return {
        used: sub?.aiRequestsUsed ?? 0,
        cap: plan.aiRequestsMonthly,
        field: "aiRequestsUsed",
      };
    case "broadcast":
      return {
        used: sub?.broadcastsUsed ?? 0,
        cap: plan.broadcastsMonthly,
        field: "broadcastsUsed",
      };
  }
}

export async function checkLimit(
  userId: string,
  kind: LimitKind,
): Promise<LimitDecision> {
  const plan = await getEffectivePlan(userId);
  const baseDecision = (extra: Partial<LimitDecision>): LimitDecision =>
    ({
      allowed: false,
      reason: "ok",
      used: 0,
      cap: 0,
      remaining: 0,
      resetAt: null,
      plan,
      ...extra,
    }) as LimitDecision;

  if (plan.blocked) return baseDecision({ reason: "suspended" });

  const sub = await rollIfNeeded(userId);
  const resetAt = startOfNextMonth(new Date());

  if (!sub) {
    // No subscription at all. We use the fallback plan's caps (e.g. 100 msgs/mo).
    const counter = pickCounter(kind, null, plan);
    if (counter.cap === 0)
      return baseDecision({
        allowed: true,
        used: 0,
        cap: 0,
        remaining: Number.POSITIVE_INFINITY,
        resetAt,
      });
    return baseDecision({
      allowed: false,
      reason: "no_subscription",
      used: 0,
      cap: counter.cap,
      remaining: counter.cap,
      resetAt,
    });
  }

  if (
    sub.status !== "active" ||
    (sub.expiresAt && sub.expiresAt < new Date())
  ) {
    return baseDecision({ reason: "expired", resetAt });
  }

  // Broadcast feature flag: explicit `broadcasts:false` blocks even with cap.
  if (kind === "broadcast" && plan.featureFlags?.broadcasts === false) {
    return baseDecision({ reason: "feature_disabled", resetAt });
  }

  const c = pickCounter(kind, sub, plan);
  if (c.cap === 0) {
    return baseDecision({
      allowed: true,
      used: c.used,
      cap: 0,
      remaining: Number.POSITIVE_INFINITY,
      resetAt,
    });
  }
  const remaining = Math.max(0, c.cap - c.used);
  return baseDecision({
    allowed: remaining > 0,
    reason: remaining > 0 ? "ok" : "exhausted",
    used: c.used,
    cap: c.cap,
    remaining,
    resetAt,
  });
}

/**
 * Atomic increment AFTER a successful unit of work. Caller is responsible
 * for not calling this when checkLimit() returned allowed=false (we don't
 * double-check). Best-effort — failures are swallowed (we never want a
 * counter write to fail the user's actual operation).
 */
export async function incrementUsage(
  userId: string,
  kind: LimitKind,
  by: number = 1,
): Promise<void> {
  if (by <= 0) return;
  try {
    const { recordUsage, usageIdempotencyKey } =
      await import("@/lib/usage-ledger");
    await recordUsage({
      userId,
      kind,
      quantity: by,
      source: "membership",
      reason: "legacy_increment_usage",
      idempotencyKey: usageIdempotencyKey([
        "membership",
        userId,
        kind,
        Date.now(),
        Math.random(),
      ]),
    });
  } catch {
    const field =
      kind === "messages"
        ? "msgsUsed"
        : kind === "ai"
          ? "aiRequestsUsed"
          : "broadcastsUsed";
    try {
      await prisma.subscription.update({
        where: { userId },
        data: { [field]: { increment: by } } as any,
      });
    } catch {
      // No subscription / DB hiccup — ignore.
    }
  }
}

/** Snapshot of all counters for the dashboard. */
export async function getUsageSnapshot(userId: string) {
  const plan = await getEffectivePlan(userId);
  const sub = await rollIfNeeded(userId);
  const now = new Date();
  return {
    plan,
    resetAt: startOfNextMonth(now),
    counters: {
      messages: { used: sub?.msgsUsed ?? 0, cap: plan.monthlyMsgs },
      ai: { used: sub?.aiRequestsUsed ?? 0, cap: plan.aiRequestsMonthly },
      broadcast: {
        used: sub?.broadcastsUsed ?? 0,
        cap: plan.broadcastsMonthly,
      },
    },
  };
}

/** Quick yes/no for middlewares. Never throws. */
export async function isAllowed(
  userId: string,
  kind: LimitKind,
): Promise<boolean> {
  try {
    return (await checkLimit(userId, kind)).allowed;
  } catch {
    return true;
  } // fail-open: don't break production on a counter bug
}
