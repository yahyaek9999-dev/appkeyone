// Smart Monitoring Pro — anomaly detection + risk engine + alerting.
//
// Deterministic, computed from REAL tenant data (orders, customers, escalation
// tickets, provider usage, broadcasts) by comparing the last 7 days to the
// prior 7 days. Generates risk scores, a business-health score, and alerts
// (open→resolved). ML-based forecasting is a projection here; a trained model
// is READY FOR CONFIGURATION.
import { prisma } from "@/lib/db";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const DAY = 86_400_000;

export async function runScan(userId: string) {
  const now = Date.now();
  const wk = new Date(now - 7 * DAY);
  const wk2 = new Date(now - 14 * DAY);
  const mo = new Date(now - 30 * DAY);
  const wkDay = new Date(now - 7 * DAY).toISOString().slice(0, 10);

  const [
    ordersNow,
    ordersPrev,
    salesNowAgg,
    salesPrevAgg,
    custNow,
    custPrev,
    escNow,
    escPrev,
    aiAgg,
    everCusts,
    activeCusts,
    bcs,
  ] = await Promise.all([
    prisma.order.count({ where: { userId, createdAt: { gte: wk } } }),
    prisma.order.count({ where: { userId, createdAt: { gte: wk2, lt: wk } } }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { userId, status: { not: "canceled" }, createdAt: { gte: wk } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { userId, status: { not: "canceled" }, createdAt: { gte: wk2, lt: wk } },
    }),
    prisma.customer.count({ where: { userId, createdAt: { gte: wk } } }),
    prisma.customer.count({ where: { userId, createdAt: { gte: wk2, lt: wk } } }),
    (prisma as any).escalationTicket.count({ where: { userId, createdAt: { gte: wk } } }),
    (prisma as any).escalationTicket.count({ where: { userId, createdAt: { gte: wk2, lt: wk } } }),
    (prisma as any).providerUsage.aggregate({
      _sum: { calls: true, failures: true },
      where: { userId, day: { gte: wkDay } },
    }),
    prisma.order.findMany({
      where: { userId },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    prisma.order.findMany({
      where: { userId, createdAt: { gte: mo } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    prisma.broadcast.findMany({
      where: { userId, createdAt: { gte: mo } },
      select: { sent: true, failed: true },
    }),
  ]);

  const salesNow = salesNowAgg._sum.total || 0;
  const salesPrev = salesPrevAgg._sum.total || 0;
  const aiCalls = aiAgg._sum.calls || 0;
  const aiFailures = aiAgg._sum.failures || 0;

  // ---- Risk engine (0-100, higher = worse) ----
  const ordersDrop = ordersPrev > 0 ? (ordersPrev - ordersNow) / ordersPrev : 0;
  const salesDrop = salesPrev > 0 ? (salesPrev - salesNow) / salesPrev : 0;
  const revenueRisk = clamp(Math.max(ordersDrop, salesDrop) * 100);
  const ever = everCusts.length;
  const active = activeCusts.length;
  const churnRisk = ever > 0 ? clamp(((ever - active) / ever) * 100) : 0;
  const openEsc = await (prisma as any).escalationTicket.count({
    where: { userId, status: { in: ["open", "acknowledged", "human_active"] } },
  });
  const serviceRisk = clamp(openEsc * 12);
  const bcSent = bcs.reduce((s, b) => s + b.sent, 0);
  const bcFailed = bcs.reduce((s, b) => s + b.failed, 0);
  const campaignRisk = bcSent + bcFailed > 0 ? clamp((bcFailed / (bcSent + bcFailed)) * 100) : 0;
  const aiRisk = aiCalls > 0 ? clamp((aiFailures / aiCalls) * 100) : 0;
  const businessHealth = clamp(
    100 - (revenueRisk + churnRisk + serviceRisk + campaignRisk + aiRisk) / 5,
  );

  // ---- Anomaly → alert generation (dedup against existing OPEN by type) ----
  const existing = await prisma.monitoringAlert.findMany({
    where: { userId, status: "open" },
    select: { type: true },
  });
  const openTypes = new Set(existing.map((e) => e.type));
  const candidates: {
    type: string;
    severity: string;
    title: string;
    message: string;
    metric: string;
    value: number;
    baseline: number;
  }[] = [];
  if (ordersPrev >= 3 && revenueRisk >= 40)
    candidates.push({
      type: "sales_drop",
      severity: "high",
      title: "هبوط في المبيعات",
      message: `الطلبات انخفضت من ${ordersPrev} إلى ${ordersNow} مقارنة بالأسبوع السابق.`,
      metric: "orders",
      value: ordersNow,
      baseline: ordersPrev,
    });
  if (custPrev >= 3 && custNow < custPrev * 0.6)
    candidates.push({
      type: "lead_drop",
      severity: "medium",
      title: "انخفاض العملاء الجدد",
      message: `العملاء الجدد انخفضوا من ${custPrev} إلى ${custNow}.`,
      metric: "new_customers",
      value: custNow,
      baseline: custPrev,
    });
  if (escNow >= 3 && escNow > escPrev * 1.5)
    candidates.push({
      type: "escalation_spike",
      severity: "high",
      title: "ارتفاع التصعيدات",
      message: `التصعيدات ارتفعت من ${escPrev} إلى ${escNow}.`,
      metric: "escalations",
      value: escNow,
      baseline: escPrev,
    });
  if (aiRisk >= 20)
    candidates.push({
      type: "ai_failure",
      severity: "high",
      title: "ارتفاع أعطال الذكاء",
      message: `معدّل فشل استدعاءات الذكاء ${aiRisk}% (${aiFailures}/${aiCalls}).`,
      metric: "ai_failures",
      value: aiFailures,
      baseline: aiCalls,
    });
  if (campaignRisk >= 20)
    candidates.push({
      type: "broadcast_failure",
      severity: "medium",
      title: "فشل في حملات البث",
      message: `نسبة فشل البث ${campaignRisk}% (${bcFailed}/${bcSent + bcFailed}).`,
      metric: "broadcast",
      value: bcFailed,
      baseline: bcSent + bcFailed,
    });
  if (churnRisk >= 50)
    candidates.push({
      type: "churn_risk",
      severity: "high",
      title: "خطر تسرّب العملاء",
      message: `${churnRisk}% من عملائك لم يطلبوا خلال آخر 30 يوماً.`,
      metric: "churn",
      value: churnRisk,
      baseline: 100,
    });
  if (serviceRisk >= 40)
    candidates.push({
      type: "service_risk",
      severity: "medium",
      title: "ضغط على الخدمة",
      message: `${openEsc} تذكرة تصعيد مفتوحة بحاجة لمتابعة.`,
      metric: "open_escalations",
      value: openEsc,
      baseline: 0,
    });

  let alertsCreated = 0;
  for (const c of candidates) {
    if (openTypes.has(c.type)) continue;
    await prisma.monitoringAlert.create({ data: { userId, ...c } });
    alertsCreated++;
  }

  await prisma.monitoringSnapshot.create({
    data: {
      userId,
      salesNow,
      salesPrev,
      ordersNow,
      ordersPrev,
      newCustomersNow: custNow,
      newCustomersPrev: custPrev,
      escalationsNow: escNow,
      escalationsPrev: escPrev,
      aiCalls,
      aiFailures,
      businessHealth,
      revenueRisk,
      churnRisk,
      serviceRisk,
      campaignRisk,
      aiRisk,
    },
  });

  // Naive deterministic projection (next 7 days = current trend).
  const projectedOrders = Math.max(0, Math.round(ordersNow + (ordersNow - ordersPrev)));
  return {
    metrics: {
      ordersNow,
      ordersPrev,
      salesNow,
      salesPrev,
      newCustomersNow: custNow,
      newCustomersPrev: custPrev,
      escalationsNow: escNow,
      escalationsPrev: escPrev,
      aiCalls,
      aiFailures,
    },
    risks: { revenueRisk, churnRisk, serviceRisk, campaignRisk, aiRisk },
    businessHealth,
    alertsCreated,
    prediction: { projectedOrdersNext7d: projectedOrders, mlForecast: "READY_FOR_CONFIGURATION" },
  };
}

export async function getMonitoring(userId: string) {
  const [snapshot, history, openAlerts, resolvedAlerts] = await Promise.all([
    prisma.monitoringSnapshot.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.monitoringSnapshot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.monitoringAlert.findMany({
      where: { userId, status: "open" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.monitoringAlert.findMany({
      where: { userId, status: "resolved" },
      orderBy: { resolvedAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    snapshot,
    history: history.slice().reverse(),
    openAlerts,
    resolvedAlerts,
    healthTrend: history
      .slice()
      .reverse()
      .map((h) => h.businessHealth),
  };
}

export async function resolveAlert(userId: string, id: string) {
  const upd = await prisma.monitoringAlert.updateMany({
    where: { id, userId, status: "open" },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  return { ok: upd.count > 0 };
}
