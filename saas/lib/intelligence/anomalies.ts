// Phase 4 — Real-time Business Intelligence: Anomaly / Insight Engine.
//
// WHAT THIS DOES: composes the existing read-only intelligence libraries
// (revenue forecast, order rollup, lost-customer detector, revenue copilot)
// into ONE automatic anomaly feed. It surfaces the things a merchant would
// otherwise have to notice by eye:
//   - revenue spikes / drops    (z-score & %-change over the daily series)
//   - activity / conversion drops (forecast growth signal + low-sales days)
//   - churn-risk concentration   (lost-customer cluster)
//   - revenue opportunities      (high-confidence pipeline value on the table)
//   - campaign / pipeline effectiveness (high-confidence vs total value)
//
// PURE DERIVATION. No writes. Every composed source is independently
// try/caught so one failing dependency degrades gracefully instead of
// crashing the feed. Money is whole EGP integers.

import { computeForecast, type ForecastResult } from "@/lib/analytics/forecast";
import { getOrderRollup, type OrderRollup } from "@/lib/analytics/order-rollup";
import { detectLostCustomers } from "@/lib/intel/lost-customers";
import { buildRevenueCopilot, type RevenueCopilotResult } from "@/lib/intelligence/revenue-opportunity";
import { resolveBusinessContext } from "@/lib/business-context";

export type AnomalyKind =
  | "revenue_spike"
  | "revenue_drop"
  | "activity_drop"
  | "churn_cluster"
  | "opportunity"
  | "campaign";

export type AnomalySeverity = "high" | "medium" | "low";

export interface Anomaly {
  /** unique within a single response, used as React key */
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** short Arabic headline */
  title: string;
  /** 1-2 line Arabic explanation of WHY this fired */
  detail: string;
  /** the headline metric, e.g. "+42%" or "12 عميل" */
  metric: string;
  /** Arabic expected business impact */
  expectedImpact: string;
  /** Arabic action button label */
  actionLabel: string;
  /** in-app href the action button links to */
  actionHref: string;
}

export interface AnomalyReport {
  generatedAt: string;
  anomalies: Anomaly[];
  summary: {
    revenueTrend: "up" | "down" | "flat";
    riskLevel: "high" | "medium" | "low";
  };
  /** small forecast summary for the sparkline header (null if unavailable) */
  forecast: {
    history: { date: string; revenue: number }[];
    growthPct: number;
    next7Revenue: number;
    aov: number;
  } | null;
}

const EGP = (n: number) => `${Math.round(n).toLocaleString("ar-EG")} ج.م`;

// Mean + sample standard deviation of a numeric series.
function meanStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { mean, std: 0 };
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (n - 1);
  return { mean, std: Math.sqrt(variance) };
}

export async function detectAnomalies(userId: string, now: Date = new Date()): Promise<AnomalyReport> {
  // Compose the existing intel — each independently guarded so a single
  // failure never takes the whole feed down.
  const [forecast, rollup, lost, copilot, ctx] = await Promise.all([
    computeForecast(userId).catch(() => null as ForecastResult | null),
    getOrderRollup(userId, { now }).catch(() => null as OrderRollup | null),
    detectLostCustomers(userId, now).catch(() => [] as Awaited<ReturnType<typeof detectLostCustomers>>),
    buildRevenueCopilot(userId, { now }).catch(() => null as RevenueCopilotResult | null),
    resolveBusinessContext(userId).catch(() => null),
  ]);

  // Module gates for phrasing. Fail-safe: null ctx (or resolution error) → every
  // module ON, so Store tenants keep byte-identical copy.
  const inventoryEnabled = ctx ? ctx.modules.inventory : true;

  const anomalies: Anomaly[] = [];

  // ---- 1) Revenue spike / drop over the daily history series ----
  // The forecast already builds a zero-filled daily revenue history (oldest →
  // newest). We z-score the most recent COMPLETE day against the trailing
  // 7-day window before it, and also report the raw %-change.
  if (forecast && forecast.history.length >= 8) {
    const series = forecast.history.map((p) => p.revenue);
    // Last point is "today" which is usually partial; compare yesterday (the
    // last fully-closed day) against the 7 days before it for a stable read.
    const lastIdx = series.length - 1;
    const todayRev = series[lastIdx];
    const yesterdayIdx = lastIdx - 1;
    const yesterdayRev = series[yesterdayIdx] ?? 0;
    const window = series.slice(Math.max(0, yesterdayIdx - 7), yesterdayIdx);
    const { mean, std } = meanStd(window);
    const z = std > 0 ? (yesterdayRev - mean) / std : 0;
    const pct = mean > 0 ? ((yesterdayRev - mean) / mean) * 100 : yesterdayRev > 0 ? 100 : 0;

    if (mean > 0 || yesterdayRev > 0) {
      if (z >= 2 || pct >= 40) {
        const sev: AnomalySeverity = z >= 3 || pct >= 80 ? "high" : "medium";
        anomalies.push({
          id: "rev-spike",
          kind: "revenue_spike",
          severity: sev,
          title: "قفزة في الإيراد",
          detail: `إيراد آخر يوم مكتمل (${EGP(yesterdayRev)}) أعلى بوضوح من متوسط الأسبوع (${EGP(mean)}).`,
          metric: `+${Math.round(pct)}%`,
          // Inventory-framed advice only when the tenant tracks inventory.
          // Otherwise drop the "stock" clause (Software/Services vertical).
          expectedImpact: inventoryEnabled
            ? "زخم بيع قوي — استثمره بمخزون كافٍ ومتابعة سريعة قبل أن يبرد."
            : "زخم بيع قوي — استثمره بمتابعة سريعة قبل أن يبرد.",
          actionLabel: "افتح التوقّعات",
          actionHref: "/dashboard/revenue-forecast",
        });
      } else if (z <= -2 || pct <= -40) {
        const sev: AnomalySeverity = z <= -3 || pct <= -70 ? "high" : "medium";
        anomalies.push({
          id: "rev-drop",
          kind: "revenue_drop",
          severity: sev,
          title: "هبوط في الإيراد",
          detail: `إيراد آخر يوم مكتمل (${EGP(yesterdayRev)}) أقل بوضوح من متوسط الأسبوع (${EGP(mean)}).`,
          metric: `${Math.round(pct)}%`,
          expectedImpact: "تباطؤ في المبيعات — راجع العروض وأطلق متابعة للعملاء المهتمين لتعويض الفارق.",
          actionLabel: "أطلق استعادة",
          actionHref: "/dashboard/recovery",
        });
      }
    }
    void todayRev; // today is partial; kept for context, not scored
  }

  // ---- 2) Activity / conversion drop (forward-looking) ----
  // computeForecast.growthPct = projected next-7 daily avg vs last-7 actual.
  // A strongly negative projection is an early-warning activity drop.
  if (forecast) {
    if (forecast.growthPct <= -20) {
      const sev: AnomalySeverity = forecast.growthPct <= -40 ? "high" : "medium";
      anomalies.push({
        id: "activity-drop",
        kind: "activity_drop",
        severity: sev,
        title: "تراجع متوقع في النشاط",
        detail: `النموذج يتوقع انخفاض متوسط الإيراد اليومي خلال الأسبوع القادم بنسبة ${Math.abs(Math.round(forecast.growthPct))}% مقارنة بالأسبوع الماضي.`,
        metric: `${Math.round(forecast.growthPct)}%`,
        expectedImpact: "فرصة للتدخّل مبكرًا قبل أن يتحوّل التباطؤ إلى خسارة فعلية.",
        actionLabel: "راجع مساعد الإيرادات",
        actionHref: "/dashboard/revenue-copilot",
      });
    }
    // Concentrated weak days ahead → schedule a campaign.
    if (forecast.lowSalesDays.length >= 2) {
      anomalies.push({
        id: "weak-days",
        kind: "activity_drop",
        severity: "low",
        title: "أيام ضعيفة متوقعة",
        detail: `${forecast.lowSalesDays.length} أيام قادمة يُتوقّع أن تكون مبيعاتها أقل من نصف المتوسط${forecast.lowSalesDays[0] ? ` (أقربها يوم ${forecast.lowSalesDays[0].weekday})` : ""}.`,
        metric: `${forecast.lowSalesDays.length} أيام`,
        expectedImpact: "جهّز عرضًا أو حملة لهذه الأيام لرفع المبيعات المتوقعة.",
        actionLabel: "أنشئ حملة",
        actionHref: "/dashboard/broadcasts",
      });
    }
  }

  // ---- 3) Churn-risk concentration (lost-customer cluster) ----
  if (Array.isArray(lost) && lost.length > 0) {
    const highUrgency = lost.filter((l) => (l.urgency || 0) >= 60);
    const cluster = highUrgency.length >= 3 ? highUrgency : lost.length >= 5 ? lost : [];
    if (cluster.length > 0) {
      const sev: AnomalySeverity = highUrgency.length >= 6 ? "high" : highUrgency.length >= 3 ? "medium" : "low";
      anomalies.push({
        id: "churn-cluster",
        kind: "churn_cluster",
        severity: sev,
        title: "تجمّع عملاء معرّضين للفقد",
        detail: `${lost.length} عميل أبدوا اهتمامًا ثم اختفوا${highUrgency.length > 0 ? `، منهم ${highUrgency.length} بإلحاح مرتفع` : ""}.`,
        metric: `${lost.length} عميل`,
        expectedImpact: "استعادة هؤلاء أرخص من جذب عملاء جدد — تابعهم الآن قبل أن يبردوا.",
        actionLabel: "افتح الاستعادة",
        actionHref: "/dashboard/recovery",
      });
    }
  }

  // ---- 4) Revenue opportunities on the table ----
  if (copilot && copilot.opportunityCount > 0 && copilot.totalPipelineValue > 0) {
    const sev: AnomalySeverity =
      copilot.highConfidenceValue >= 5000 || copilot.opportunityCount >= 15
        ? "high"
        : copilot.highConfidenceValue >= 1000 || copilot.opportunityCount >= 5
          ? "medium"
          : "low";
    anomalies.push({
      id: "opportunity-pipeline",
      kind: "opportunity",
      severity: sev,
      title: "فرص بيع جاهزة للتنفيذ",
      detail: `${copilot.opportunityCount} فرصة بقيمة إجمالية ${EGP(copilot.totalPipelineValue)}، منها ${EGP(copilot.highConfidenceValue)} عالية الثقة.`,
      metric: EGP(copilot.totalPipelineValue),
      expectedImpact: "إيراد محتمل يمكن تحصيله بمتابعة الفرص عالية الثقة أولًا.",
      actionLabel: "افتح الفرص",
      actionHref: "/dashboard/revenue-copilot",
    });

    // ---- 5) Campaign / pipeline effectiveness signal ----
    // If almost none of the pipeline is high-confidence, the worklist is mostly
    // weak leads — the merchant should focus nurturing/qualification.
    const hcShare = copilot.totalPipelineValue > 0 ? copilot.highConfidenceValue / copilot.totalPipelineValue : 0;
    if (copilot.opportunityCount >= 5 && hcShare < 0.25) {
      anomalies.push({
        id: "pipeline-low-confidence",
        kind: "campaign",
        severity: "low",
        title: "خط الفرص ضعيف الثقة",
        detail: `${Math.round(hcShare * 100)}% فقط من قيمة الفرص عالية الثقة — أغلب القائمة عملاء يحتاجون تأهيلًا.`,
        metric: `${Math.round(hcShare * 100)}%`,
        expectedImpact: "وجّه جهد البيع للتأهيل وبناء الثقة لرفع نسبة الإغلاق.",
        actionLabel: "راجع الذكاء",
        actionHref: "/dashboard/intel",
      });
    } else if (copilot.highConfidenceValue >= 2000) {
      anomalies.push({
        id: "pipeline-high-confidence",
        kind: "campaign",
        severity: "medium",
        title: "فرص عالية الثقة جاهزة للإغلاق",
        detail: `${EGP(copilot.highConfidenceValue)} من الفرص بثقة مرتفعة — قابلة للتحصيل سريعًا.`,
        metric: EGP(copilot.highConfidenceValue),
        expectedImpact: "ابدأ بهذه الفرص اليوم لأعلى عائد على الجهد.",
        actionLabel: "ابدأ التحصيل",
        actionHref: "/dashboard/revenue-copilot",
      });
    }
  }

  // ---- Summary (revenue trend + overall risk level) ----
  let revenueTrend: "up" | "down" | "flat" = "flat";
  if (forecast) {
    if (forecast.growthPct >= 8) revenueTrend = "up";
    else if (forecast.growthPct <= -8) revenueTrend = "down";
  }

  const hasHigh = anomalies.some((a) => a.severity === "high");
  const hasRisk = anomalies.some(
    (a) => (a.kind === "revenue_drop" || a.kind === "activity_drop" || a.kind === "churn_cluster"),
  );
  const riskLevel: "high" | "medium" | "low" = hasHigh && hasRisk ? "high" : hasRisk ? "medium" : "low";

  // Severity-ranked feed: high → medium → low.
  const sevRank: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return {
    generatedAt: now.toISOString(),
    anomalies,
    summary: { revenueTrend, riskLevel },
    forecast: forecast
      ? {
          history: forecast.history.map((p) => ({ date: p.date, revenue: p.revenue })),
          growthPct: forecast.growthPct,
          next7Revenue: forecast.next7Revenue,
          aov: forecast.aov,
        }
      : null,
  };
}
