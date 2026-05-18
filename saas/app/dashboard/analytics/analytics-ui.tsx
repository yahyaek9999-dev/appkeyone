"use client";

import { useEffect, useState } from "react";
import {
  BarChart3, TrendingUp, Users, MessageSquare, Flame, Zap,
  DollarSign, Tag, Activity, ArrowUpRight, ArrowDownRight, Loader2,
} from "lucide-react";
import { formatCustomerPhone } from "@/lib/phone";

type Analytics = {
  days: number;
  totals: { customers: number; conversations: number; messages: number; leadsHot: number; leadsWarm: number };
  today: { messages: number; newCustomers: number; conversations: number };
  messagesDaily: { date: string; in: number; out: number }[];
  intent: Record<string, number>;
  sentiment: Record<string, number>;
  topTags: { tag: string; count: number }[];
  leadDistribution: { bucket: string; count: number }[];
  topCustomers: { id: string; name: string | null; phone: string; leadScore: number; msgs: number }[];
  quickReplies: { totalHits: number; topTriggers: { trigger: string; hits: number }[] };
  savings: { quickReplyShare: number; estLlmCallsSaved: number; currency: string; estUsdSaved: number };
};

const INTENT_LABEL: Record<string, string> = {
  buy: "نية شراء", inquiry: "استفسار", complaint: "شكوى",
  support: "دعم فني", greeting: "تحية", other: "أخرى",
};
const INTENT_COLORS: Record<string, string> = {
  buy: "from-emerald-500 to-emerald-400",
  inquiry: "from-sky-500 to-sky-400",
  complaint: "from-rose-500 to-rose-400",
  support: "from-amber-500 to-amber-400",
  greeting: "from-slate-500 to-slate-400",
  other: "from-purple-500 to-purple-400",
};
const SENTIMENT_LABEL: Record<string, string> = {
  positive: "إيجابي", neutral: "محايد", negative: "سلبي", angry: "غاضب",
};
const SENTIMENT_COLORS: Record<string, string> = {
  positive: "from-emerald-500 to-emerald-400",
  neutral: "from-slate-500 to-slate-400",
  negative: "from-amber-500 to-amber-400",
  angry: "from-rose-500 to-rose-400",
};

export default function AnalyticsUi() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j as Analytics))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            الإحصائيات والتحليلات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            رؤية شاملة لأداء البوت — نشاط العملاء، النوايا، ولماذا توفّر تكلفة LLM.
          </p>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                days === d
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                  : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
              }`}
            >
              آخر {d} يوم
            </button>
          ))}
        </div>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users}     color="cyan"    label="إجمالي العملاء" value={data.totals.customers} sub={`+${data.today.newCustomers} اليوم`} />
        <KpiCard icon={MessageSquare} color="sky" label={`رسائل (${data.days} يوم)`} value={data.totals.messages} sub={`${data.today.messages} اليوم`} />
        <KpiCard icon={Flame}     color="orange"  label="عملاء ساخنون"   value={data.totals.leadsHot}   sub={`${data.totals.leadsWarm} دافئين`} />
        <KpiCard icon={DollarSign} color="emerald" label="توفير LLM متوقع" value={`$${data.savings.estUsdSaved}`} sub={`${data.savings.estLlmCallsSaved} استدعاء`} />
      </div>

      {/* Daily traffic chart */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            حركة الرسائل اليومية
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              واردة
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              ردود
            </span>
          </div>
        </div>
        <DailyChart data={data.messagesDaily} />
      </div>

      {/* Two-column row: intent + sentiment */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            توزيع نوايا العملاء
          </h3>
          <DistRows data={data.intent} labels={INTENT_LABEL} colors={INTENT_COLORS} />
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-400" />
            توزيع المشاعر
          </h3>
          <DistRows data={data.sentiment} labels={SENTIMENT_LABEL} colors={SENTIMENT_COLORS} />
        </div>
      </div>

      {/* Lead distribution + Top tags */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            توزيع نقاط جودة العملاء
          </h3>
          <div className="space-y-2">
            {data.leadDistribution.map((b, i) => {
              const max = Math.max(...data.leadDistribution.map((x) => x.count), 1);
              const pct = Math.round((b.count / max) * 100);
              const colors = ["bg-slate-500", "bg-amber-500", "bg-yellow-500", "bg-orange-500", "bg-rose-500"];
              return (
                <div key={b.bucket} className="flex items-center gap-3">
                  <span className="text-xs w-16 text-slate-400 font-mono">{b.bucket}</span>
                  <div className="flex-1 h-6 bg-white/5 rounded-md overflow-hidden">
                    <div className={`h-full ${colors[i]} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs w-10 text-slate-300 text-left font-mono">{b.count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-400" />
            أكثر الوسوم تكراراً
          </h3>
          {data.topTags.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              لا توجد وسوم بعد. ستظهر هنا تلقائياً مع نشاط العملاء.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.topTags.map((t) => (
                <span
                  key={t.tag}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5"
                >
                  {t.tag}
                  <span className="text-emerald-200 bg-emerald-500/20 px-1.5 rounded text-[10px] font-bold">
                    {t.count}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top customers + Quick replies */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            العملاء الأكثر نشاطاً
          </h3>
          {data.topCustomers.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">لا توجد بيانات.</div>
          ) : (
            <div className="space-y-1.5">
              {data.topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                  <span className="w-6 text-center text-xs text-slate-500 font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.name || c.phone}</div>
                    {(() => {
                      const p = formatCustomerPhone(c.phone);
                      return p.isLid ? (
                        <div className="text-[11px] text-slate-500 italic" title={p.raw}>{p.display}</div>
                      ) : (
                        <bdi dir="ltr" className="text-[11px] text-slate-500 font-mono block">{p.display}</bdi>
                      );
                    })()}
                  </div>
                  <div className="text-xs text-slate-400">{c.msgs} رسالة</div>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                    c.leadScore >= 70 ? "bg-rose-500/15 text-rose-300" :
                    c.leadScore >= 40 ? "bg-amber-500/15 text-amber-300" :
                                       "bg-slate-500/15 text-slate-400"
                  }`}>
                    {c.leadScore}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="font-semibold mb-1 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            الردود السريعة — الأكثر استخداماً
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            كل استخدام = استدعاء LLM موفّر = توفير في الفاتورة.
          </p>
          {data.quickReplies.topTriggers.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">
              لم تنشئ ردود سريعة بعد. <a href="/dashboard/quick-replies" className="text-brand-400 hover:underline">ابدأ من هنا</a>
            </div>
          ) : (
            <div className="space-y-2">
              {data.quickReplies.topTriggers.map((t) => {
                const max = Math.max(...data.quickReplies.topTriggers.map((x) => x.hits), 1);
                const pct = Math.round((t.hits / max) * 100);
                return (
                  <div key={t.trigger} className="flex items-center gap-3">
                    <span className="text-xs w-28 truncate text-slate-300">{t.trigger}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs w-10 text-left font-mono text-slate-300">{t.hits}</span>
                  </div>
                );
              })}
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-xs">
                <span className="text-slate-400">إجمالي استدعاءات LLM موفّرة:</span>
                <span className="font-bold text-emerald-300">{data.quickReplies.totalHits}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">نسبة الرسائل المخدومة بدون LLM:</span>
                <span className="font-bold text-emerald-300">
                  {Math.round(data.savings.quickReplyShare * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components -------------------------------------------------

function KpiCard({
  icon: Icon, color, label, value, sub,
}: {
  icon: any; color: "cyan" | "sky" | "orange" | "emerald";
  label: string; value: number | string; sub?: string;
}) {
  const COLOR_BG: Record<string, string> = {
    cyan: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/30 text-cyan-300",
    sky: "from-sky-500/15 to-sky-500/5 border-sky-500/30 text-sky-300",
    orange: "from-orange-500/15 to-orange-500/5 border-orange-500/30 text-orange-300",
    emerald: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30 text-emerald-300",
  };
  return (
    <div className={`bg-gradient-to-br border rounded-2xl p-4 ${COLOR_BG[color]}`}>
      <div className="flex items-start justify-between mb-2">
        <Icon className="w-5 h-5 opacity-80" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs opacity-80 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] opacity-60 mt-1">{sub}</div>}
    </div>
  );
}

function DistRows({
  data, labels, colors,
}: {
  data: Record<string, number>;
  labels: Record<string, string>;
  colors: Record<string, string>;
}) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) {
    return <div className="text-sm text-slate-500 text-center py-6">لا توجد بيانات في هذه الفترة.</div>;
  }
  return (
    <div className="space-y-2">
      {entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => {
        const pct = total > 0 ? Math.round((v / total) * 100) : 0;
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="text-xs w-20 text-slate-300">{labels[k] || k}</span>
            <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
              <div className={`h-full bg-gradient-to-r ${colors[k] || "from-slate-500 to-slate-400"} transition-all`}
                   style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs w-12 text-left text-slate-300 font-mono">{v}</span>
            <span className="text-[10px] w-9 text-left text-slate-500 font-mono">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ data }: { data: { date: string; in: number; out: number }[] }) {
  if (data.length === 0) return <div className="text-sm text-slate-500 text-center py-10">لا توجد بيانات.</div>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  const W = 800, H = 220, P = 30;
  const stepX = (W - P * 2) / Math.max(1, data.length - 1);
  const yFor = (v: number) => H - P - (v / max) * (H - P * 2);

  function buildPath(key: "in" | "out") {
    return data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${P + i * stepX} ${yFor(d[key])}`)
      .join(" ");
  }
  function buildArea(key: "in" | "out") {
    return (
      `M ${P} ${H - P} ` +
      data.map((d, i) => `L ${P + i * stepX} ${yFor(d[key])}`).join(" ") +
      ` L ${P + (data.length - 1) * stepX} ${H - P} Z`
    );
  }

  // X-axis labels: show only ~5 evenly spaced
  const labelEvery = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px] h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(56,189,248)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(56,189,248)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(52,211,153)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(52,211,153)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p}
                x1={P} y1={P + (H - P * 2) * p}
                x2={W - P} y2={P + (H - P * 2) * p}
                stroke="rgba(255,255,255,0.05)" />
        ))}
        {/* areas */}
        <path d={buildArea("in")} fill="url(#gradIn)" />
        <path d={buildArea("out")} fill="url(#gradOut)" />
        {/* lines */}
        <path d={buildPath("in")} fill="none" stroke="rgb(56,189,248)" strokeWidth="2" />
        <path d={buildPath("out")} fill="none" stroke="rgb(52,211,153)" strokeWidth="2" />
        {/* x labels */}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={P + i * stepX} y={H - 8}
                  fontSize="10" fill="rgba(255,255,255,0.4)" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          ) : null
        )}
        {/* y max label */}
        <text x={4} y={P + 4} fontSize="10" fill="rgba(255,255,255,0.4)">{max}</text>
      </svg>
    </div>
  );
}
