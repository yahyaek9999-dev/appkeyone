"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, TrendingUp, Lightbulb, Layers } from "lucide-react";
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
      <div className="border-b border-white/[0.05] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">تحليل الإيرادات</h1>
            <p className="page-desc mt-1">صحة الإيرادات، التسرّب، التكرار، القيمة الدائمة وتحليل الأفواج.</p>
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            حساب الإيرادات
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !s ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-10 text-center flex flex-col items-center gap-3">
          <TrendingUp className="h-8 w-8 text-slate-600" />
          <div className="text-[14px] font-semibold text-slate-200">لم تُحسب الإيرادات بعد</div>
          <div className="text-[13px] text-slate-500">اضغط «حساب الإيرادات» لتوليد التقرير.</div>
        </div>
      ) : (
        <>
          {/* Revenue score + metric band */}
          <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] py-6">
              <div className={`text-5xl font-extrabold tabular-nums ${color(s.revenueScore)}`}>
                {s.revenueScore}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">درجة الإيرادات / 100</div>
              <div className="text-[10px] text-slate-600 mt-0.5">صحة {s.revenueHealth}</div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] sm:grid-cols-3">
              {[
                { label: "إيراد ٣٠ يوم", value: s.revenue30d.toLocaleString(), sub: `السابق ${s.revenuePrev30d.toLocaleString()}`, cls: "text-emerald-300" },
                { label: "توقّع ٣٠ يوم", value: s.forecastNext30d.toLocaleString(), sub: "إسقاط من الاتجاه", cls: "text-sky-300" },
                { label: "متوسط القيمة الدائمة", value: s.avgLtv.toLocaleString(), sub: null, cls: "text-amber-300" },
                { label: "عملاء نشطون", value: `${s.activeCustomers}/${s.everCustomers}`, sub: null, cls: "text-brand-300" },
                { label: "معدّل التسرّب", value: `${s.churnRate}%`, sub: null, cls: s.churnRate > 50 ? "text-rose-300" : "text-white" },
                { label: "معدّل التكرار", value: `${s.repeatRate}%`, sub: null, cls: "text-emerald-300" },
              ].map((m) => (
                <div key={m.label} className="px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">{m.label}</div>
                  <div className={`mt-1.5 text-[18px] font-bold tabular-nums ${m.cls}`}>{m.value}</div>
                  {m.sub && <div className="text-[10px] text-slate-600 mt-0.5">{m.sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {data!.revenueTrend.length > 1 && (
            <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mb-2">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> اتجاه الإيراد — آخر{" "}
                {data!.revenueTrend.length} قياسات
              </div>
              <Sparkline data={data!.revenueTrend} tone="positive" height={48} />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Cohorts */}
            <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
              <div className="border-b border-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white inline-flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-500" /> تحليل الأفواج
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الشهر</th>
                      <th>العدد</th>
                      <th>طلبوا</th>
                      <th>الاحتفاظ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.cohorts.map((c) => (
                      <tr key={c.month}>
                        <td className="tabular-nums">{c.month}</td>
                        <td className="tabular-nums">{c.size}</td>
                        <td className="tabular-nums">{c.ordered}</td>
                        <td className="tabular-nums">{c.retentionPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recommendations */}
            <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
              <div className="border-b border-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white inline-flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-400" /> توصيات تحسين الإيرادات
              </div>
              <div className="divide-y divide-white/[0.04]">
                {data!.recommendations.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[13px] text-slate-500">لا توجد توصيات حالياً.</div>
                ) : (
                  data!.recommendations.map((r) => (
                    <div key={r.type} className="px-4 py-3">
                      <div className="flex items-center justify-between text-[13px] font-medium text-white">
                        <span>{r.label}</span>
                        <span className="text-[11px] text-slate-500">{r.count} عميل</span>
                      </div>
                      <div className="text-[12px] text-slate-400 mt-0.5">{r.action}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Top customers */}
          <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
            <div className="border-b border-white/[0.05] px-4 py-3 text-[13px] font-semibold text-white">
              أعلى العملاء — القيمة الدائمة وخطر التسرّب
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>الطلبات</th>
                    <th>القيمة الحالية</th>
                    <th>القيمة المتوقعة</th>
                    <th>خطر التسرّب</th>
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
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td className="tabular-nums">{c.orders}</td>
                        <td className="tabular-nums">{c.ltv.toLocaleString()}</td>
                        <td className="tabular-nums text-emerald-300">
                          {c.predictedLtv.toLocaleString()}
                        </td>
                        <td className={RISK[c.churnRisk]}>
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

          <div className="text-[11px] text-slate-600 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
            التوقّعات مبنية على الاتجاه الحالي لطلباتك — كلما زادت البيانات، زادت الدقة.
          </div>
        </>
      )}
    </div>
  );
}

