// Customer Success — an actionable Admin queue derived from real signals.
// Not a CRM: each item is a concrete "who to contact and why", linking to
// Tenant 360. Bounded + batched (no per-tenant loop).

import { prisma } from "@/lib/db";

export type CsCategory =
  | "never_connected_wa"
  | "trial_expiring"
  | "sub_expiring"
  | "payment_failed"
  | "inactive"
  | "new_tenant";

export type CsUrgency = "high" | "medium" | "low";

export type CsItem = {
  category: CsCategory;
  urgency: CsUrgency;
  userId: string;
  email: string | null;
  name: string | null;
  reason: string;
  data: string;
  recommendedAction: string;
};

export type CsResult = { generatedAt: string; counts: Record<string, number>; items: CsItem[] };

const CATEGORY_LABEL: Record<CsCategory, string> = {
  never_connected_wa: "لم يربط واتساب",
  trial_expiring: "تجربة تنتهي قريباً",
  sub_expiring: "اشتراك ينتهي قريباً",
  payment_failed: "دفعة فاشلة",
  inactive: "غير نشط",
  new_tenant: "تاجر جديد",
};

export async function getCustomerSuccessQueue(opts: { take?: number } = {}): Promise<CsResult> {
  const take = Math.min(500, opts.take ?? 300);
  const now = Date.now();
  const soon3 = new Date(now + 3 * 86_400_000);
  const weekAgo = new Date(now - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now - 14 * 86_400_000);
  const threeDaysAgo = new Date(now - 3 * 86_400_000);

  const subs = await prisma.subscription
    .findMany({
      where: { status: { in: ["active", "trial"] } },
      select: { userId: true, status: true, expiresAt: true, trialEndsAt: true },
      take,
    })
    .catch(() => []);
  if (!subs.length) return { generatedAt: new Date(now).toISOString(), counts: {}, items: [] };

  const userIds = subs.map((s) => s.userId);

  const [users, bots, recentOrders, everOrders, failedPays] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, createdAt: true } }).catch(() => []),
    prisma.bot.findMany({ where: { userId: { in: userIds } }, select: { userId: true, whatsappStatus: true } }).catch(() => []),
    prisma.order.groupBy({ by: ["userId"], where: { userId: { in: userIds }, createdAt: { gte: weekAgo } }, _count: { _all: true } }).catch(() => [] as any[]),
    prisma.order.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: { _all: true }, _max: { createdAt: true } }).catch(() => [] as any[]),
    prisma.paymentTransaction.groupBy({ by: ["userId"], where: { userId: { in: userIds }, status: "failed", createdAt: { gte: new Date(now - 30 * 86_400_000) } }, _count: { _all: true } }).catch(() => [] as any[]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const waMap = new Map(bots.map((b) => [b.userId, b.whatsappStatus]));
  const recentOrderMap = new Map((recentOrders as any[]).map((r) => [r.userId, r._count._all]));
  const everOrderMap = new Map((everOrders as any[]).map((r) => [r.userId, { count: r._count._all, last: r._max?.createdAt as Date | null }]));
  const failMap = new Map((failedPays as any[]).map((r) => [r.userId, r._count._all]));

  const items: CsItem[] = [];
  const push = (category: CsCategory, urgency: CsUrgency, uid: string, reason: string, data: string, action: string) => {
    const u = userMap.get(uid);
    items.push({ category, urgency, userId: uid, email: u?.email ?? null, name: u?.name ?? null, reason, data, recommendedAction: action });
  };

  for (const sub of subs) {
    const uid = sub.userId;
    const u = userMap.get(uid);
    const wa = waMap.get(uid);

    // New tenant (created within 3 days)
    if (u?.createdAt && new Date(u.createdAt) >= threeDaysAgo) {
      push("new_tenant", "medium", uid, "تاجر جديد خلال ٣ أيام", new Date(u.createdAt).toLocaleDateString("ar-EG"), "رحّب وتابع خطوات الإعداد.");
    }

    // Never connected WhatsApp
    if (wa !== "connected") {
      push("never_connected_wa", "high", uid, "لم يتم ربط واتساب", `الحالة: ${wa ?? "—"}`, "ساعد التاجر على ربط واتساب.");
    }

    // Trial expiring
    if (sub.status === "trial" && sub.trialEndsAt) {
      const end = new Date(sub.trialEndsAt);
      if (end <= soon3 && end.getTime() >= now) {
        const days = Math.ceil((end.getTime() - now) / 86_400_000);
        push("trial_expiring", "high", uid, `التجربة تنتهي خلال ${days} يوم`, end.toLocaleDateString("ar-EG"), "تواصل للترقية قبل انتهاء التجربة.");
      }
    }

    // Subscription expiring
    if (sub.status === "active" && sub.expiresAt) {
      const end = new Date(sub.expiresAt);
      if (end <= soon3 && end.getTime() >= now) {
        const days = Math.ceil((end.getTime() - now) / 86_400_000);
        push("sub_expiring", "high", uid, `الاشتراك ينتهي خلال ${days} يوم`, end.toLocaleDateString("ar-EG"), "تواصل بشأن التجديد.");
      }
    }

    // Payment failed
    const fails = failMap.get(uid) ?? 0;
    if (fails > 0) push("payment_failed", "high", uid, `${fails} محاولة دفع فاشلة (٣٠ يوم)`, `${fails} محاولة`, "راجع مشكلة الدفع وتواصل مع التاجر.");

    // Inactive
    const recent = recentOrderMap.get(uid) ?? 0;
    const ever = everOrderMap.get(uid);
    if (recent === 0 && ever?.last && new Date(ever.last) < twoWeeksAgo) {
      push("inactive", "medium", uid, "لا نشاط منذ أكثر من ١٤ يوم", ever.last ? new Date(ever.last).toLocaleDateString("ar-EG") : "—", "تواصل لإعادة التفعيل.");
    }
  }

  const urgencyRank: Record<CsUrgency, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);

  const counts: Record<string, number> = {};
  for (const it of items) counts[it.category] = (counts[it.category] ?? 0) + 1;

  return { generatedAt: new Date(now).toISOString(), counts, items };
}

export function csCategoryLabel(c: CsCategory): string {
  return CATEGORY_LABEL[c] || c;
}
