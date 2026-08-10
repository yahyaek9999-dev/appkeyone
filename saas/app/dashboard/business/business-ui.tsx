"use client";

// Business Analytics — surfaces cohort retention, repeat-purchase rate,
// revenue by segment, and campaign ROI from existing data layers. Pure read.

import { useEffect, useState } from "react";
import {
  BarChart3, TrendingUp, Repeat, Wallet, Megaphone, Users,
  Loader2, RefreshCw, AlertTriangle,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface Cohort {
  month: string; total: number; repeat: number; retentionPct: number;
}
interface SegmentRev {
  key: string; label: string; revenue: number; count: number; aov: number;
}
interface BroadcastROI {
  id: string; title: string; sent: number; failed: number;
  replied: number; conversion: number; revenue: number;
  replyRatePct: number; convRatePct: number; createdAt: string;
}
interface BusinessData {
  generatedAt: string;
  totals: {
    orders: number; paidOrders: number; revenue: number; paidRevenue: number;
    customersWithOrders: number; customersWithPaidOrders: number;
    repeatCustomers: number; aov: number; repeatPurchasePct: number;
    orderCount30d: number;
  };
  cohortRetention: Cohort[];
  segmentRevenue: SegmentRev[];
  broadcastROI: BroadcastROI[];
  truncated: boolean;
}

const egp = (n: number) => `${(n || 0).toLocaleString("ar-EG")} ج`;

export default function BusinessUi() {
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/analytics/business", { cache: "no-store" });
      if (!r.ok) throw new Error("تعذر تحميل البيانات");
      setData(await r.json());
    } catch (e: any) {
      setError(e?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">تحليلات الأعمال</h1>
          <p className="page-desc">الاحتفاظ بالعملاء، معدل التكرار، الإيراد بالشريحة، وعائد الحملات.</p>
        </div>
        <button
          onClick={() => load(true)} disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          تحديث
        </button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري التحميل...
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      )}

      {data && !loading && (
        <>
          {data.truncated && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              الحسابات مبنية على عيّنة من أحدث 60,000 طلب (الحساب محدود للأداء).
            </div>
          )}

          {/* Headline KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi icon={<Wallet className="h-4 w-4" />} label="إيراد مدفوع" value={egp(data.totals.paidRevenue)} tone="emerald" />
            <Kpi icon={<Repeat className="h-4 w-4" />} label="معدل التكرار" value={`${data.totals.repeatPurchasePct}%`} tone="sky" />
            <Kpi icon={<Users className="h-4 w-4" />} label="عملاء اشتروا" value={data.totals.customersWithPaidOrders.toLocaleString()} tone="brand" />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="متوسط قيمة الطلب" value={egp(data.totals.aov)} tone="amber" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Cohort Retention */}
            <div className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Repeat className="h-4 w-4 text-sky-400" />
                <h2 className="section-title">الاحتفاظ الشهري (متكرر/جديد)</h2>
              </div>
              {data.cohortRetention.length === 0 ? (
                <EmptyState icon={<Repeat className="h-full w-full" />} title="لا توجد بيانات كافية بعد" description="ستظهر شرائح الاحتفاظ بمجرد أن يبدأ العملاء في الشراء مرتين." size="sm" />
              ) : (
                <div className="space-y-2">
                  {data.cohortRetention.map((c) => (
                    <div key={c.month}>
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="text-slate-300">{c.month}</span>
                        <span className="text-slate-400">
                          <span className="font-semibold text-white">{c.repeat}</span> / {c.total} تكرار
                          <span className="ml-2 text-sky-300">({c.retentionPct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className="h-full rounded-full bg-sky-500/60"
                          style={{ width: `${Math.max(2, c.retentionPct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Revenue by Segment */}
            <div className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-brand-400" />
                <h2 className="section-title">الإيراد بالشريحة</h2>
              </div>
              {data.segmentRevenue.length === 0 ? (
                <EmptyState icon={<Users className="h-full w-full" />} title="لا توجد شرائح نشطة بعد" description="ستظهر شرائح الإيراد بعد أن تنمو قاعدة عملائك." size="sm" />
              ) : (
                <div className="space-y-2.5">
                  {data.segmentRevenue.slice(0, 8).map((s) => {
                    const maxRev = data.segmentRevenue[0]?.revenue || 1;
                    const pct = Math.round((s.revenue / maxRev) * 100);
                    return (
                      <div key={s.key}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="text-slate-300 truncate">{s.label}</span>
                          <span className="shrink-0 text-slate-400 ml-2">
                            <span className="font-semibold text-emerald-300">{egp(s.revenue)}</span>
                            <span className="ml-1.5 text-slate-600">({s.count} عميل)</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-brand-500 to-emerald-500"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Campaign ROI */}
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-400" />
              <h2 className="section-title">عائد الحملات (آخر 20 حملة)</h2>
            </div>
            {data.broadcastROI.length === 0 ? (
              <EmptyState
                icon={<Megaphone className="h-full w-full" />}
                title="لا توجد حملات مكتملة بعد"
                description="أرسل أول حملة جماعية لتظهر نسب التفاعل والتحويل هنا."
                size="md"
              />
            ) : (
              <div className="mobile-scroll-x">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="table-header text-right">اسم الحملة</th>
                      <th className="table-header">أُرسل</th>
                      <th className="table-header">ردّ</th>
                      <th className="table-header">تحويل</th>
                      <th className="table-header">الإيراد</th>
                      <th className="table-header">نسبة الرد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.broadcastROI.map((b) => (
                      <tr key={b.id}>
                        <td className="table-cell font-medium text-white truncate max-w-[180px]">{b.title}</td>
                        <td className="table-cell text-center">{b.sent.toLocaleString()}</td>
                        <td className="table-cell text-center">{b.replied.toLocaleString()}</td>
                        <td className="table-cell text-center text-emerald-300 font-semibold">{b.conversion.toLocaleString()}</td>
                        <td className="table-cell text-center text-emerald-300 font-semibold">{egp(b.revenue)}</td>
                        <td className="table-cell text-center">
                          <span className={`text-xs font-semibold ${b.replyRatePct >= 20 ? "text-emerald-300" : b.replyRatePct >= 10 ? "text-amber-300" : "text-slate-400"}`}>
                            {b.replyRatePct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-600 text-center">
            آخر تحديث: {new Date(data.generatedAt).toLocaleString("ar-EG")} · الأرقام من جداول الطلبات والشرائح مباشرة.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  const cls: Record<string, string> = {
    emerald: "from-emerald-500/20 to-green-500/5 text-emerald-400 border-emerald-500/15",
    sky: "from-sky-500/20 to-sky-600/5 text-sky-400 border-sky-500/15",
    brand: "from-brand-500/20 to-brand-600/5 text-brand-400 border-brand-500/15",
    amber: "from-amber-500/20 to-orange-500/5 text-amber-400 border-amber-500/15",
  };
  return (
    <div className="kpi-card">
      <div className={`kpi-icon border bg-gradient-to-br ${cls[tone] || cls.brand}`}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
