// AI Command Center — flagship aggregation endpoint (read-only).
//
// This endpoint composes KEYONE's EXISTING intelligence engines into one
// executive payload. It recomputes nothing and writes nothing — it fuses:
//   - computeForecast()        → revenue/orders forecast + daily insights
//   - buildRevenueCopilot()    → ranked opportunity worklist (NBA + EGP value)
//   - getOrderRollup()         → true order facts (revenue today, AOV, repeat)
//   - detectLostCustomers()    → at-risk / recovery candidates
//
// Every section is independently try/caught so one failing engine degrades that
// card to empty rather than 500-ing the whole page (Phase 0 reliability rule).
//
// The headline "recommendations" are derived here: each one carries the four
// fields the mission requires — insight, why, expectedImpact, action(href) —
// grounded in the numbers the engines returned (no fabricated figures).

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";
import { prisma } from "@/lib/db";
import { computeForecast } from "@/lib/analytics/forecast";
import { getOrderRollup } from "@/lib/analytics/order-rollup";
import { buildRevenueCopilot } from "@/lib/intelligence/revenue-opportunity";
import { detectLostCustomers } from "@/lib/intel/lost-customers";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export interface CommandRecommendation {
  id: string;
  // The four mission-mandated fields:
  insight: string; // WHAT we observed
  why: string; // WHY it matters / what caused it
  expectedImpact: string; // expected business outcome (grounded in real numbers)
  // One-click action — a destination + label the UI turns into a button.
  actionLabel: string;
  actionHref: string;
  // triage metadata
  severity: "high" | "medium" | "low";
  estimatedValue: number; // EGP, 0 when not monetizable
}

export async function GET() {
  const gate = await apiGate("advanced_analytics");
  if (gate.response) return gate.response;
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const now = new Date();

  // ---- Compose existing engines in parallel; each degrades independently ----
  const [forecast, copilot, rollup, lost, todayOrders, abandonedCarts] =
    await Promise.all([
      computeForecast(uid).catch(() => null),
      buildRevenueCopilot(uid, { now }).catch(() => null),
      getOrderRollup(uid, { now }).catch(() => null),
      detectLostCustomers(uid, now).catch(() => [] as any[]),
      // Revenue today — sum of today's non-canceled orders (whole EGP).
      prisma.order
        .findMany({
          where: {
            userId: uid,
            status: { not: "canceled" },
            createdAt: { gte: new Date(now.getTime() - DAY) },
          },
          select: { total: true, createdAt: true, status: true },
          take: 5000,
        })
        .catch(() => [] as { total: number | null; createdAt: Date; status: string }[]),
      // Abandoned carts ≈ customers who showed buy intent but have no order and
      // went quiet 1–7 days. Bounded count — a cheap signal for the headline.
      prisma.customer
        .count({
          where: {
            userId: uid,
            orderCount: 0,
            lastIntent: "buy",
            lastInboundAt: {
              lte: new Date(now.getTime() - DAY),
              gte: new Date(now.getTime() - 7 * DAY),
            },
          } as any,
        })
        .catch(() => 0),
    ]);

  // ---- Revenue today (and a same-window order count) ----
  const revenueToday = (todayOrders as any[]).reduce(
    (s, o) => s + (o.total || 0),
    0,
  );
  const ordersToday = (todayOrders as any[]).length;

  // ---- At-risk customers: top lost-customer candidates by urgency ----
  const atRisk = (lost as any[])
    .slice(0, 8)
    .map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      customerPhone: c.customerPhone,
      reason: c.reason,
      urgency: c.urgency,
      daysSinceLastMsg: c.daysSinceLastMsg ?? null,
    }));

  // ---- Best customers: top revenue from the rollup ----
  const bestCustomerIds: { id: string; revenue: number; orders: number }[] = [];
  if (rollup) {
    for (const [id, s] of rollup.byCustomer.entries()) {
      bestCustomerIds.push({ id, revenue: s.revenue, orders: s.orders });
    }
    bestCustomerIds.sort((a, b) => b.revenue - a.revenue);
  }
  const topIds = bestCustomerIds.slice(0, 5).map((b) => b.id);
  const topCustomerRows = topIds.length
    ? await prisma.customer
        .findMany({
          where: { id: { in: topIds } },
          select: { id: true, name: true, phone: true },
        })
        .catch(() => [])
    : [];
  const nameById = new Map(topCustomerRows.map((c) => [c.id, c]));
  const bestCustomers = bestCustomerIds.slice(0, 5).map((b) => ({
    customerId: b.id,
    customerName: nameById.get(b.id)?.name ?? null,
    customerPhone: nameById.get(b.id)?.phone ?? "",
    revenue: b.revenue,
    orders: b.orders,
  }));

  // ---- Headline recommendations (each: insight / why / impact / action) -----
  const recommendations: CommandRecommendation[] = [];

  // 1) High-value opportunity pipeline (from the copilot).
  if (copilot && copilot.opportunityCount > 0) {
    recommendations.push({
      id: "pipeline",
      insight: `${copilot.opportunityCount} فرصة بيع جاهزة للعمل عليها الآن`,
      why: `محرّك الإيرادات رتّب عملاءك حسب النية والقيمة — منهم ${copilot.opportunities.filter((o) => o.confidence >= 60).length} فرصة بثقة عالية.`,
      expectedImpact: `قيمة تقديرية على الطاولة: ${fmt(copilot.totalPipelineValue)} ج.م (${fmt(copilot.highConfidenceValue)} ج.م بثقة عالية)`,
      actionLabel: "افتح قائمة العمل",
      actionHref: "/dashboard/revenue-copilot",
      severity: copilot.highConfidenceValue > 0 ? "high" : "medium",
      estimatedValue: copilot.totalPipelineValue,
    });
  }

  // 2) Recovery / at-risk customers.
  if (atRisk.length > 0) {
    const topUrgent = atRisk.filter((c) => c.urgency >= 60).length;
    recommendations.push({
      id: "recovery",
      insight: `${atRisk.length}+ عميل أظهروا اهتماماً ثم ابتعدوا`,
      why: `${topUrgent || atRisk.length} منهم في نافذة الاستعادة الحرجة — كل يوم تأخير يقلّل فرصة عودتهم.`,
      expectedImpact: rollup?.totals.aov
        ? `استعادة ربعهم فقط ≈ ${fmt(Math.round((atRisk.length / 4) * rollup.totals.aov))} ج.م`
        : "استعادتهم تحمي إيراداً متكرراً",
      actionLabel: "ابدأ الاستعادة",
      actionHref: "/dashboard/recovery",
      severity: topUrgent > 0 ? "high" : "medium",
      estimatedValue: rollup?.totals.aov
        ? Math.round((atRisk.length / 4) * rollup.totals.aov)
        : 0,
    });
  }

  // 3) Abandoned carts.
  if (abandonedCarts > 0) {
    recommendations.push({
      id: "abandoned",
      insight: `${abandonedCarts} عميل أبدوا نية شراء بدون إتمام طلب`,
      why: "أظهروا نية الشراء في آخر محادثة لكن لم يكملوا — رسالة متابعة واحدة غالباً تكفي.",
      expectedImpact: rollup?.totals.aov
        ? `كل عميل يكمل ≈ ${fmt(rollup.totals.aov)} ج.م`
        : "إتمام الطلبات يرفع إيراد اليوم مباشرة",
      actionLabel: "تابِع العملاء",
      actionHref: "/dashboard/recovery",
      severity: "medium",
      estimatedValue: rollup?.totals.aov ? abandonedCarts * rollup.totals.aov : 0,
    });
  }

  // 4) Forecast-driven prep (slow day / peak day).
  if (forecast) {
    if (forecast.growthPct < -5 && forecast.lowSalesDays.length > 0) {
      recommendations.push({
        id: "forecast-slow",
        insight: `المبيعات المتوقعة تتباطأ (${forecast.growthPct}% مقابل الأسبوع الماضي)`,
        why: `أضعف يوم متوقع: ${forecast.lowSalesDays[0].weekday}. تجهيز عرض مسبق يعوّض الانخفاض.`,
        expectedImpact: `حملة موجّهة قد تستعيد جزءاً من ${fmt(forecast.next7Revenue)} ج.م المتوقعة هذا الأسبوع`,
        actionLabel: "جهّز حملة",
        actionHref: "/dashboard/broadcasts",
        severity: "medium",
        estimatedValue: 0,
      });
    } else if (forecast.highestDay && forecast.growthPct > 5) {
      recommendations.push({
        id: "forecast-peak",
        insight: `ذروة مبيعات متوقعة يوم ${forecast.highestDay.weekday}`,
        why: `النمو المتوقع +${forecast.growthPct}% — جهّز المخزون والعروض لاستثمار الذروة.`,
        expectedImpact: `يوم الذروة وحده ≈ ${fmt(forecast.highestDay.revenue)} ج.م متوقعة`,
        actionLabel: "راجِع التوقّع",
        actionHref: "/dashboard/revenue-forecast",
        severity: "low",
        estimatedValue: forecast.highestDay.revenue,
      });
    }
  }

  // Sort recommendations: high severity first, then by estimated value.
  const sevRank = { high: 0, medium: 1, low: 2 };
  recommendations.sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] ||
      b.estimatedValue - a.estimatedValue,
  );

  return NextResponse.json({
    generatedAt: now.toISOString(),
    revenue: {
      today: revenueToday,
      ordersToday,
      forecastNext7: forecast?.next7Revenue ?? 0,
      forecastNext30: forecast?.next30Revenue ?? 0,
      expectedOrders7: forecast?.expectedOrders7 ?? 0,
      growthPct: forecast?.growthPct ?? 0,
      aov: rollup?.totals.aov ?? forecast?.aov ?? 0,
      repeatPct: forecast?.returningCustomersPct ?? 0,
    },
    pipeline: copilot
      ? {
          opportunityCount: copilot.opportunityCount,
          totalValue: copilot.totalPipelineValue,
          highConfidenceValue: copilot.highConfidenceValue,
          // Top 6 next-best-actions for the inline worklist preview.
          top: copilot.opportunities.slice(0, 6).map((o) => ({
            customerId: o.customerId,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            action: o.action,
            title: o.title,
            reason: o.reason,
            confidence: o.confidence,
            estimatedValue: o.estimatedValue,
            valueTier: o.valueTier,
          })),
        }
      : null,
    atRisk,
    bestCustomers,
    abandonedCarts,
    insights: forecast?.insights ?? [],
    recommendations,
    // Surface partial-failure so the UI can show an honest "degraded" note
    // instead of silently rendering empty cards.
    degraded: {
      forecast: forecast === null,
      pipeline: copilot === null,
      orders: rollup === null,
    },
  });
}

function fmt(n: number): string {
  return (n || 0).toLocaleString("ar-EG");
}
