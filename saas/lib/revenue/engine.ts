// Revenue Assistant Pro — deterministic revenue intelligence.
//
// Computes from REAL data: Order (revenue windows) + Customer aggregate fields
// (lastOrderAt, totalOrderValue, orderCount, loyaltyScore). Produces revenue
// health/score, churn rate, repeat rate, average + predicted LTV, cohort
// retention, top customers with per-customer churn risk, and optimization
// recommendations. ML revenue/churn FORECASTING (trained model) is a trend
// projection here → the model-backed forecast is READY FOR CONFIGURATION.
import { prisma } from "@/lib/db";
import { resolveBusinessContext } from "@/lib/business-context";

// Revenue eligibility: only counted for completed transactions, not pending/returned/refunded/canceled
export const REVENUE_ELIGIBLE_STATUSES = [
  "confirmed",
  "preparing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const DAY = 86_400_000;
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

export async function computeRevenue(userId: string) {
  const now = Date.now();
  const d30 = new Date(now - 30 * DAY);
  const d60 = new Date(now - 60 * DAY);

  const [rev30Agg, revPrevAgg, customers] = await Promise.all([
    prisma.order.aggregate({
      _sum: { total: true },
      where: { userId, status: { in: REVENUE_ELIGIBLE_STATUSES }, createdAt: { gte: d30 } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { userId, status: { in: REVENUE_ELIGIBLE_STATUSES }, createdAt: { gte: d60, lt: d30 } },
    }),
    prisma.customer.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        phone: true,
        totalOrderValue: true,
        orderCount: true,
        lastOrderAt: true,
        loyaltyScore: true,
        createdAt: true,
      },
    }),
  ]);

  const revenue30d = rev30Agg._sum.total || 0;
  const revenuePrev30d = revPrevAgg._sum.total || 0;
  const ordered = customers.filter((c) => c.orderCount >= 1);
  const ever = ordered.length;
  const activeRecent = ordered.filter(
    (c) => c.lastOrderAt && c.lastOrderAt.getTime() >= now - 30 * DAY,
  ).length;
  const repeat = ordered.filter((c) => c.orderCount >= 2).length;
  const churnRate = ever > 0 ? clamp(((ever - activeRecent) / ever) * 100) : 0;
  const repeatRate = ever > 0 ? clamp((repeat / ever) * 100) : 0;
  const avgLtv =
    ever > 0 ? Math.round(ordered.reduce((s, c) => s + c.totalOrderValue, 0) / ever) : 0;
  const growth = revenuePrev30d > 0 ? (revenue30d - revenuePrev30d) / revenuePrev30d : 0;
  const forecastNext30d = Math.max(0, Math.round(revenue30d + (revenue30d - revenuePrev30d)));
  const revenueHealth = clamp(
    repeatRate * 0.4 + (100 - churnRate) * 0.4 + clamp((growth + 1) * 50) * 0.2,
  );
  const revenueScore = clamp(0.45 * revenueHealth + 0.3 * (100 - churnRate) + 0.25 * repeatRate);

  await prisma.revenueSnapshot.create({
    data: {
      userId,
      revenue30d,
      revenuePrev30d,
      everCustomers: ever,
      activeCustomers: activeRecent,
      churnRate,
      repeatRate,
      avgLtv,
      revenueHealth,
      revenueScore,
      forecastNext30d,
    },
  });

  return {
    revenue30d,
    revenuePrev30d,
    everCustomers: ever,
    activeCustomers: activeRecent,
    churnRate,
    repeatRate,
    avgLtv,
    revenueHealth,
    revenueScore,
    forecastNext30d,
    mlForecast: "READY_FOR_CONFIGURATION",
  };
}

/** Per-customer churn label from order recency. */
function churnLabel(c: { lastOrderAt: Date | null; orderCount: number }, now: number) {
  if (c.orderCount === 0) return { risk: "none", days: null as number | null };
  const days = c.lastOrderAt ? Math.floor((now - c.lastOrderAt.getTime()) / DAY) : 999;
  if (days > 90) return { risk: "high", days };
  if (days > 30) return { risk: "medium", days };
  return { risk: "low", days };
}

export async function getRevenue(userId: string) {
  const now = Date.now();
  const [snapshot, history, customers] = await Promise.all([
    prisma.revenueSnapshot.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.revenueSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.customer.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        phone: true,
        totalOrderValue: true,
        orderCount: true,
        lastOrderAt: true,
        loyaltyScore: true,
        createdAt: true,
      },
    }),
  ]);

  const ordered = customers.filter((c) => c.orderCount >= 1);

  // Cohorts by signup month (last 6 months) with repeat-retention.
  const cohortMap = new Map<string, { size: number; ordered: number; repeated: number }>();
  for (const c of customers) {
    const k = monthKey(c.createdAt);
    const e = cohortMap.get(k) || { size: 0, ordered: 0, repeated: 0 };
    e.size++;
    if (c.orderCount >= 1) e.ordered++;
    if (c.orderCount >= 2) e.repeated++;
    cohortMap.set(k, e);
  }
  const cohorts = Array.from(cohortMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .map(([month, e]) => ({
      month,
      size: e.size,
      ordered: e.ordered,
      repeated: e.repeated,
      retentionPct: e.ordered ? Math.round((e.repeated / e.ordered) * 100) : 0,
    }));

  // Top customers by LTV with churn risk + predicted LTV.
  const topCustomers = ordered
    .slice()
    .sort((a, b) => b.totalOrderValue - a.totalOrderValue)
    .slice(0, 10)
    .map((c) => {
      const ch = churnLabel(c, now);
      const predictedLtv = Math.round(c.totalOrderValue * (1 + c.loyaltyScore / 100));
      return {
        name: c.name || c.phone,
        ltv: c.totalOrderValue,
        predictedLtv,
        orders: c.orderCount,
        churnRisk: ch.risk,
        daysSinceOrder: ch.days,
      };
    });

  // Business-type module gate: the upsell/cross-sell recommendations are
  // product-framed ("موديل أعلى"، "منتجات مكمّلة"). Suppress them for tenants
  // whose products module is OFF (Software/Services). Recovery is neutral and
  // always kept. Fail-safe: any error → products ON so Store output is
  // byte-identical.
  let productsEnabled = true;
  try {
    productsEnabled = (await resolveBusinessContext(userId)).modules.products;
  } catch {
    productsEnabled = true;
  }

  // Optimization recommendations.
  const upsell = ordered.filter((c) => c.orderCount === 1);
  const recovery = ordered.filter((c) => {
    const ch = churnLabel(c, now);
    return ch.risk === "medium";
  });
  const crossSell = ordered.filter((c) => c.orderCount >= 2);
  const recommendations = [
    {
      type: "upsell",
      label: "ترقية البيع",
      count: productsEnabled ? upsell.length : 0,
      action: "اعرض موديلاً أعلى أو باقة أكبر لمن اشترى مرة واحدة.",
    },
    {
      type: "recovery",
      label: "حملة استرجاع",
      count: recovery.length,
      action: "تواصل مع من لم يطلبوا منذ 30–90 يوماً بعرض خاص.",
    },
    {
      type: "cross_sell",
      label: "بيع متقاطع",
      count: productsEnabled ? crossSell.length : 0,
      action: "اعرض منتجات مكمّلة للعملاء المتكررين.",
    },
  ].filter((r) => r.count > 0);

  return {
    snapshot,
    history: history.slice().reverse(),
    revenueTrend: history
      .slice()
      .reverse()
      .map((h) => h.revenue30d),
    cohorts,
    topCustomers,
    recommendations,
    mlForecast: "READY_FOR_CONFIGURATION",
  };
}
