"use client";

// Phase 4 — Real-time Business Intelligence (flagship BI screen).
//
// Surfaces the automatic anomaly feed from /api/intel/anomalies: revenue
// spikes/drops, activity drops, churn clusters, opportunities and campaign
// signals — grouped by severity, each with title/detail/expected-impact + an
// action button. Header carries a small forecast sparkline + trend/risk chips.
//
// Mirrors system-health-ui.tsx fetch / skeleton / distinct-error / retry pattern.

import { useCallback, useEffect, useState } from "react";
import {
  Activity, RefreshCw, AlertTriangle, Wifi, Shield, TrendingUp, TrendingDown,
  Minus, ArrowUpRight, ArrowDownRight, Users, Megaphone, Target,
  Zap, CheckCircle2,
} from "lucide-react";

type AnomalyKind =
  | "revenue_spike" | "revenue_drop" | "activity_drop"
  | "churn_cluster" | "opportunity" | "campaign";
type AnomalySeverity = "high" | "medium" | "low";

type Anomaly = {
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  title: string;
  detail: string;
  metric: string;
  expectedImpact: string;
  actionLabel: string;
  actionHref: string;
};

type Report = {
  generatedAt: string;
  anomalies: Anomaly[];
  summary: { revenueTrend: "up" | "down" | "flat"; riskLevel: "high" | "medium" | "low" };
  forecast: { history: { date: string; revenue: number }[]; growthPct: number; next7Revenue: number; aov: number } | null;
  degraded?: boolean;
};

// Distinct failure modes so the UI explains *what* went wrong + the fix.
type LoadError =
  | { kind: "auth"; detail?: string }
  | { kind: "network"; detail?: string }
  | { kind: "locked"; detail?: string }
  | { kind: "forbidden"; detail?: string }
  | { kind: "server"; detail?: string };

const egp = (n: number) => `${Math.round(n).toLocaleString("ar-EG")} ج.م`;

export default function BusinessIntelligenceUi() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/intel/anomalies", { cache: "no-store" });
      if (r.status === 401) {
        setError({ kind: "auth" });
        setData(null);
        return;
      }
      // /api/intel/anomalies does not return 403 today (apiGate only does so
      // when given a permission, and it is not). Handled separately anyway so
      // that adding one later cannot silently start claiming the session died.
      if (r.status === 403) {
        setError({ kind: "forbidden" });
        setData(null);
        return;
      }
      // 402 is the paywall, not a fault. /api/intel/anomalies gates on
      // advanced_insights while this page gates on advanced_analytics; they sit
      // on the same tier today, so this is only reachable if the capability is
      // disabled for a tenant on its own — but falling through to !r.ok showed
      // a customer "تعذّر تحميل البيانات · HTTP 402", i.e. a locked feature
      // rendered as a crash instead of an upgrade path.
      if (r.status === 402) {
        setError({ kind: "locked" });
        setData(null);
        return;
      }
      if (!r.ok) {
        setError({ kind: "server", detail: `HTTP ${r.status}` });
        setData(null);
        return;
      }
      const j = await r.json();
      if (j?.error) {
        setError({ kind: "server", detail: String(j.error) });
        setData(null);
        return;
      }
      setData(j);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError({ kind: "network", detail: e instanceof Error ? e.message : undefined });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  const groups: { sev: AnomalySeverity; label: string }[] = [
    { sev: "high", label: "حرجة" },
    { sev: "medium", label: "متوسطة" },
    { sev: "low", label: "للمتابعة" },
  ];
  const bySev = (sev: AnomalySeverity) => (data?.anomalies || []).filter((a) => a.severity === sev);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">رصد الأعمال</h1>
          <p className="page-desc mt-1">قفزات وهبوط الإيراد، تراجع النشاط، تجمّع المخاطر، والفرص الجاهزة</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && (
            <span className="text-[11px] text-slate-500">آخر تحديث: {lastUpdated.toLocaleTimeString("ar-EG")}</span>
          )}
          <button onClick={() => setAutoRefresh(v => !v)} className={`text-[11px] rounded-lg px-2.5 py-1.5 border transition ${autoRefresh ? "border-brand-500/30 bg-brand-500/10 text-brand-300" : "border-white/10 text-slate-400 hover:bg-white/[0.04]"}`}>
            {autoRefresh ? "تحديث تلقائي" : "إيقاف التحديث"}
          </button>
          <button onClick={fetchData} disabled={loading} className="btn-ghost px-3 py-1.5 text-sm">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <BiSkeleton />
      ) : !data ? (
        <ErrorState error={error} onRetry={fetchData} retrying={loading} />
      ) : (
        <>
          {data.degraded && (
            <div className="card flex items-center gap-3 border-amber-500/20 bg-amber-500/[0.04] p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-300/80">تعذّر حساب بعض المؤشرات مؤقتًا — يُعرض ما توفّر فقط. أعد المحاولة بعد قليل.</p>
            </div>
          )}

          {/* Forecast + trend/risk summary header */}
          <SummaryHeader report={data} />

          {/* Anomaly feed grouped by severity */}
          {data.anomalies.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-white">لا يوجد شذوذ يستدعي الانتباه</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">مؤشرات أعمالك ضمن النطاق المعتاد. سنُنبّهك تلقائيًا عند ظهور أي تغيّر مهم.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(({ sev, label }) => {
                const items = bySev(sev);
                if (items.length === 0) return null;
                return (
                  <div key={sev} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <SeverityDot sev={sev} />
                      <h3 className="section-title">{label}</h3>
                      <span className="text-xs text-slate-500">({items.length})</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {items.map((a) => <AnomalyCard key={a.id} a={a} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-[11px] text-slate-600">يُحدَّث كل دقيقة تلقائياً · مشتق من بيانات حسابك للعرض فقط</p>
        </>
      )}
    </div>
  );
}

function SummaryHeader({ report }: { report: Report }) {
  const trend = report.summary.revenueTrend;
  const risk = report.summary.riskLevel;
  const f = report.forecast;

  const trendCfg = {
    up: { icon: <TrendingUp className="h-4 w-4" />, text: "text-emerald-300", border: "border-emerald-500/30", label: "اتجاه صاعد" },
    down: { icon: <TrendingDown className="h-4 w-4" />, text: "text-rose-300", border: "border-rose-500/30", label: "اتجاه هابط" },
    flat: { icon: <Minus className="h-4 w-4" />, text: "text-slate-300", border: "border-white/10", label: "اتجاه مستقر" },
  }[trend];

  const riskCfg = {
    high: { text: "text-rose-300", border: "border-rose-500/30", dot: "bg-rose-500", label: "مخاطر مرتفعة" },
    medium: { text: "text-amber-300", border: "border-amber-500/30", dot: "bg-amber-400", label: "مخاطر متوسطة" },
    low: { text: "text-emerald-300", border: "border-emerald-500/30", dot: "bg-emerald-400", label: "مخاطر منخفضة" },
  }[risk];

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex items-center gap-1.5 rounded-lg border ${trendCfg.border} bg-white/[0.02] px-3 py-1.5 text-xs font-medium ${trendCfg.text}`}>
            {trendCfg.icon}{trendCfg.label}
          </span>
          <span className={`flex items-center gap-1.5 rounded-lg border ${riskCfg.border} bg-white/[0.02] px-3 py-1.5 text-xs font-medium ${riskCfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${riskCfg.dot} ${risk === "high" ? "animate-pulse" : ""}`} />{riskCfg.label}
          </span>
          {f && (
            <>
              <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-300">
                <Target className="h-4 w-4 text-brand-400" />
                توقّع 7 أيام: <span className="font-semibold text-white">{egp(f.next7Revenue)}</span>
              </span>
              <span className={`flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs ${f.growthPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {f.growthPct >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {f.growthPct > 0 ? "+" : ""}{Math.round(f.growthPct)}%
              </span>
            </>
          )}
        </div>
        {f && f.history.length > 1 && <Sparkline points={f.history.map((h) => h.revenue)} up={trend !== "down"} />}
      </div>
    </div>
  );
}

// Minimal inline SVG sparkline of the daily revenue history (no chart deps).
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 160, h = 40, pad = 2;
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const range = Math.max(1, max - min);
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const d = points
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = up ? "#34d399" : "#fb7185";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-label="مخطط الإيراد اليومي">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const KIND_ICON: Record<AnomalyKind, React.ReactNode> = {
  revenue_spike: <ArrowUpRight className="h-4 w-4" />,
  revenue_drop: <ArrowDownRight className="h-4 w-4" />,
  activity_drop: <Activity className="h-4 w-4" />,
  churn_cluster: <Users className="h-4 w-4" />,
  opportunity: <Zap className="h-4 w-4" />,
  campaign: <Megaphone className="h-4 w-4" />,
};

function AnomalyCard({ a }: { a: Anomaly }) {
  const cfg = {
    high: { border: "border-rose-500/30", bg: "bg-rose-500/[0.04]", chip: "text-rose-300 border-rose-500/30", icon: "text-rose-400" },
    medium: { border: "border-amber-500/30", bg: "bg-amber-500/[0.03]", chip: "text-amber-300 border-amber-500/30", icon: "text-amber-400" },
    low: { border: "border-white/10", bg: "bg-white/[0.02]", chip: "text-slate-300 border-white/10", icon: "text-slate-400" },
  }[a.severity];

  return (
    <div className={`card flex flex-col gap-3 p-4 ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cfg.icon}>{KIND_ICON[a.kind]}</span>
          <h4 className="truncate text-sm font-semibold text-white">{a.title}</h4>
        </div>
        <span className={`shrink-0 rounded-md border ${cfg.chip} bg-white/[0.02] px-2 py-0.5 text-[11px] font-bold`} title="المؤشر">{a.metric}</span>
      </div>
      <p className="text-xs leading-relaxed text-slate-300">{a.detail}</p>
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">الأثر المتوقع</span>
        <p className="mt-0.5 text-xs text-slate-300">{a.expectedImpact}</p>
      </div>
      <a href={a.actionHref} className="btn-ghost mt-auto w-full justify-center px-3 py-2 text-sm">
        {a.actionLabel}
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}

function SeverityDot({ sev }: { sev: AnomalySeverity }) {
  const dot = sev === "high" ? "bg-rose-500" : sev === "medium" ? "bg-amber-400" : "bg-slate-500";
  return <span className={`h-2 w-2 rounded-full ${dot} ${sev === "high" ? "animate-pulse" : ""}`} />;
}

function BiSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="جارٍ تحميل ذكاء الأعمال">
      <div className="card h-16 p-4" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-24 rounded bg-white/[0.06]" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[0, 1].map((j) => (
              <div key={j} className="card p-4">
                <div className="mb-3 h-4 w-32 rounded bg-white/[0.06]" />
                <div className="mb-2 h-3 w-full rounded bg-white/[0.06]" />
                <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
                <div className="mt-3 h-8 w-full rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Distinct error states — each explains the cause and the fix, with retry.
function ErrorState({ error, onRetry, retrying }: { error: LoadError | null; onRetry: () => void; retrying: boolean }) {
  const kind = error?.kind ?? "server";
  const copy = {
    forbidden: {
      title: "لا تملك صلاحية عرض هذه البيانات",
      desc: "حسابك لا يملك صلاحية الاطّلاع على ذكاء الأعمال. تواصل مع مالك المساحة لمنحك الصلاحية.",
      cta: null,
      href: null,
    },
    locked: {
      title: "هذه الميزة غير مفعّلة على حسابك",
      desc: "رؤى الأعمال المتقدّمة غير متاحة في وضع حسابك الحالي. رقِّ باقتك لعرضها، أو تواصل مع الدعم إن كنت تتوقع أنها مفعّلة.",
      cta: "عرض الباقات",
      href: "/pricing?lang=ar#plans",
    },
    auth: {
      title: "انتهت الجلسة",
      desc: "يبدو أن جلستك انتهت. سجّل الدخول مرة أخرى لعرض ذكاء الأعمال.",
      cta: "تسجيل الدخول",
      href: "/login",
    },
    network: {
      title: "تعذّر الاتصال",
      desc: "لم نتمكن من الوصول للخادم. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.",
      cta: null,
      href: null,
    },
    server: {
      title: "تعذّر تحميل المؤشرات",
      desc: "حدث خطأ مؤقت أثناء حساب مؤشرات الأعمال. عادةً ما يُحل بإعادة المحاولة.",
      cta: null,
      href: null,
    },
  }[kind];

  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
        {kind === "network" ? <Wifi className="h-6 w-6 text-rose-400" /> : kind === "auth" ? <Shield className="h-6 w-6 text-amber-400" /> : <AlertTriangle className="h-6 w-6 text-rose-400" />}
      </div>
      <h3 className="text-base font-semibold text-white">{copy.title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">{copy.desc}</p>
      {error?.detail && <p className="mt-2 font-mono text-[11px] text-slate-600">{error.detail}</p>}
      <div className="mt-5 flex items-center justify-center gap-2">
        {copy.cta && copy.href ? (
          <a href={copy.href} className="btn-primary text-sm">{copy.cta}</a>
        ) : (
          <button onClick={onRetry} disabled={retrying} className="btn-primary text-sm">
            <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}
