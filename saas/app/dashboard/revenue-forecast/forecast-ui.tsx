"use client";

// AI Sales OS — Revenue Forecast (premium, mobile responsive).

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  CalendarDays,
  ShoppingBag,
  Repeat,
  Crown,
  AlertTriangle,
  Sparkles,
  Package,
  Bell,
  Lightbulb,
} from "lucide-react";

type Point = { date: string; revenue: number };
type Insight = { kind: string; text: string };
type Data = {
  history: Point[];
  forecast: Point[];
  next7Revenue: number;
  next30Revenue: number;
  expectedOrders7: number;
  expectedOrders30: number;
  returningCustomersPct: number;
  highestDay: { date: string; weekday: string; revenue: number } | null;
  lowSalesDays: { date: string; weekday: string; revenue: number }[];
  growthPct: number;
  aov: number;
  insights: Insight[];
};

function money(n: number) {
  return `${(n || 0).toLocaleString("ar-EG")} ج.م`;
}

const INSIGHT_ICON: Record<string, React.ReactNode> = {
  up: <TrendingUp className="h-4 w-4 text-emerald-400" />,
  down: <TrendingDown className="h-4 w-4 text-rose-400" />,
  product: <Package className="h-4 w-4 text-sky-400" />,
  followup: <Bell className="h-4 w-4 text-amber-400" />,
  action: <Lightbulb className="h-4 w-4 text-brand-400" />,
};

export default function ForecastUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/revenue-forecast", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j?.error ? null : j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-emerald-400" />
          توقّع الإيرادات
        </h1>
        <p className="page-desc mt-1">تنبؤ ذكي بالمبيعات القادمة ورؤى يومية لاتخاذ القرار</p>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        <div className="card p-10 text-center text-sm text-slate-500">تعذّر تحميل التوقعات.</div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={<CalendarDays className="h-4 w-4" />} label="مبيعات 7 أيام (متوقع)" value={money(data.next7Revenue)} accent="border-emerald-500/30 bg-emerald-500/10 text-emerald-300" trend={data.growthPct} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="إيراد 30 يوم (متوقع)" value={money(data.next30Revenue)} accent="border-cyan-500/30 bg-cyan-500/10 text-cyan-300" />
            <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="طلبات متوقعة (30ي)" value={(data.expectedOrders30 || 0).toLocaleString("ar-EG")} accent="border-sky-500/30 bg-sky-500/10 text-sky-300" />
            <Kpi icon={<Repeat className="h-4 w-4" />} label="نسبة العائدين" value={`${data.returningCustomersPct}%`} accent="border-violet-500/30 bg-violet-500/10 text-violet-300" />
          </div>

          {/* Forecast chart */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="section-title flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" /> اتجاه الإيراد + التوقع
              </h3>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-full bg-emerald-400" /> فعلي</span>
                <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-full bg-cyan-400/70 [background:repeating-linear-gradient(90deg,currentColor_0_3px,transparent_3px_6px)] text-cyan-400" /> متوقع</span>
              </div>
            </div>
            <ForecastChart history={data.history} forecast={data.forecast} />
          </div>

          {/* growth + peak + warnings */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="card-hover p-4">
              <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${data.growthPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {data.growthPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                النمو المتوقع
              </div>
              <div className="text-2xl font-black text-white">{data.growthPct >= 0 ? "+" : ""}{data.growthPct}%</div>
              <div className="mt-0.5 text-xs text-slate-500">مقارنة بأداء آخر 7 أيام</div>
            </div>
            <div className="card-hover p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Crown className="h-4 w-4" /> أعلى يوم متوقع
              </div>
              <div className="text-lg font-bold text-white">{data.highestDay ? data.highestDay.weekday : "—"}</div>
              <div className="mt-0.5 text-xs text-slate-500">{data.highestDay ? money(data.highestDay.revenue) : ""}</div>
            </div>
            <div className="card-hover p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                <AlertTriangle className="h-4 w-4" /> أيام ضعف متوقعة
              </div>
              {data.lowSalesDays.length === 0 ? (
                <div className="text-sm text-slate-400">لا توجد تحذيرات 👍</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {data.lowSalesDays.map((d) => (
                    <span key={d.date} className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
                      {d.weekday}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Daily insights */}
          <div className="card p-5">
            <h3 className="section-title mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-400" /> رؤى الأعمال اليومية
            </h3>
            <div className="space-y-2">
              {data.insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <span className="mt-0.5 shrink-0">{INSIGHT_ICON[ins.kind] || <Sparkles className="h-4 w-4 text-slate-400" />}</span>
                  <span className="text-sm text-slate-200">{ins.text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, accent, trend }: { icon: React.ReactNode; label: string; value: string; accent: string; trend?: number }) {
  return (
    <div className="kpi-card">
      <div className="mb-3 flex items-start justify-between">
        <div className={`kpi-icon border ${accent}`}>{icon}</div>
        {trend !== undefined && (
          <span className={`text-xs font-semibold ${trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

// Custom SVG line chart: history (solid emerald) → forecast (dashed cyan),
// with a "today" divider. No chart library — matches the analytics page style.
function ForecastChart({ history, forecast }: { history: Point[]; forecast: Point[] }) {
  const W = 720;
  const H = 200;
  const PAD = 8;
  const all = [...history, ...forecast];
  if (all.length < 2) return <div className="py-10 text-center text-sm text-slate-500">لا توجد بيانات كافية للرسم.</div>;

  const max = Math.max(1, ...all.map((p) => p.revenue));
  const n = all.length;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (n - 1);
  const yv = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);

  const histPts = history.map((p, i) => `${x(i)},${yv(p.revenue)}`);
  // forecast path starts at the last history point for a continuous line
  const splitIdx = history.length - 1;
  const fcPts = [
    `${x(splitIdx)},${yv(history[splitIdx].revenue)}`,
    ...forecast.map((p, i) => `${x(history.length + i)},${yv(p.revenue)}`),
  ];
  const areaPath = `M ${histPts.join(" L ")} L ${x(splitIdx)},${H - PAD} L ${x(0)},${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 200 }}>
      <defs>
        <linearGradient id="fcArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(52 211 153)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={PAD} x2={W - PAD} y1={PAD + g * (H - 2 * PAD)} y2={PAD + g * (H - 2 * PAD)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      {/* history area + line */}
      <path d={areaPath} fill="url(#fcArea)" />
      <polyline points={histPts.join(" ")} fill="none" stroke="rgb(52 211 153)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* forecast dashed line */}
      <polyline points={fcPts.join(" ")} fill="none" stroke="rgb(34 211 238)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
      {/* today divider */}
      <line x1={x(splitIdx)} x2={x(splitIdx)} y1={PAD} y2={H - PAD} stroke="rgba(34,211,238,0.35)" strokeWidth={1} strokeDasharray="3 3" />
      {/* last forecast dot */}
      <circle cx={x(n - 1)} cy={yv(all[n - 1].revenue)} r={3} fill="rgb(34 211 238)" />
    </svg>
  );
}
