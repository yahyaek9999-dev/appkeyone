"use client";

// AI Sales OS — Funnel Conversion Dashboard (premium, mobile responsive).

import { useEffect, useState } from "react";
import {
  Filter,
  Loader2,
  Users,
  MessageSquare,
  Flame,
  Target,
  ShoppingBag,
  CreditCard,
  Repeat,
  ArrowDown,
  Clock,
  Timer,
  Radio,
  Package,
  TrendingDown,
  Percent,
} from "lucide-react";

type Stage = {
  key: string;
  label: string;
  count: number;
  conversionFromPrev: number | null;
  dropOffFromPrev: number | null;
};
type FunnelData = {
  days: number;
  stages: Stage[];
  metrics: {
    closeRatePct: number;
    repeatPurchasePct: number;
    overallConversionPct: number;
    avgResponseMins: number | null;
    avgTimeToCloseHours: number | null;
  };
  topChannel: { label: string; count: number } | null;
  topProduct: { name: string; qty: number } | null;
  topLosingStage: { label: string; dropOffPct: number } | null;
  truncated: boolean;
};

const STAGE_ICON: Record<string, React.ReactNode> = {
  visitors: <Users className="h-4 w-4" />,
  conversations: <MessageSquare className="h-4 w-4" />,
  leads: <Flame className="h-4 w-4" />,
  qualified: <Target className="h-4 w-4" />,
  orders: <ShoppingBag className="h-4 w-4" />,
  paid: <CreditCard className="h-4 w-4" />,
  repeat: <Repeat className="h-4 w-4" />,
};

// Distinct gradient per stage — cool→warm as the funnel narrows toward revenue.
const STAGE_GRAD = [
  "from-sky-500/80 to-sky-400/40",
  "from-cyan-500/80 to-cyan-400/40",
  "from-teal-500/80 to-teal-400/40",
  "from-emerald-500/80 to-emerald-400/40",
  "from-lime-500/80 to-lime-400/40",
  "from-amber-500/80 to-amber-400/40",
  "from-orange-500/80 to-orange-400/40",
];

function fmt(n: number) {
  return (n || 0).toLocaleString("ar-EG");
}
function fmtDuration(mins: number | null) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} د`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} س`;
  return `${Math.round(mins / 1440)} يوم`;
}

export default function FunnelUi() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/funnel?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j?.error ? null : j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const top = data?.stages?.[0]?.count || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">مسار البيع</h1>
          <p className="page-desc mt-1">رحلة العميل من أول تواصل حتى الشراء المتكرر</p>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`filter-tab ${days === d ? "filter-tab-active" : ""}`}
            >
              {d} يوم
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        <div className="card p-10 text-center space-y-3">
          <Filter className="h-8 w-8 mx-auto text-slate-600" />
          <div className="text-sm text-slate-400">تعذّر تحميل بيانات المسار.</div>
          <button onClick={() => { setLoading(true); fetch(`/api/funnel?days=${days}`, { cache: "no-store" }).then(r => r.json()).then(j => setData(j?.error ? null : j)).catch(() => setData(null)).finally(() => setLoading(false)); }} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={<Percent className="h-4 w-4" />} label="التحويل الكلي" value={`${data.metrics.overallConversionPct}%`} accent="border-emerald-500/30 bg-emerald-500/10 text-emerald-300" />
            <Kpi icon={<Target className="h-4 w-4" />} label="معدل الإغلاق" value={`${data.metrics.closeRatePct}%`} accent="border-brand-500/30 bg-brand-500/10 text-brand-300" />
            <Kpi icon={<Repeat className="h-4 w-4" />} label="معدل الشراء المتكرر" value={`${data.metrics.repeatPurchasePct}%`} accent="border-gold-500/30 bg-gold-500/10 text-gold-300" />
            <Kpi icon={<Clock className="h-4 w-4" />} label="متوسط زمن الرد" value={fmtDuration(data.metrics.avgResponseMins)} accent="border-sky-500/30 bg-sky-500/10 text-sky-300" />
          </div>

          {/* Funnel visualization */}
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Filter className="h-4 w-4 text-brand-400" /> مراحل المسار
            </h3>
            <div className="space-y-2.5">
              {data.stages.map((s, i) => {
                const widthPct = top > 0 ? Math.max(6, (s.count / top) * 100) : 6;
                return (
                  <div key={s.key}>
                    {i > 0 && (
                      <div className="flex items-center justify-center gap-1 py-0.5 text-[11px] text-slate-500">
                        <ArrowDown className="h-3 w-3" />
                        <span className="text-emerald-400">{s.conversionFromPrev}%</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-rose-400/80">تسرّب {s.dropOffFromPrev}%</span>
                      </div>
                    )}
                    <div className="group relative">
                      <div
                        className={`flex items-center justify-between rounded-xl border border-white/10 bg-gradient-to-l ${STAGE_GRAD[i]} px-4 py-3 shadow-sm transition-all duration-500 group-hover:brightness-110`}
                        style={{ width: `${widthPct}%`, minWidth: "min(100%, 200px)" }}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-white drop-shadow">
                          {STAGE_ICON[s.key]}
                          {s.label}
                        </span>
                        <span className="text-base font-black text-white drop-shadow">{fmt(s.count)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Insight cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <InsightCard
              icon={<Radio className="h-4 w-4" />}
              tone="text-brand-300"
              label="أفضل قناة تحويل"
              value={data.topChannel?.label || "—"}
              sub={data.topChannel ? `${fmt(data.topChannel.count)} عميل` : ""}
            />
            <InsightCard
              icon={<Package className="h-4 w-4" />}
              tone="text-emerald-300"
              label="أكثر منتج تحويلاً"
              value={data.topProduct?.name || "—"}
              sub={data.topProduct ? `${fmt(data.topProduct.qty)} قطعة` : ""}
            />
            <InsightCard
              icon={<TrendingDown className="h-4 w-4" />}
              tone="text-rose-300"
              label="أكثر مرحلة تسرّب"
              value={data.topLosingStage?.label || "—"}
              sub={data.topLosingStage ? `تسرّب ${data.topLosingStage.dropOffPct}%` : ""}
            />
          </div>

          {/* secondary metric row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
            <Kpi icon={<Timer className="h-4 w-4" />} label="متوسط زمن الإغلاق" value={data.metrics.avgTimeToCloseHours == null ? "—" : data.metrics.avgTimeToCloseHours < 48 ? `${data.metrics.avgTimeToCloseHours} س` : `${Math.round(data.metrics.avgTimeToCloseHours / 24)} يوم`} accent="border-amber-500/30 bg-amber-500/10 text-amber-300" />
            <Kpi icon={<Users className="h-4 w-4" />} label="إجمالي الزوار بالفترة" value={fmt(top)} accent="border-slate-500/30 bg-slate-500/10 text-slate-300" />
          </div>

        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon border ${accent}`}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function InsightCard({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="card-hover p-4">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
        {icon}
        {label}
      </div>
      <div className="truncate text-lg font-bold text-white" title={value}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
