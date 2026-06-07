"use client";

import { useEffect, useState } from "react";
import {
  BarChart3, Users, MessageSquare, DollarSign, ArrowUpRight, Loader2,
  TrendingUp, Activity, Zap, Tag,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeInView } from "@/components/ui/stagger-reveal";
import { LimelightTabs } from "@/components/ui/limelight-tabs";

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
const SENTIMENT_LABEL: Record<string, string> = {
  positive: "إيجابي", neutral: "محايد", negative: "سلبي", angry: "غاضب",
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">التحليلات</h1>
          <p className="page-desc mt-1">نظرة شاملة على أداء عملك</p>
        </div>
        <LimelightTabs
          activeKey={String(days)}
          onChange={(k) => setDays(Number(k))}
          tabs={[7, 30, 90].map((d) => ({ key: String(d), label: `آخر ${d} يوم` }))}
        />
      </div>

      {/* Key metrics — flat, dense, data-first */}
      <FadeInView delay={0.05}>
      <div className="metric-group grid-cols-2 sm:grid-cols-4">
        <MetricCell label="إجمالي العملاء" value={data.totals.customers.toLocaleString()} sub={`+${data.today.newCustomers} اليوم`} />
        <MetricCell label={`الرسائل (${data.days} يوم)`} value={data.totals.messages.toLocaleString()} sub={`${data.today.messages} اليوم`} />
        <MetricCell label="عملاء ساخنون" value={data.totals.leadsHot.toLocaleString()} sub={`${data.totals.leadsWarm} دافئين`} />
        <MetricCell label="توفير LLM" value={`~${data.savings.estUsdSaved}$`} sub={`${data.savings.estLlmCallsSaved} استدعاء`} />
      </div>
      </FadeInView>

      {/* Daily message chart */}
      <FadeInView delay={0.1}>
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">حركة الرسائل اليومية</h2>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400/70" />
              واردة
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-400/70" />
              ردود
            </span>
          </div>
        </div>
        <DailyChart data={data.messagesDaily} />
      </div>
      </FadeInView>

      {/* Two-column: intent + sentiment */}
      <FadeInView delay={0.15}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="section-title mb-3">نوايا العملاء</h2>
          <DistRows data={data.intent} labels={INTENT_LABEL} colors={{ buy: "bg-brand-500", inquiry: "bg-sky-500", complaint: "bg-rose-500", support: "bg-amber-500", greeting: "bg-slate-500", other: "bg-gold-500" }} />
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-3">المشاعر</h2>
          <DistRows data={data.sentiment} labels={SENTIMENT_LABEL} colors={{ positive: "bg-emerald-500", neutral: "bg-slate-500", negative: "bg-amber-500", angry: "bg-rose-500" }} />
        </div>
      </div>
      </FadeInView>

      {/* Two-column: lead distribution + top tags */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="section-title mb-3">توزيع نقاط العملاء</h2>
          {data.leadDistribution.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">لا توجد بيانات.</div>
          ) : (
            <div className="space-y-2">
              {data.leadDistribution.map((b, i) => {
                const max = Math.max(...data.leadDistribution.map((x) => x.count), 1);
                const pct = Math.round((b.count / max) * 100);
                const colors = ["bg-brand-500/60", "bg-brand-500/50", "bg-brand-500/40", "bg-brand-500/30", "bg-brand-500/20"];
                return (
                  <div key={b.bucket} className="flex items-center gap-3">
                    <span className="text-xs w-20 text-slate-400">{b.bucket}</span>
                    <div className="flex-1 h-5 rounded bg-white/[0.05] overflow-hidden">
                      <div className={`h-full rounded ${colors[i]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs w-10 text-end text-slate-300 tabular-nums">{b.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-3">أكثر الوسوم تكراراً</h2>
          {data.topTags.length === 0 ? (
            <EmptyState icon={<Tag className="h-full w-full" />} title="لا توجد وسوم بعد" description="ستظهر هنا تلقائيًا." size="sm" />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.topTags.map((t) => (
                <span key={t.tag} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-xs text-slate-300">
                  {t.tag}
                  <span className="rounded bg-white/[0.06] px-1 text-[10px] font-medium text-slate-400">{t.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two-column: top customers + quick replies */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="section-title mb-3">العملاء الأكثر نشاطاً</h2>
          {data.topCustomers.length === 0 ? (
            <EmptyState icon={<Users className="h-full w-full" />} title="لا توجد بيانات" description="ستظهر بيانات العملاء هنا." size="sm" />
          ) : (
            <div className="space-y-1">
              {data.topCustomers.map((c, i) => (
                <Link key={c.id} href={`/dashboard/customers/${c.id}`} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-white/[0.03]">
                  <span className="w-5 text-center text-xs text-slate-500 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{c.name || c.phone}</div>
                    <div className="text-[11px] text-slate-500 truncate">{c.msgs} رسالة</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded tabular-nums font-medium ${
                    c.leadScore >= 70 ? "bg-brand-500/15 text-brand-300" :
                    c.leadScore >= 40 ? "bg-amber-500/15 text-amber-300" :
                    "bg-white/[0.05] text-slate-400"
                  }`}>
                    {c.leadScore}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h2 className="section-title mb-1">الردود السريعة</h2>
          <p className="text-xs text-slate-500 mb-3">
            كل استخدام = استدعاء LLM موفّر
          </p>
          {data.quickReplies.topTriggers.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-6">
              لم تنشئ ردود سريعة بعد.
            </div>
          ) : (
            <div className="space-y-2">
              {data.quickReplies.topTriggers.map((t) => {
                const max = Math.max(...data.quickReplies.topTriggers.map((x) => x.hits), 1);
                const pct = Math.round((t.hits / max) * 100);
                return (
                  <div key={t.trigger} className="flex items-center gap-3">
                    <span className="text-xs w-28 truncate text-slate-300">{t.trigger}</span>
                    <div className="flex-1 h-4 rounded bg-white/[0.05] overflow-hidden">
                      <div className="h-full rounded bg-brand-500/40" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs w-8 text-end tabular-nums text-slate-300">{t.hits}</span>
                  </div>
                );
              })}
              <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">إجمالي استدعاءات LLM موفّرة:</span>
                  <span className="font-medium text-white tabular-nums">{data.quickReplies.totalHits}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">نسبة الرسائل بدون LLM:</span>
                  <span className="font-medium text-white tabular-nums">{Math.round(data.savings.quickReplyShare * 100)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components -------------------------------------------------

function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric-cell">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-600">{sub}</div>}
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
            <div className="flex-1 h-4 rounded bg-white/[0.05] overflow-hidden">
              <div className={`h-full rounded ${colors[k] || "bg-slate-500/50"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs w-12 text-end text-slate-300 tabular-nums">{v}</span>
            <span className="text-[10px] w-8 text-end text-slate-500 tabular-nums">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ data }: { data: { date: string; in: number; out: number }[] }) {
  if (data.length === 0) return <div className="text-sm text-slate-500 text-center py-10">لا توجد بيانات.</div>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out)));
  const W = 800, H = 200, P = 30;
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

  const labelEvery = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-0 sm:min-w-[500px] h-auto">
        <defs>
          <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(56,189,248,0.25)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgba(56,189,248,0)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(104,114,212,0.25)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgba(104,114,212,0)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p} x1={P} y1={P + (H - P * 2) * p} x2={W - P} y2={P + (H - P * 2) * p} stroke="rgba(255,255,255,0.04)" />
        ))}
        <path d={buildArea("in")} fill="url(#gradIn)" />
        <path d={buildArea("out")} fill="url(#gradOut)" />
        <path d={buildPath("in")} fill="none" stroke="rgba(56,189,248,0.6)" strokeWidth="1.5" />
        <path d={buildPath("out")} fill="none" stroke="rgba(104,114,212,0.6)" strokeWidth="1.5" />
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={P + i * stepX} y={H - 8} fontSize="10" fill="rgba(255,255,255,0.3)" textAnchor="middle">
              {d.date.slice(5)}
            </text>
          ) : null
        )}
        <text x={4} y={P + 4} fontSize="10" fill="rgba(255,255,255,0.3)">{max}</text>
      </svg>
    </div>
  );
}
