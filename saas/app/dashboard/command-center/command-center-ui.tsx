"use client";

// AI Command Center — KEYONE's flagship executive dashboard.
//
// One screen that answers "what should I do next to grow revenue?" It composes
// existing engines (forecast, revenue-copilot, recovery, order rollup) served by
// /api/command-center. Every recommendation shows the four mission-mandated
// fields — Insight, Why, Expected impact, and a one-click Action button.
//
// Read-only and anti-ban-safe: actions navigate the merchant to the relevant
// worklist; nothing is auto-sent.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles, RefreshCw, Wallet, TrendingUp, TrendingDown, Target,
  AlertTriangle, Crown, ShoppingCart, ArrowLeft, Lightbulb, Users,
  Loader2, Activity, ChevronLeft, Flame,
} from "lucide-react";

type Severity = "high" | "medium" | "low";
type ValueTier = "platinum" | "gold" | "silver" | "bronze" | "lead";

interface Recommendation {
  id: string;
  insight: string;
  why: string;
  expectedImpact: string;
  actionLabel: string;
  actionHref: string;
  severity: Severity;
  estimatedValue: number;
}
interface PipelineItem {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  action: string;
  title: string;
  reason: string;
  confidence: number;
  estimatedValue: number;
  valueTier: ValueTier;
}
interface AtRisk {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  reason: string;
  urgency: number;
  daysSinceLastMsg: number | null;
}
interface BestCustomer {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  revenue: number;
  orders: number;
}
interface Insight {
  kind: string;
  text: string;
}
interface Resp {
  generatedAt: string;
  revenue: {
    today: number; ordersToday: number; forecastNext7: number; forecastNext30: number;
    expectedOrders7: number; growthPct: number; aov: number; repeatPct: number;
  };
  pipeline: { opportunityCount: number; totalValue: number; highConfidenceValue: number; top: PipelineItem[] } | null;
  atRisk: AtRisk[];
  bestCustomers: BestCustomer[];
  abandonedCarts: number;
  insights: Insight[];
  recommendations: Recommendation[];
  degraded: { forecast: boolean; pipeline: boolean; orders: boolean };
}

const egp = (n: number) => `${(n || 0).toLocaleString("ar-EG")} ج.م`;

const SEV_META: Record<Severity, { ring: string; chip: string; label: string }> = {
  high: { ring: "border-rose-500/30", chip: "bg-rose-500/15 text-rose-200 border-rose-500/30", label: "أولوية عالية" },
  medium: { ring: "border-amber-500/25", chip: "bg-amber-500/15 text-amber-200 border-amber-500/30", label: "متوسطة" },
  low: { ring: "border-white/10", chip: "bg-white/[0.04] text-slate-300 border-white/10", label: "فرصة" },
};

const TIER_META: Record<ValueTier, { label: string; cls: string }> = {
  platinum: { label: "بلاتيني", cls: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" },
  gold: { label: "ذهبي", cls: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  silver: { label: "فضي", cls: "border-slate-300/30 bg-slate-300/10 text-slate-200" },
  bronze: { label: "برونزي", cls: "border-orange-700/40 bg-orange-700/10 text-orange-300" },
  lead: { label: "محتمل", cls: "border-white/10 bg-white/[0.03] text-slate-400" },
};

const ACTION_AR: Record<string, string> = {
  close_now: "اقفل الصفقة", answer_fast: "رد بسرعة", escalate: "تصعيد", win_back: "استعادة",
  upsell: "بيع مكمّل", build_trust: "ابنِ الثقة", offer_value: "اعرض القيمة",
  reduce_friction: "قلّل التردد", nudge_followup: "متابعة", nurture: "تنمية",
};

export default function CommandCenterUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/command-center", { cache: "no-store" });
      if (r.status === 401) { setError("auth"); setData(null); return; }
      if (!r.ok) { setError(`HTTP ${r.status}`); setData(null); return; }
      const j = await r.json();
      setData(j); setError(null); setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10">
            <Sparkles className="h-5 w-5 text-brand-300" />
          </div>
          <div>
            <h1 className="page-title">مركز القيادة الذكي</h1>
            <p className="page-desc mt-1">كل ما يحتاجه عملك للنمو في شاشة واحدة — رؤى، فرص، وإجراءات بضغطة واحدة</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && <span className="text-[11px] text-slate-500">آخر تحديث: {lastUpdated.toLocaleTimeString("ar-EG")}</span>}
          <button onClick={fetchData} disabled={loading} className="btn-ghost px-3 py-1.5 text-sm">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <CommandSkeleton />
      ) : !data ? (
        <div className="card p-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
          <h3 className="text-base font-semibold text-white">تعذّر تحميل مركز القيادة</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            {error === "auth" ? "انتهت الجلسة — سجّل الدخول من جديد." : "حدث خطأ مؤقت أثناء جمع البيانات."}
          </p>
          {error === "auth" ? (
            <a href="/login" className="btn-primary mt-4 inline-flex text-sm">تسجيل الدخول</a>
          ) : (
            <button onClick={fetchData} className="btn-primary mt-4 text-sm">إعادة المحاولة</button>
          )}
        </div>
      ) : (
        <>
          {/* Revenue KPI strip */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Wallet className="h-4 w-4" />}
              label="إيراد اليوم"
              value={egp(data.revenue.today)}
              sub={`${data.revenue.ordersToday.toLocaleString("ar-EG")} طلب اليوم`}
              tone="emerald"
            />
            <Kpi
              icon={data.revenue.growthPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              label="توقّع 7 أيام"
              value={egp(data.revenue.forecastNext7)}
              sub={`${data.revenue.growthPct >= 0 ? "+" : ""}${data.revenue.growthPct}% مقابل الأسبوع الماضي`}
              tone={data.revenue.growthPct >= 0 ? "emerald" : "rose"}
            />
            <Kpi
              icon={<ShoppingCart className="h-4 w-4" />}
              label="طلبات متوقعة (7 أيام)"
              value={data.revenue.expectedOrders7.toLocaleString("ar-EG")}
              sub={`متوسط الطلب ${egp(data.revenue.aov)}`}
            />
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label="نسبة العملاء العائدين"
              value={`${data.revenue.repeatPct}%`}
              sub={data.pipeline ? `${data.pipeline.opportunityCount} فرصة نشطة` : "—"}
              tone="violet"
            />
          </div>

          {data.degraded && (data.degraded.forecast || data.degraded.pipeline || data.degraded.orders) && (
            <div className="card flex items-center gap-2 border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-200/80">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              بعض الأقسام غير متاحة مؤقتاً وتم عرض باقي البيانات. حاول التحديث بعد قليل.
            </div>
          )}

          {/* Recommendations — the heart of the page */}
          <section>
            <h2 className="section-title mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" /> أهم التوصيات الآن
            </h2>
            {data.recommendations.length === 0 ? (
              <div className="card p-8 text-center text-sm text-slate-400">
                لا توجد توصيات عاجلة الآن — النظام يراقب نشاطك وسيقترح إجراءات فور ظهور فرصة.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {data.recommendations.map((rec) => (
                  <RecommendationCard key={rec.id} rec={rec} />
                ))}
              </div>
            )}
          </section>

          {/* Pipeline preview + At-risk */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Next best actions */}
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="section-title flex items-center gap-2">
                  <Target className="h-4 w-4 text-brand-400" /> أفضل خطوة لكل عميل
                </h3>
                <Link href="/dashboard/revenue-copilot" className="text-[11px] text-brand-300 hover:underline">
                  عرض الكل <ChevronLeft className="inline h-3 w-3" />
                </Link>
              </div>
              {data.pipeline && data.pipeline.top.length > 0 ? (
                <div className="space-y-2">
                  {data.pipeline.top.map((o) => (
                    <Link
                      key={o.customerId}
                      href={`/dashboard/customers/${o.customerId}`}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.04]"
                    >
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] ${TIER_META[o.valueTier].cls}`}>
                        {TIER_META[o.valueTier].label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{o.customerName || o.customerPhone || "عميل"}</div>
                        <div className="truncate text-[11px] text-slate-400">{o.title}</div>
                      </div>
                      <div className="shrink-0 text-left">
                        <div className="text-xs font-semibold text-emerald-300">{egp(o.estimatedValue)}</div>
                        <div className="text-[10px] text-slate-500">{ACTION_AR[o.action] || o.action} · {o.confidence}%</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">لا توجد فرص نشطة الآن.</p>
              )}
            </div>

            {/* At-risk customers */}
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="section-title flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-400" /> عملاء معرّضون للفقدان
                </h3>
                <Link href="/dashboard/recovery" className="text-[11px] text-brand-300 hover:underline">
                  استعادة الكل <ChevronLeft className="inline h-3 w-3" />
                </Link>
              </div>
              {data.atRisk.length > 0 ? (
                <div className="space-y-2">
                  {data.atRisk.map((c) => (
                    <Link
                      key={c.customerId}
                      href={`/dashboard/customers/${c.customerId}`}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-rose-500/20 hover:bg-rose-500/[0.04]"
                    >
                      <Flame className={`h-4 w-4 shrink-0 ${c.urgency >= 60 ? "text-rose-400" : "text-amber-400"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{c.customerName || c.customerPhone || "عميل"}</div>
                        <div className="truncate text-[11px] text-slate-400">{c.reason}</div>
                      </div>
                      {c.daysSinceLastMsg != null && (
                        <span className="shrink-0 text-[10px] text-slate-500">{c.daysSinceLastMsg} يوم</span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">لا يوجد عملاء في خطر الآن 🎉</p>
              )}
            </div>
          </div>

          {/* Best customers + daily insights */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" /> أفضل عملائك
              </h3>
              {data.bestCustomers.length > 0 ? (
                <div className="space-y-2">
                  {data.bestCustomers.map((c, i) => (
                    <Link
                      key={c.customerId}
                      href={`/dashboard/customers/${c.customerId}`}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-amber-500/20 hover:bg-amber-500/[0.04]"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-300">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{c.customerName || c.customerPhone || "عميل"}</div>
                        <div className="text-[11px] text-slate-400">{c.orders.toLocaleString("ar-EG")} طلب</div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold text-amber-300">{egp(c.revenue)}</div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">لا توجد بيانات طلبات كافية بعد.</p>
              )}
            </div>

            <div className="card p-5">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" /> رؤى اليوم
              </h3>
              {data.insights.length > 0 ? (
                <ul className="space-y-2.5">
                  {data.insights.map((ins, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ins.kind === "up" ? "bg-emerald-400" : ins.kind === "down" ? "bg-rose-400" : ins.kind === "action" ? "bg-brand-400" : "bg-slate-500"}`} />
                      <span>{ins.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">لا توجد رؤى لعرضها الآن.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const sev = SEV_META[rec.severity];
  return (
    <div className={`card flex flex-col gap-3 p-5 ${sev.ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${sev.chip}`}>{sev.label}</span>
          {rec.estimatedValue > 0 && (
            <span className="text-[11px] font-semibold text-emerald-300">{egp(rec.estimatedValue)}</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold leading-relaxed text-white">{rec.insight}</p>
        <div className="mt-2 space-y-1.5">
          <p className="flex gap-1.5 text-[12px] text-slate-400">
            <span className="shrink-0 font-medium text-slate-500">السبب:</span>
            <span>{rec.why}</span>
          </p>
          <p className="flex gap-1.5 text-[12px] text-slate-400">
            <span className="shrink-0 font-medium text-slate-500">الأثر المتوقع:</span>
            <span className="text-emerald-300/90">{rec.expectedImpact}</span>
          </p>
        </div>
      </div>
      <Link href={rec.actionHref} className="btn-primary mt-1 inline-flex w-fit items-center gap-1.5 text-sm">
        {rec.actionLabel}
        <ArrowLeft className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone = "default" }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string;
}) {
  const text = tone === "emerald" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : tone === "violet" ? "text-violet-300" : "text-white";
  return (
    <div className="card p-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">{icon}{label}</div>
      <div className={`text-xl font-bold ${text}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function CommandSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-24" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-36" />)}
      </div>
    </div>
  );
}
