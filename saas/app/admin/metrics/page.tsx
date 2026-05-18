// Admin metrics page. Read-only. No real-time polling, no client JS.
// Reads aggregated MetricEvent + ProviderUsage rows for the last 7 days.
//
// Intentionally simple: a table + four header tiles. The point is to give
// the operator confidence that real merchant traffic is producing realistic
// counters — NOT to be a Grafana replacement.

import { prisma } from "@/lib/db";
import { flush } from "@/lib/metrics";
import { Activity, AlertCircle, Database, Zap, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

// 7-day window ending today (UTC). Stable across timezones.
function last7Days(): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const EVENT_LABELS_AR: Record<string, string> = {
  llm_call:         "استدعاءات LLM ناجحة",
  llm_fail:         "استدعاءات فاشلة",
  cache_hit:        "نتائج من الـ Cache",
  semantic_hit:     "مطابقة دلالية",
  quick_reply_hit:  "ردود سريعة",
  fast_path_hit:    "مسار سريع",
  realism_active:   "تفعيل الواقعية البشرية",
  anti_ban_cooldown:"تبريد منع الحظر",
  order_extracted:  "طلبات تم استخراجها",
  daily_cap_hit:    "تجاوز حد يومي",
  provider_fallback:"رجوع لـ KEYONE الافتراضي",
  ws_reconnect:     "إعادة اتصال WhatsApp",
};

export default async function AdminMetricsPage() {
  // Flush the in-memory buffer so the page reflects very recent activity.
  await flush().catch(() => {});

  const days = last7Days();
  const sinceDay = days[0];

  // Pull rows for the last 7 days. Both tables are tiny by design.
  const [events, prov] = await Promise.all([
    (prisma as any).metricEvent?.findMany({
      where: { day: { gte: sinceDay } },
      orderBy: [{ day: "desc" }, { kind: "asc" }],
    }) || [],
    (prisma as any).providerUsage?.findMany({
      where: { day: { gte: sinceDay } },
      orderBy: [{ day: "desc" }, { provider: "asc" }],
    }) || [],
  ]);

  // Roll up by kind across the whole window.
  const totals: Record<string, number> = {};
  for (const e of events) {
    totals[e.kind] = (totals[e.kind] || 0) + (e.count || 0);
  }

  // Roll up provider usage.
  type ProvAgg = {
    calls: number; failures: number;
    inputTokens: number; outputTokens: number;
    totalLatencyMs: number;
  };
  const provTotals = new Map<string, ProvAgg>();
  for (const p of prov) {
    const cur = provTotals.get(p.provider) || { calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, totalLatencyMs: 0 };
    cur.calls          += p.calls          || 0;
    cur.failures       += p.failures       || 0;
    cur.inputTokens    += p.inputTokens    || 0;
    cur.outputTokens   += p.outputTokens   || 0;
    cur.totalLatencyMs += p.totalLatencyMs || 0;
    provTotals.set(p.provider, cur);
  }

  // Tile values
  const llmCalls   = totals.llm_call || 0;
  const llmFails   = totals.llm_fail || 0;
  const cacheHits  = (totals.cache_hit || 0) + (totals.quick_reply_hit || 0) + (totals.semantic_hit || 0);
  const orderCount = totals.order_extracted || 0;
  const totalReplies = llmCalls + (totals.quick_reply_hit || 0) + (totals.semantic_hit || 0);
  const skipLlmRate = totalReplies > 0
    ? Math.round((cacheHits / totalReplies) * 100)
    : 0;

  const allKinds = Array.from(new Set([...events.map((e: any) => e.kind), ...Object.keys(EVENT_LABELS_AR)]));
  // Order with known kinds first, in label order; unknown kinds appended.
  const known = Object.keys(EVENT_LABELS_AR);
  const orderedKinds = [
    ...known.filter((k) => allKinds.includes(k)),
    ...allKinds.filter((k) => !known.includes(k)),
  ];

  // Per-day breakdown: kind → day → count
  const byKindDay: Record<string, Record<string, number>> = {};
  for (const e of events) {
    byKindDay[e.kind] = byKindDay[e.kind] || {};
    byKindDay[e.kind][e.day] = (byKindDay[e.kind][e.day] || 0) + (e.count || 0);
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">المقاييس والاستخدام</h1>
      <p className="text-slate-400 mb-6">آخر 7 أيام · يتم التحديث عند فتح الصفحة</p>

      {/* Header tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Tile icon={<Activity className="w-5 h-5" />} label="إجمالي ردود LLM" value={llmCalls.toLocaleString()} />
        <Tile icon={<AlertCircle className="w-5 h-5 text-rose-300" />} label="استدعاءات فاشلة" value={llmFails.toLocaleString()} tone={llmFails > 0 ? "warn" : "ok"} />
        <Tile icon={<Database className="w-5 h-5 text-emerald-300" />} label="نسبة تخطي LLM (cache/quick/semantic)" value={`${skipLlmRate}%`} />
        <Tile icon={<Sparkles className="w-5 h-5 text-brand-300" />} label="طلبات تم استخراجها" value={orderCount.toLocaleString()} />
      </div>

      {/* Provider breakdown */}
      <div className="card p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-amber-300" />
          <h2 className="font-bold text-lg">استخدام مزوّدي الذكاء الاصطناعي</h2>
        </div>
        {provTotals.size === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">لا يوجد استخدام مسجل بعد</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-right p-2">المزوّد</th>
                  <th className="text-right p-2">استدعاءات</th>
                  <th className="text-right p-2">فاشلة</th>
                  <th className="text-right p-2">Tokens (in / out)</th>
                  <th className="text-right p-2">متوسط الزمن</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(provTotals.entries()).map(([provider, agg]) => {
                  const avgMs = agg.calls > 0 ? Math.round(agg.totalLatencyMs / agg.calls) : 0;
                  const failPct = agg.calls > 0 ? Math.round((agg.failures / agg.calls) * 100) : 0;
                  return (
                    <tr key={provider} className="border-t border-white/5">
                      <td className="p-2 font-mono text-xs">{provider}</td>
                      <td className="p-2">{agg.calls.toLocaleString()}</td>
                      <td className={"p-2 " + (failPct > 5 ? "text-rose-300" : "text-slate-400")}>
                        {agg.failures.toLocaleString()}{failPct > 0 ? ` (${failPct}%)` : ""}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {agg.inputTokens.toLocaleString()} / {agg.outputTokens.toLocaleString()}
                      </td>
                      <td className="p-2">{avgMs} ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-event 7-day grid */}
      <div className="card p-5">
        <h2 className="font-bold text-lg mb-4">أحداث النظام — آخر 7 أيام</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">الحدث</th>
                {days.map((d) => (
                  <th key={d} className="text-right p-2 font-mono text-xs">{d.slice(5)}</th>
                ))}
                <th className="text-right p-2 font-bold">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {orderedKinds.map((kind) => {
                const row = byKindDay[kind] || {};
                const total = (totals[kind] || 0);
                if (total === 0 && !EVENT_LABELS_AR[kind]) return null;
                return (
                  <tr key={kind} className="border-t border-white/5">
                    <td className="p-2">
                      <div className="font-semibold">{EVENT_LABELS_AR[kind] || kind}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{kind}</div>
                    </td>
                    {days.map((d) => (
                      <td key={d} className="p-2 text-slate-300">{(row[d] || 0).toLocaleString()}</td>
                    ))}
                    <td className="p-2 font-bold">{total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          الأحداث بتتجمّع كل 10 ثوانٍ في الذاكرة قبل ما تتكتب على القاعدة. لو شفت رقم منخفض بعد عملية مباشرة، استنّى دقيقة وحدّث الصفحة.
        </p>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "warn" }) {
  const border = tone === "warn" ? "border-rose-500/30" : "border-white/5";
  return (
    <div className={`card p-4 border ${border}`}>
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
        {icon}<span>{label}</span>
      </div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
