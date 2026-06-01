// AI Sales OS — Funnel Conversion analytics (read-only, bounded).
//
// A cohort funnel: of the WhatsApp contacts acquired in the window, how far
// did they progress? Visitors → Conversations Started → Leads → Qualified
// Leads → Orders Created → Paid Orders → Repeat Customers. Order facts come
// from the Order table via getOrderRollup (the denormalized counters are 0).

import { prisma } from "@/lib/db";
import { getOrderRollup } from "./order-rollup";

const DAY = 86_400_000;
const MAX_COHORT = 50_000;
const PAID_SQL = "('confirmed','preparing','shipped','out_for_delivery','delivered')";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionFromPrev: number | null; // % of previous stage that reached this one
  dropOffFromPrev: number | null; // 100 - conversion
}

export interface FunnelResult {
  days: number;
  generatedAt: string;
  stages: FunnelStage[];
  metrics: {
    closeRatePct: number; // paid orders / qualified leads
    repeatPurchasePct: number; // repeat buyers / customers who ordered
    overallConversionPct: number; // paid orders / visitors
    avgResponseMins: number | null;
    avgTimeToCloseHours: number | null;
  };
  topChannel: { label: string; count: number } | null;
  topProduct: { name: string; qty: number } | null;
  topLosingStage: { label: string; dropOffPct: number } | null;
  truncated: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  auto: "محادثة واتساب",
  manual: "إدخال يدوي",
  external: "متجر إلكتروني",
};

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export async function computeFunnel(userId: string, days = 30): Promise<FunnelResult> {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);

  const [cohort, rollup, msgRows, topProductRows] = await Promise.all([
    // Cohort = contacts acquired in the window.
    prisma.customer.findMany({
      where: { userId, createdAt: { gte: since } },
      select: {
        id: true,
        leadScore: true,
        conversionScore: true,
        lastIntent: true,
        inboundCount: true,
        firstInboundAt: true,
        createdAt: true,
      },
      take: MAX_COHORT + 1,
    }),
    // Order facts for the whole account (cohort customers looked up in here).
    getOrderRollup(userId, { now }),
    // Bounded message sample (window) to estimate avg first-response time.
    prisma.message.findMany({
      where: { createdAt: { gte: since }, conversation: { customer: { userId } } },
      select: { conversationId: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 3000,
    }),
    // Top converting product in the window (paid orders only).
    prisma.$queryRawUnsafe<{ name: string; qty: number }[]>(
      `SELECT oi.name AS name, SUM(oi.quantity) AS qty
       FROM OrderItem oi JOIN "Order" o ON o.id = oi.orderId
       WHERE o.userId = ? AND o.createdAt >= ? AND o.status IN ${PAID_SQL}
       GROUP BY oi.name ORDER BY qty DESC LIMIT 1`,
      userId,
      since.getTime(), // SQLite stores DateTime as epoch-ms for raw queries
    ).catch(() => [] as { name: string; qty: number }[]),
  ]);

  const truncated = cohort.length > MAX_COHORT || rollup.truncated;
  const rows = cohort.slice(0, MAX_COHORT);

  // ---- Stage counts (customer counts within the cohort) ----
  let visitors = rows.length;
  let conversations = 0;
  let leads = 0;
  let qualified = 0;
  let ordered = 0;
  let paid = 0;
  let repeat = 0;

  const channelTally = new Map<string, number>();
  let closeTimeSum = 0;
  let closeTimeN = 0;

  for (const c of rows) {
    const stats = rollup.byCustomer.get(c.id);
    const hasOrder = !!stats && stats.orders >= 1;
    const hasPaid = !!stats && stats.paidOrders >= 1;

    // Stages are nested subsets so the funnel is monotonic. Placing an order
    // proves intent, so a buyer always counts as a conversation/lead/qualified
    // regardless of their estimated scores.
    const started = (c.inboundCount || 0) >= 1 || hasOrder;
    if (started) conversations++;
    const isLead = started && (hasOrder || (c.leadScore || 0) >= 40 || c.lastIntent === "buy" || c.lastIntent === "inquiry");
    if (isLead) leads++;
    const isQualified = isLead && (hasOrder || (c.leadScore || 0) >= 70 || (c.conversionScore || 0) >= 60);
    if (isQualified) qualified++;

    if (hasOrder && stats) {
      ordered++;
      // "Repeat" sits below "Paid" in the funnel, so it must be a subset of
      // paid buyers — count ≥2 PAID orders (not just any orders). Otherwise a
      // customer with 2 pending/unpaid orders would make repeat > paid.
      if (stats.paidOrders >= 2) repeat++;
      // time-to-close: first order vs first contact
      const start = c.firstInboundAt || c.createdAt;
      if (stats.firstOrderAt && start && stats.firstOrderAt > start) {
        closeTimeSum += stats.firstOrderAt.getTime() - new Date(start).getTime();
        closeTimeN++;
      }
      for (const src of stats.sources) {
        const label = SOURCE_LABEL[src] || src;
        channelTally.set(label, (channelTally.get(label) || 0) + 1);
      }
    }
    if (hasPaid) paid++;
  }

  const stageDefs: { key: string; label: string; count: number }[] = [
    { key: "visitors", label: "الزوار", count: visitors },
    { key: "conversations", label: "محادثات بدأت", count: conversations },
    { key: "leads", label: "عملاء محتملون", count: leads },
    { key: "qualified", label: "محتملون مؤهلون", count: qualified },
    { key: "orders", label: "طلبات أُنشئت", count: ordered },
    { key: "paid", label: "طلبات مدفوعة", count: paid },
    { key: "repeat", label: "عملاء متكررون", count: repeat },
  ];

  const stages: FunnelStage[] = stageDefs.map((s, i) => {
    if (i === 0) return { ...s, conversionFromPrev: null, dropOffFromPrev: null };
    const prev = stageDefs[i - 1].count;
    const conv = pct(s.count, prev);
    return { ...s, conversionFromPrev: conv, dropOffFromPrev: Math.round((100 - conv) * 10) / 10 };
  });

  // ---- Top losing stage (largest drop-off among stages with a non-empty prev) ----
  let topLosingStage: FunnelResult["topLosingStage"] = null;
  for (let i = 1; i < stages.length; i++) {
    if (stageDefs[i - 1].count <= 0) continue;
    const d = stages[i].dropOffFromPrev ?? 0;
    if (!topLosingStage || d > topLosingStage.dropOffPct) {
      topLosingStage = { label: stages[i].label, dropOffPct: d };
    }
  }

  // ---- Avg first-response time (bounded sample) ----
  const byConv = new Map<string, { role: string; t: number }[]>();
  for (const m of msgRows) {
    const arr = byConv.get(m.conversationId) || [];
    arr.push({ role: m.role, t: new Date(m.createdAt).getTime() });
    byConv.set(m.conversationId, arr);
  }
  let respSum = 0;
  let respN = 0;
  for (const arr of byConv.values()) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].role !== "user") continue;
      // find next agent (assistant/admin) message
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j].role === "assistant" || arr[j].role === "admin") {
          const gap = arr[j].t - arr[i].t;
          if (gap > 0 && gap <= DAY) {
            respSum += gap;
            respN++;
          }
          break;
        }
      }
    }
  }
  const avgResponseMins = respN > 0 ? Math.round(respSum / respN / 60000) : null;
  const avgTimeToCloseHours = closeTimeN > 0 ? Math.round(closeTimeSum / closeTimeN / 3_600_000) : null;

  // ---- Top channel ----
  let topChannel: FunnelResult["topChannel"] = null;
  for (const [label, count] of channelTally) {
    if (!topChannel || count > topChannel.count) topChannel = { label, count };
  }

  const topProduct =
    topProductRows && topProductRows[0]
      ? { name: String(topProductRows[0].name || "—"), qty: Number(topProductRows[0].qty || 0) }
      : null;

  return {
    days,
    generatedAt: now.toISOString(),
    stages,
    metrics: {
      closeRatePct: pct(paid, qualified),
      repeatPurchasePct: pct(repeat, ordered),
      overallConversionPct: pct(paid, visitors),
      avgResponseMins,
      avgTimeToCloseHours,
    },
    topChannel,
    topProduct,
    topLosingStage,
    truncated,
  };
}
