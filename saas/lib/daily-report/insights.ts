// Daily Report — insights.ts
//
// Heuristic insight engine. Takes a `DailyAggregate` and emits 0..N
// candidate insights with a priority score. The formatter picks the top 3.
//
// Rules are intentionally simple, explainable, and bounded — no LLM, no
// floats, no surprising thresholds. Each rule returns at most one insight.

import { DailyAggregate } from "./aggregate";

export interface Insight {
  /** stable id so we can A/B and analyze later */
  id: string;
  /** the line shown to the merchant (Arabic, ≤ 90 chars) */
  text: string;
  /** higher = more important. The top 3 are chosen by descending priority. */
  priority: number;
}

export function deriveInsights(a: DailyAggregate): Insight[] {
  const out: Insight[] = [];
  const r = (n: number) => Math.round(n);

  // 1) Spike in messages vs day-before (need a meaningful baseline)
  if (a.messagesDayBefore >= 10 && a.messages > a.messagesDayBefore * 1.3) {
    const pct = r(((a.messages - a.messagesDayBefore) / a.messagesDayBefore) * 100);
    out.push({
      id: "msg_spike",
      priority: 70,
      text: `📈 المحادثات زادت ${pct}% عن أمس الأول.`,
    });
  } else if (a.messagesDayBefore >= 10 && a.messages < a.messagesDayBefore * 0.6) {
    const pct = r(((a.messagesDayBefore - a.messages) / a.messagesDayBefore) * 100);
    out.push({
      id: "msg_drop",
      priority: 65,
      text: `📉 المحادثات قلّت ${pct}% عن أمس الأول — راجع توفر الواتساب.`,
    });
  }

  // 2) Hot leads waiting on a reply — the highest-priority signal
  if (a.hotLeadsAwaiting > 0) {
    out.push({
      id: "hot_leads_awaiting",
      priority: 95,
      text: `🔥 ${a.hotLeadsAwaiting} عميل محتمل بدرجة عالية بيستنى ردك.`,
    });
  } else if (a.hotLeads > 0) {
    out.push({
      id: "hot_leads_active",
      priority: 50,
      text: `🔥 عندك ${a.hotLeads} عميل محتمل نشط الأسبوع ده.`,
    });
  }

  // 3) New top-of-funnel customers
  if (a.newCustomers > 0) {
    out.push({
      id: "new_customers",
      priority: 40,
      text: `🌟 ${a.newCustomers} عميل جديد بدأ يكلمك أمس.`,
    });
  }

  // 4) Orders signal
  if (a.ordersCount > 0) {
    const egp = Math.round(a.ordersRevenueMinor); // schema stores integer EGP already
    out.push({
      id: "orders_today",
      priority: 80,
      text: `🧾 ${a.ordersCount} طلب أمس بقيمة ${formatEgp(egp)}.`,
    });
  } else if (a.ordersAvg7d >= 1) {
    out.push({
      id: "orders_zero_warn",
      priority: 60,
      text: `⚠️ مفيش طلبات أمس (المعتاد ${a.ordersAvg7d.toFixed(1)}/يوم).`,
    });
  }

  // 5) Conversion ratio (orders / inbound msgs)
  if (a.userMessages >= 20 && a.ordersCount === 0) {
    out.push({
      id: "no_conversion",
      priority: 55,
      text: `🟡 ${a.userMessages} رسالة عميل بدون أي طلب — جرّب تحفيز عرض اليوم.`,
    });
  }

  // 6) Best hour suggestion (only mention if surprising)
  if (a.topHourLocal !== null && a.userMessages >= 15) {
    const h = a.topHourLocal;
    out.push({
      id: "peak_hour",
      priority: 30,
      text: `🕒 أكتر ساعة العملاء بيكلموك فيها: ${formatHour(h)}.`,
    });
  }

  // 7) Bot coverage (bot replied to fraction of inbound)
  if (a.userMessages >= 10) {
    const ratio = a.assistantMessages / Math.max(1, a.userMessages);
    if (ratio < 0.7) {
      out.push({
        id: "bot_coverage_low",
        priority: 75,
        text: `⚠️ البوت رد على ${Math.round(ratio * 100)}% من الرسائل بس — تأكد إن الواتساب متصل.`,
      });
    }
  }

  return out;
}

/** Pick top N insights by priority. Stable ordering for ties (input order). */
export function topN(insights: Insight[], n: number): Insight[] {
  return [...insights]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x.priority - a.x.priority || a.i - b.i)
    .slice(0, n)
    .map((p) => p.x);
}

/** Recommendation = derived from the highest-priority insight, in one short sentence. */
export function recommend(top: Insight[]): string | null {
  if (top.length === 0) return null;
  const head = top[0];
  switch (head.id) {
    case "hot_leads_awaiting":
      return "ابدأ يومك بالرد على العملاء المحتملين قبل الظهر.";
    case "orders_today":
      return "تابع تأكيد الطلبات الجديدة قبل ما العميل يفتر.";
    case "bot_coverage_low":
      return "افتح صفحة واتساب وتأكد إن الجلسة متصلة.";
    case "msg_spike":
      return "خصص ساعتين النهاردة لمتابعة الرسائل اللي زادت.";
    case "msg_drop":
      return "ابعت برودكاست خفيف للعملاء الفاترين.";
    case "no_conversion":
      return "جرّب عرض حصري لـ24 ساعة على المنتج الأكثر طلباً.";
    case "orders_zero_warn":
      return "راجع هل في عملاء سألوا عن السعر ولم يكملوا.";
    case "new_customers":
      return "ابعت رسالة ترحيب شخصية للعملاء الجدد.";
    case "peak_hour":
      return "خطّط للرد السريع في وقت الذروة بكرة.";
    default:
      return null;
  }
}

function formatEgp(n: number): string {
  // integer EGP, with thousands separator
  return `${n.toLocaleString("en-US")} ج`;
}

function formatHour(h: number): string {
  // 0..23 → "8 ص" / "3 م"
  if (h === 0) return "12 منتصف الليل";
  if (h === 12) return "12 ظهراً";
  if (h < 12) return `${h} ص`;
  return `${h - 12} م`;
}
