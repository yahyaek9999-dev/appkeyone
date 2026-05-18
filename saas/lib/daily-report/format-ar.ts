// Daily Report — format-ar.ts
//
// Renders the final WhatsApp-ready Arabic message. No LLM. Stable template.
// Target shape: greeting · headline numbers · top 3 insights · 1 recommendation.
// Total length stays well under 200 words / 700 chars to keep WhatsApp-native.

import { DailyAggregate } from "./aggregate";
import { Insight, recommend, topN } from "./insights";

export interface FormatInput {
  shopName: string;
  agg: DailyAggregate;
  insights: Insight[];
}

export interface FormattedReport {
  text: string;
  /** Whether the report has enough signal to be worth sending. */
  shouldSend: boolean;
  /** Top insights actually included (0..3). */
  used: Insight[];
}

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function formatReport(input: FormatInput): FormattedReport {
  const { shopName, agg, insights } = input;

  // Skip empty days entirely — never spam a quiet day with a "0 messages"
  // report. Single defensive check; cron uses this to no-op silently.
  if (agg.messages === 0 && agg.ordersCount === 0 && agg.newCustomers === 0) {
    return { text: "", shouldSend: false, used: [] };
  }

  const top = topN(insights, 3);
  const reco = recommend(top);
  const date = arDate(agg.generatedAt);

  const lines: string[] = [];
  lines.push(`☀️ تقرير صباح الخير — ${shopName}`);
  lines.push("");
  lines.push(`📅 ${date}`);
  lines.push("");
  lines.push("أمس:");
  lines.push(`• ${agg.messages} رسالة${deltaSuffix(agg.messages, agg.messagesDayBefore)}`);
  if (agg.ordersCount > 0) {
    lines.push(`• ${agg.ordersCount} طلب بقيمة ${formatEgp(agg.ordersRevenueMinor)}`);
  }
  if (agg.newCustomers > 0) {
    lines.push(`• ${agg.newCustomers} عميل جديد`);
  }

  if (top.length > 0) {
    lines.push("");
    lines.push("أهم الملاحظات:");
    for (const ins of top) lines.push(ins.text);
  }

  if (reco) {
    lines.push("");
    lines.push(`💡 توصية اليوم:`);
    lines.push(reco);
  }

  lines.push("");
  lines.push("— KEYONE");

  return { text: lines.join("\n"), shouldSend: true, used: top };
}

/**
 * "+23%" / "−12%" / "" — only if previous day had at least 5 msgs.
 * Returns leading space so it appends cleanly.
 */
function deltaSuffix(today: number, prev: number): string {
  if (prev < 5) return "";
  if (today === prev) return "";
  const pct = Math.round(((today - prev) / prev) * 100);
  if (Math.abs(pct) < 5) return "";
  const sign = pct > 0 ? "+" : "−";
  return ` (${sign}${Math.abs(pct)}% عن أمس الأول)`;
}

function arDate(d: Date): string {
  return `${AR_DAYS[d.getDay()]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}

function formatEgp(n: number): string {
  return `${n.toLocaleString("en-US")} ج`;
}
