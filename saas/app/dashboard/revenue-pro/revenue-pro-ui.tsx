"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, DollarSign, Users, TrendingUp, Lightbulb, Layers } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";

type Snap = {
  revenue30d: number;
  revenuePrev30d: number;
  everCustomers: number;
  activeCustomers: number;
  churnRate: number;
  repeatRate: number;
  avgLtv: number;
  revenueHealth: number;
  revenueScore: number;
  forecastNext30d: number;
};
type Cohort = {
  month: string;
  size: number;
  ordered: number;
  repeated: number;
  retentionPct: number;
};
type Top = {
  name: string;
  ltv: number;
  predictedLtv: number;
  orders: number;
  churnRisk: string;
  daysSinceOrder: number | null;
};
type Rec = { type: string; label: string; count: number; action: string };
type Data = {
  snapshot: Snap | null;
  history: Snap[];
  revenueTrend: number[];
  cohorts: Cohort[];
  topCustomers: Top[];
  recommendations: Rec[];
};

const RISK: Record<string, string> = {
  high: "text-rose-300",
  medium: "text-amber-300",
  low: "text-emerald-300",
  none: "text-slate-500",
};
const RISK_LABEL: Record<string, string> = {
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
  none: "—",
};
function color(s: number) {
  return s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-rose-400";
}

export default function RevenueProUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/revenue-pro", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) setData(j);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function scan() {
    setScanning(true);
    try {
      await fetch("/api/revenue-pro/scan", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }

  const s = data?.snapshot;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">تحليل الإيرادات</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            صحة ودرجة الإيرادات، التسرّب، التكرار، القيمة الدائمة (LTV)، تحليل الأفواج (Cohorts)،
            وتوصيات حقيقية من بيانات طلباتك وعملائك.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{" "}
          حساب الإيرادات
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !s ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <DollarSign className="h-10 w-10 opacity-40" />
          <div className="font-medium text-slate-200">لم تُحسب الإيرادات بعد</div>
          <div className="text-sm">اضغط «حساب الإيرادات».</div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col items-center justify-center text-center">
              <div className={`text-5xl font-extrabold tabular-nums ${color(s.revenueScore)}`}>
                {s.revenueScore}
              </div>
              <div className="text-xs text-slate-400 mt-1">درجة الإيرادات / 100</div>
              <div className="text-[10px] text-slate-500 mt-1">صحة {s.revenueHealth}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi
                icon={<DollarSign className="h-4 w-4 text-emerald-300" />}
                label="إيراد ٣٠ يوم"
                value={s.revenue30d.toLocaleString()}
                sub={`السابق ${s.revenuePrev30d.toLocaleString()}`}
              />
              <Kpi
                icon={<TrendingUp className="h-4 w-4 text-sky-300" />}
                label="توقّع ٣٠ يوم"
                value={s.forecastNext30d.toLocaleString()}
                sub="إسقاط حتمي"
              />
              <Kpi
                icon={<DollarSign className="h-4 w-4 text-amber-300" />}
                label="متوسط LTV"
                value={s.avgLtv.toLocaleString()}
              />
              <Kpi
                icon={<Users className="h-4 w-4 text-brand-300" />}
                label="عملاء نشطون"
                value={`${s.activeCustomers}/${s.everCustomers}`}
              />
              <Kpi
                icon={<Users className="h-4 w-4 text-rose-300" />}
                label="معدّل التسرّب"
                value={`${s.churnRate}%`}
                tone={s.churnRate > 50 ? "warn" : undefined}
              />
              <Kpi
                icon={<TrendingUp className="h-4 w-4 text-emerald-300" />}
                label="معدّل التكرار"
                value={`${s.repeatRate}%`}
              />
            </div>
          </div>

          {data!.revenueTrend.length > 1 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-slate-400 mb-1 inline-flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-300" /> اتجاه الإيراد (آخر{" "}
                {data!.revenueTrend.length} قياسات)
              </div>
              <Sparkline data={data!.revenueTrend} tone="positive" height={48} />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Cohorts */}
            <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="border-b border-white/10 p-3 font-bold text-sm inline-flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-300" /> تحليل الأفواج (Cohorts)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="bg-white/5 text-slate-400">
                    <tr>
                      <th className="text-right p-3">الفوج</th>
                      <th className="text-right p-3">الحجم</th>
                      <th className="text-right p-3">طلبوا</th>
                      <th className="text-right p-3">احتفاظ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.cohorts.map((c) => (
                      <tr key={c.month} className="border-t border-white/5">
                        <td className="p-3 tabular-nums">{c.month}</td>
                        <td className="p-3 tabular-nums">{c.size}</td>
                        <td className="p-3 tabular-nums">{c.ordered}</td>
                        <td className="p-3 tabular-nums">{c.retentionPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recommendations */}
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-300" /> توصيات تحسين الإيرادات
              </h2>
              <div className="space-y-2">
                {data!.recommendations.length === 0 ? (
                  <div className="text-xs text-slate-400">لا توجد توصيات حالياً.</div>
                ) : (
                  data!.recommendations.map((r) => (
                    <div key={r.type} className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{r.label}</span>
                        <span className="text-xs text-slate-400">{r.count} عميل</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-1">{r.action}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Top customers */}
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/10 p-3 font-bold text-sm">
              أعلى العملاء (LTV + خطر التسرّب)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-white/5 text-slate-400">
                  <tr>
                    <th className="text-right p-3">العميل</th>
                    <th className="text-right p-3">الطلبات</th>
                    <th className="text-right p-3">LTV حالي</th>
                    <th className="text-right p-3">LTV متوقّع</th>
                    <th className="text-right p-3">خطر التسرّب</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.topCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-500 text-xs">
                        لا يوجد عملاء بطلبات بعد.
                      </td>
                    </tr>
                  ) : (
                    data!.topCustomers.map((c, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="p-3">{c.name}</td>
                        <td className="p-3 tabular-nums">{c.orders}</td>
                        <td className="p-3 tabular-nums">{c.ltv.toLocaleString()}</td>
                        <td className="p-3 tabular-nums text-emerald-300">
                          {c.predictedLtv.toLocaleString()}
                        </td>
                        <td className={`p-3 ${RISK[c.churnRisk]}`}>
                          {RISK_LABEL[c.churnRisk]}
                          {c.daysSinceOrder != null ? ` (${c.daysSinceOrder}ي)` : ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="text-[11px] text-slate-500 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
            توقّع الإيرادات/التسرّب عبر نموذج ML —{" "}
            <span className="text-slate-400">جاهز للإعداد (يتطلب مزوّد)</span>. التوقّع الحالي إسقاط
            حتمي من الاتجاه.
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        {icon}
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-extrabold tabular-nums ${tone === "warn" ? "text-amber-300" : ""}`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
