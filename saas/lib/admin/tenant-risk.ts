// Deterministic Tenant Risk scoring — real signals only, fully explainable.
//
// Risk is the operational inverse of health, weighted toward churn/revenue loss.
// There is NO AI and NO randomness here: every point is tied to a concrete,
// queryable signal and surfaced as a reason. The weights below are the
// documented, fixed scoring model.
//
// Performance: getTenantRiskList() computes risk for the active-subscription
// cohort using BATCHED groupBy aggregates (no per-tenant query loop), so it
// scales without N+1.
//
// Additive: no schema change. Pure aggregation of existing models
// (Subscription, Bot, Order, PaymentTransaction, Incident).

import { prisma } from "@/lib/db";

// ── Fixed, documented weights (deterministic scoring model) ──────────────────
export const RISK_WEIGHTS = {
  whatsappDisconnected: 20,
  paymentFailure: 12,       // per failed payment in window, capped
  paymentFailureCap: 24,
  inactive7d: 10,
  inactive14d: 20,          // supersedes inactive7d
  noOrdersEver: 18,
  openIncident: 8,          // per open incident, capped
  openIncidentCap: 16,
  subExpired: 25,
  subExpiring3d: 12,
  subPending: 15,
} as const;

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskReason = { signal: string; label: string; points: number };

export type TenantRisk = {
  userId: string;
  email: string | null;
  name: string | null;
  score: number;       // 0..100 (clamped)
  level: RiskLevel;
  reasons: RiskReason[];
  recommendedAction: string;
};

function levelFor(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function recommend(reasons: RiskReason[]): string {
  const s = new Set(reasons.map((r) => r.signal));
  if (s.has("sub_expired") || s.has("sub_expiring_3d")) return "تواصل بشأن التجديد قبل انتهاء الاشتراك.";
  if (s.has("whatsapp_disconnected")) return "ساعد التاجر على إعادة ربط واتساب.";
  if (s.has("payment_failure")) return "راجع مشاكل الدفع وتواصل مع التاجر.";
  if (s.has("inactive_14d") || s.has("inactive_7d") || s.has("no_orders_ever")) return "تواصل لإعادة التفعيل — لا نشاط حديث.";
  return "راجع الحساب.";
}

export type RiskListResult = {
  generatedAt: string;
  windowDays: number;
  cohort: number; // active-subscription tenants evaluated
  rows: TenantRisk[];
};

/**
 * Compute risk for the active-subscription cohort. Bounded + batched.
 * `minScore` filters the output (default 20 → medium and above).
 */
export async function getTenantRiskList(opts: { windowDays?: number; minScore?: number; take?: number } = {}): Promise<RiskListResult> {
  const windowDays = opts.windowDays ?? 30;
  const minScore = opts.minScore ?? 20;
  const take = Math.min(500, opts.take ?? 300);
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now - 14 * 86_400_000);
  const winStart = new Date(now - windowDays * 86_400_000);
  const soon = new Date(now + 3 * 86_400_000);

  // Cohort: active subscriptions (the tenants worth monitoring for churn).
  const subs = await prisma.subscription
    .findMany({ where: { status: { in: ["active", "trial", "pending", "expired"] } }, select: { userId: true, status: true, expiresAt: true }, take })
    .catch(() => []);
  if (!subs.length) return { generatedAt: new Date(now).toISOString(), windowDays, cohort: 0, rows: [] };

  const userIds = subs.map((s) => s.userId);

  // Batched signal fetches (no per-tenant loop).
  const [users, bots, recentOrders, everOrders, failedPays, openIncidents] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }).catch(() => []),
    prisma.bot.findMany({ where: { userId: { in: userIds } }, select: { userId: true, whatsappStatus: true } }).catch(() => []),
    prisma.order.groupBy({ by: ["userId"], where: { userId: { in: userIds }, createdAt: { gte: weekAgo } }, _count: { _all: true } }).catch(() => [] as any[]),
    prisma.order.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: { _all: true }, _max: { createdAt: true } }).catch(() => [] as any[]),
    prisma.paymentTransaction.groupBy({ by: ["userId"], where: { userId: { in: userIds }, status: "failed", createdAt: { gte: winStart } }, _count: { _all: true } }).catch(() => [] as any[]),
    (prisma as any).incident?.groupBy({ by: ["userId"], where: { userId: { in: userIds }, status: { in: ["open", "assigned"] } }, _count: { _all: true } }).catch(() => [] as any[]) ?? [],
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const waMap = new Map(bots.map((b) => [b.userId, b.whatsappStatus]));
  const recentOrderMap = new Map((recentOrders as any[]).map((r) => [r.userId, r._count._all]));
  const everOrderMap = new Map((everOrders as any[]).map((r) => [r.userId, { count: r._count._all, last: r._max?.createdAt as Date | null }]));
  const failMap = new Map((failedPays as any[]).map((r) => [r.userId, r._count._all]));
  const incMap = new Map((openIncidents as any[]).map((r) => [r.userId, r._count._all]));

  const rows: TenantRisk[] = [];

  for (const sub of subs) {
    const uid = sub.userId;
    const reasons: RiskReason[] = [];
    let score = 0;
    const add = (points: number, signal: string, label: string) => { score += points; reasons.push({ signal, label, points }); };

    // WhatsApp
    if (waMap.get(uid) !== "connected") add(RISK_WEIGHTS.whatsappDisconnected, "whatsapp_disconnected", "واتساب غير متصل");

    // Subscription
    const expInDays = sub.expiresAt ? Math.round((new Date(sub.expiresAt).getTime() - now) / 86_400_000) : null;
    if (sub.status === "expired") add(RISK_WEIGHTS.subExpired, "sub_expired", "الاشتراك منتهٍ");
    else if (sub.status === "pending") add(RISK_WEIGHTS.subPending, "sub_pending", "الاشتراك غير مُفعّل");
    else if (sub.status === "active" && expInDays != null && expInDays >= 0 && expInDays <= 3) add(RISK_WEIGHTS.subExpiring3d, "sub_expiring_3d", `الاشتراك ينتهي خلال ${expInDays} يوم`);

    // Activity
    const recent = recentOrderMap.get(uid) ?? 0;
    const ever = everOrderMap.get(uid);
    if (recent === 0) {
      if (!ever || ever.count === 0) add(RISK_WEIGHTS.noOrdersEver, "no_orders_ever", "لا توجد طلبات على الإطلاق");
      else if (ever.last && new Date(ever.last) < twoWeeksAgo) add(RISK_WEIGHTS.inactive14d, "inactive_14d", "لا نشاط منذ أكثر من ١٤ يوم");
      else if (ever.last && new Date(ever.last) < weekAgo) add(RISK_WEIGHTS.inactive7d, "inactive_7d", "لا طلبات خلال ٧ أيام");
    }

    // Payment failures (capped)
    const fails = failMap.get(uid) ?? 0;
    if (fails > 0) add(Math.min(fails * RISK_WEIGHTS.paymentFailure, RISK_WEIGHTS.paymentFailureCap), "payment_failure", `${fails} محاولة دفع فاشلة`);

    // Open incidents (capped)
    const incs = incMap.get(uid) ?? 0;
    if (incs > 0) add(Math.min(incs * RISK_WEIGHTS.openIncident, RISK_WEIGHTS.openIncidentCap), "open_incident", `${incs} حادثة مفتوحة`);

    if (score > 100) score = 100;
    if (score < minScore) continue;

    const u = userMap.get(uid);
    reasons.sort((a, b) => b.points - a.points);
    rows.push({
      userId: uid,
      email: u?.email ?? null,
      name: u?.name ?? null,
      score,
      level: levelFor(score),
      reasons,
      recommendedAction: recommend(reasons),
    });
  }

  rows.sort((a, b) => b.score - a.score);

  return { generatedAt: new Date(now).toISOString(), windowDays, cohort: subs.length, rows };
}

export function riskLevelMeta(level: RiskLevel): { label: string; text: string; bg: string; border: string } {
  switch (level) {
    case "critical": return { label: "حرج", text: "text-rose-300", bg: "bg-rose-500/[0.08]", border: "border-rose-500/30" };
    case "high": return { label: "مرتفع", text: "text-orange-300", bg: "bg-orange-500/[0.08]", border: "border-orange-500/25" };
    case "medium": return { label: "متوسط", text: "text-amber-300", bg: "bg-amber-500/[0.08]", border: "border-amber-500/25" };
    case "low": return { label: "منخفض", text: "text-emerald-300", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/25" };
  }
}
