// AI Sales OS — Revenue Forecast (read-only, pure-JS, no ML deps).
//
// Forecasts upcoming revenue/orders from the Order table using a linear trend
// (least squares over recent daily revenue) modulated by day-of-week
// seasonality. Also emits "Daily Business Insights" by reusing the existing
// daily aggregate, revenue intelligence and follow-up detector.

import { prisma } from "@/lib/db";
import { getOrderRollup } from "./order-rollup";
import { aggregateForUser } from "@/lib/daily-report/aggregate";
import { revenueIntelligence } from "@/lib/sales-brain/revenue";
import { detectFollowUpOps } from "@/lib/intel/follow-up-ops";

const DAY = 86_400_000;
const HISTORY_DAYS = 30;
const FORECAST_DAYS = 14;
const WD = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export interface ForecastPoint {
  date: string; // YYYY-MM-DD
  revenue: number;
}
export interface DailyInsight {
  kind: "up" | "down" | "product" | "followup" | "action";
  text: string;
}
export interface ForecastResult {
  generatedAt: string;
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  next7Revenue: number;
  next30Revenue: number;
  expectedOrders7: number;
  expectedOrders30: number;
  returningCustomersPct: number;
  highestDay: { date: string; weekday: string; revenue: number } | null;
  lowSalesDays: { date: string; weekday: string; revenue: number }[];
  growthPct: number; // forecast next-7 daily avg vs last-7 actual daily avg
  aov: number;
  insights: DailyInsight[];
}

function regression(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  if (n < 2) return { slope: 0, intercept: y[0] || 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += y[i];
    sxy += i * y[i];
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

export async function computeForecast(userId: string): Promise<ForecastResult> {
  const now = new Date();
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY);

  const [orders, rollup, agg, rev, followUps] = await Promise.all([
    prisma.order.findMany({
      where: { userId, createdAt: { gte: since }, status: { not: "canceled" } },
      select: { total: true, createdAt: true },
      take: 40_000,
    }),
    getOrderRollup(userId, { now }),
    aggregateForUser(userId, now).catch(() => null),
    revenueIntelligence(userId, now).catch(() => null),
    detectFollowUpOps(userId, now).catch(() => [] as any[]),
  ]);

  // ---- Daily revenue history (oldest → newest, zero-filled) ----
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const revByDay = new Map<string, number>();
  for (const o of orders) revByDay.set(dayKey(o.createdAt), (revByDay.get(dayKey(o.createdAt)) || 0) + (o.total || 0));

  const history: ForecastPoint[] = [];
  const dows: number[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    history.push({ date: dayKey(d), revenue: revByDay.get(dayKey(d)) || 0 });
    dows.push(d.getUTCDay());
  }
  const y = history.map((p) => p.revenue);
  const maxDaily = Math.max(1, ...y);
  const overallAvg = y.reduce((s, v) => s + v, 0) / (y.length || 1);

  // ---- Weekday seasonality factors ----
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (let i = 0; i < y.length; i++) {
    sums[dows[i]] += y[i];
    counts[dows[i]]++;
  }
  const factor = new Array(7).fill(1);
  if (overallAvg > 0) {
    for (let d = 0; d < 7; d++) {
      if (counts[d] > 0) {
        const avg = sums[d] / counts[d];
        factor[d] = Math.min(3, Math.max(0.2, avg / overallAvg));
      }
    }
  }

  // ---- Forecast ----
  const { slope, intercept } = regression(y);
  const forecast: ForecastPoint[] = [];
  for (let i = 1; i <= FORECAST_DAYS; i++) {
    const x = y.length - 1 + i;
    const base = Math.max(0, intercept + slope * x);
    const d = new Date(now.getTime() + i * DAY);
    const val = Math.min(maxDaily * 3, Math.round(base * factor[d.getUTCDay()]));
    forecast.push({ date: dayKey(d), revenue: val });
  }

  const next7Revenue = forecast.slice(0, 7).reduce((s, p) => s + p.revenue, 0);
  const next30Revenue = Math.round((next7Revenue / 7) * 30); // 14-day model extended to a 30-day projection
  const aov = rollup.totals.aov || (rev?.aov ?? 0) || 0;
  const expectedOrders7 = aov > 0 ? Math.round(next7Revenue / aov) : 0;
  const expectedOrders30 = aov > 0 ? Math.round(next30Revenue / aov) : 0;

  const returningCustomersPct =
    rollup.totals.customersWithOrders > 0
      ? Math.round((rollup.totals.repeatCustomers / rollup.totals.customersWithOrders) * 1000) / 10
      : 0;

  // Highest revenue day (next 7) + low-sales warning days (next 14 below 50% of avg).
  let highestDay: ForecastResult["highestDay"] = null;
  for (const p of forecast.slice(0, 7)) {
    if (!highestDay || p.revenue > highestDay.revenue) {
      const dow = new Date(p.date + "T00:00:00Z").getUTCDay();
      highestDay = { date: p.date, weekday: WD[dow], revenue: p.revenue };
    }
  }
  const warnThreshold = overallAvg * 0.5;
  const lowSalesDays = forecast
    .slice(0, FORECAST_DAYS)
    .filter((p) => p.revenue < warnThreshold)
    .slice(0, 5)
    .map((p) => {
      const dow = new Date(p.date + "T00:00:00Z").getUTCDay();
      return { date: p.date, weekday: WD[dow], revenue: p.revenue };
    });

  const last7Avg = y.slice(-7).reduce((s, v) => s + v, 0) / 7;
  const fcast7Avg = next7Revenue / 7;
  const growthPct = last7Avg > 0 ? Math.round(((fcast7Avg - last7Avg) / last7Avg) * 1000) / 10 : fcast7Avg > 0 ? 100 : 0;

  // ---- Daily Business Insights ----
  const insights: DailyInsight[] = [];
  if (agg) {
    const msgDelta = agg.messagesAvg7d > 0 ? ((agg.messages - agg.messagesAvg7d) / agg.messagesAvg7d) * 100 : 0;
    const ordDelta = agg.ordersAvg7d > 0 ? ((agg.ordersCount - agg.ordersAvg7d) / agg.ordersAvg7d) * 100 : 0;
    const revDelta = agg.revenueAvg7dMinor > 0 ? ((agg.ordersRevenueMinor - agg.revenueAvg7dMinor) / agg.revenueAvg7dMinor) * 100 : 0;
    if (revDelta >= 8) insights.push({ kind: "up", text: `الإيراد اليومي أعلى من متوسط الأسبوع بنسبة ${Math.round(revDelta)}% 📈` });
    else if (revDelta <= -8) insights.push({ kind: "down", text: `الإيراد اليومي أقل من متوسط الأسبوع بنسبة ${Math.abs(Math.round(revDelta))}% — يحتاج دفعة` });
    if (msgDelta >= 12) insights.push({ kind: "up", text: `نشاط المحادثات ينمو (+${Math.round(msgDelta)}% عن المتوسط)` });
    else if (msgDelta <= -12) insights.push({ kind: "down", text: `نشاط المحادثات يتراجع (${Math.round(msgDelta)}% عن المتوسط)` });
    if (ordDelta <= -15 && agg.ordersAvg7d >= 1) insights.push({ kind: "down", text: `الطلبات اليوم أقل من المعتاد — راجع العروض والمتابعات` });
  }
  if (rev && rev.bestSellers.length > 0) {
    const top = rev.bestSellers.slice(0, 2).map((b) => b.name).join("، ");
    insights.push({ kind: "product", text: `الأفضل مبيعًا حاليًا: ${top}` });
  }
  if (Array.isArray(followUps) && followUps.length > 0) {
    insights.push({ kind: "followup", text: `${followUps.length} عميل يحتاجون متابعة الآن (سألوا ولم يكملوا)` });
  }
  // Recommended action today — pick the strongest lever.
  let action = "تابع العملاء عالي النية وثبّت معدل الرد السريع.";
  if (growthPct < 0 && (followUps?.length || 0) > 0) action = `أرسل متابعة لـ ${followUps.length} عميل مهتم لتعويض تباطؤ المبيعات المتوقع.`;
  else if (lowSalesDays.length > 0) action = `جهّز حملة/عرض ليوم ${lowSalesDays[0].weekday} المتوقع ضعيف المبيعات.`;
  else if (highestDay && highestDay.revenue > overallAvg) action = `استثمر ذروة ${highestDay.weekday} المتوقعة بعرض قوي ومخزون كافٍ.`;
  insights.push({ kind: "action", text: action });

  return {
    generatedAt: now.toISOString(),
    history,
    forecast,
    next7Revenue,
    next30Revenue,
    expectedOrders7,
    expectedOrders30,
    returningCustomersPct,
    highestDay,
    lowSalesDays,
    growthPct,
    aov,
    insights,
  };
}
