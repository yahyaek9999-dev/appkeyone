// Deterministic Tenant Health Score — real signals only, fully explainable.
//
// This module derives a 0–100 health score for a tenant (workspace owner) from
// REAL data already in the database. There is NO AI, NO randomness, NO fabricated
// metric: every point deducted is tied to a concrete signal and surfaced as a
// human-readable reason. Two callers with the same DB state always get the same
// score (important for the admin Command Center + Tenant 360).
//
// Additive: no schema changes. Pure aggregation of existing models
// (Bot, Subscription, Order, Customer, Wallet).

import { prisma } from "@/lib/db";

export type HealthLevel = "healthy" | "watch" | "at_risk" | "critical";

export type HealthReason = {
  /** Negative = deduction, positive = note. */
  delta: number;
  /** Human-readable Arabic label shown in the UI. */
  label: string;
  /** Machine signal key for grouping/telemetry. */
  signal: string;
};

export type TenantHealth = {
  score: number; // 0..100
  level: HealthLevel;
  reasons: HealthReason[];
  /** Raw signals so callers can render detail without re-querying. */
  signals: {
    whatsappConnected: boolean;
    subscriptionStatus: string | null;
    subscriptionExpiresInDays: number | null;
    ordersLast7d: number;
    lastOrderAgeDays: number | null;
    customerCount: number;
    walletStatus: string | null;
    walletBalanceUsd: number | null;
  };
};

function levelFor(score: number): HealthLevel {
  if (score >= 80) return "healthy";
  if (score >= 60) return "watch";
  if (score >= 40) return "at_risk";
  return "critical";
}

/**
 * Compute a tenant's health from real signals. All queries are bounded and
 * scoped to the single tenant. Any query that errors degrades gracefully to a
 * neutral value (never throws) so one missing table can't break the admin view.
 */
export async function getTenantHealth(userId: string): Promise<TenantHealth> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400000);

  const [bot, sub, ordersLast7d, lastOrder, customerCount, wallet] = await Promise.all([
    prisma.bot.findUnique({ where: { userId }, select: { whatsappStatus: true } }).catch(() => null),
    prisma.subscription
      .findUnique({ where: { userId }, select: { status: true, expiresAt: true } })
      .catch(() => null),
    prisma.order.count({ where: { userId, createdAt: { gte: weekAgo } } }).catch(() => 0),
    prisma.order
      .findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
      .catch(() => null),
    prisma.customer.count({ where: { userId } }).catch(() => 0),
    (prisma as any).wallet
      ?.findUnique({ where: { userId }, select: { status: true, balanceUsd: true } })
      .catch(() => null) ?? null,
  ]);

  const whatsappConnected = bot?.whatsappStatus === "connected";
  const subscriptionStatus = sub?.status ?? null;
  const expiresInDays = sub?.expiresAt
    ? Math.round((new Date(sub.expiresAt).getTime() - now) / 86400000)
    : null;
  const lastOrderAgeDays = lastOrder?.createdAt
    ? Math.floor((now - new Date(lastOrder.createdAt).getTime()) / 86400000)
    : null;
  const walletStatus = wallet?.status ?? null;
  const walletBalanceUsd = typeof wallet?.balanceUsd === "number" ? wallet.balanceUsd : null;

  // ---- Scoring: start at 100, deduct on real negative signals ---------------
  let score = 100;
  const reasons: HealthReason[] = [];
  const deduct = (delta: number, label: string, signal: string) => {
    score -= delta;
    reasons.push({ delta: -delta, label, signal });
  };

  // WhatsApp connection (the single most important operational signal).
  if (!whatsappConnected) {
    deduct(25, "واتساب غير متصل", "whatsapp_disconnected");
  }

  // Subscription health.
  if (subscriptionStatus === "expired") {
    deduct(25, "الاشتراك منتهٍ", "subscription_expired");
  } else if (subscriptionStatus === "pending" || subscriptionStatus == null) {
    deduct(15, "الاشتراك غير مُفعّل", "subscription_pending");
  } else if (subscriptionStatus === "active" && expiresInDays != null && expiresInDays <= 3 && expiresInDays >= 0) {
    deduct(8, `الاشتراك ينتهي خلال ${expiresInDays} يوم`, "subscription_expiring");
  }

  // Activity: recent orders are the clearest "the product is being used" signal.
  if (ordersLast7d === 0) {
    if (lastOrderAgeDays == null) {
      deduct(15, "لا توجد طلبات على الإطلاق", "no_orders_ever");
    } else if (lastOrderAgeDays >= 14) {
      deduct(15, `آخر طلب منذ ${lastOrderAgeDays} يوم`, "inactive_14d");
    } else if (lastOrderAgeDays >= 7) {
      deduct(8, `لا طلبات خلال آخر ٧ أيام`, "inactive_7d");
    }
  }

  // Engagement: an empty customer base after onboarding is a churn precursor.
  if (customerCount === 0) {
    deduct(10, "لا يوجد عملاء بعد", "no_customers");
  }

  // Wallet: a suspended wallet or zero balance blocks metered sends.
  if (walletStatus === "suspended") {
    deduct(10, "المحفظة موقوفة", "wallet_suspended");
  } else if (walletBalanceUsd != null && walletBalanceUsd <= 0) {
    deduct(5, "رصيد المحفظة صفر", "wallet_empty");
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return {
    score,
    level: levelFor(score),
    reasons,
    signals: {
      whatsappConnected,
      subscriptionStatus,
      subscriptionExpiresInDays: expiresInDays,
      ordersLast7d,
      lastOrderAgeDays,
      customerCount,
      walletStatus,
      walletBalanceUsd,
    },
  };
}

/** Arabic label + tailwind color classes for a health level. */
export function healthLevelMeta(level: HealthLevel): { label: string; text: string; bg: string; border: string } {
  switch (level) {
    case "healthy":
      return { label: "سليم", text: "text-emerald-300", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/25" };
    case "watch":
      return { label: "مراقبة", text: "text-amber-300", bg: "bg-amber-500/[0.08]", border: "border-amber-500/25" };
    case "at_risk":
      return { label: "معرّض للخطر", text: "text-orange-300", bg: "bg-orange-500/[0.08]", border: "border-orange-500/25" };
    case "critical":
      return { label: "حرج", text: "text-rose-300", bg: "bg-rose-500/[0.08]", border: "border-rose-500/25" };
  }
}
