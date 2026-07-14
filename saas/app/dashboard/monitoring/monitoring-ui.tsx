"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Activity,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Bell,
} from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";

type Snap = {
  salesNow: number;
  salesPrev: number;
  ordersNow: number;
  ordersPrev: number;
  newCustomersNow: number;
  newCustomersPrev: number;
  escalationsNow: number;
  escalationsPrev: number;
  aiCalls: number;
  aiFailures: number;
  businessHealth: number;
  revenueRisk: number;
  churnRisk: number;
  serviceRisk: number;
  campaignRisk: number;
  aiRisk: number;
};
type Alert = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  value: number;
  baseline: number;
  status: string;
  createdAt: string;
};
type Data = {
  snapshot: Snap | null;
  history: Snap[];
  openAlerts: Alert[];
  resolvedAlerts: Alert[];
  healthTrend: number[];
};

const SEV: Record<string, { cls: string }> = {
  critical: { cls: "bg-rose-600/15 text-rose-300 border-rose-600/30" },
  high: { cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  medium: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  low: { cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
};
function healthColor(s: number) {
  return s >= 75 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-rose-400";
}
function riskColor(s: number) {
  return s >= 60 ? "bg-rose-500" : s >= 30 ? "bg-amber-400" : "bg-emerald-400";
}
function Risk({ label, val }: { label: string; val: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-20 shrink-0">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${riskColor(val)}`} style={{ width: `${val}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-300 w-8 text-left">{val}</span>
    </div>
  );
}
function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === now) return <span className="text-slate-500 text-[11px]">=</span>;
  const up = now > prev;
  return (
    <span
      className={`text-[11px] inline-flex items-center gap-0.5 ${up ? "text-emerald-300" : "text-rose-300"}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {prev}→{now}
    </span>
  );
}

export default function MonitoringUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/monitoring", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) { setData(j); setLoadFailed(false); } else { setLoadFailed(true); }
    } catch {
      setLoadFailed(true);
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
      await fetch("/api/monitoring/scan", { method: "POST" });
      await load();
    } finally {
      setScanning(false);
    }
  }
  async function resolve(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/monitoring/alerts/${id}/resolve`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const s = data?.snapshot;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">مركز الرصد الذكي</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يكتشف الشذوذ ويحسب درجات المخاطر وصحة النشاط من بياناتك الفعلية، ويصدر تنبيهات قابلة
            للمعالجة.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}{" "}
          فحص الآن
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !s ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <Activity className="h-10 w-10 opacity-40" />
          {loadFailed ? (
            <>
              <div className="font-medium text-rose-300">تعذّر تحميل البيانات</div>
              <button onClick={load} className="text-sm underline text-slate-300 hover:text-white">إعادة المحاولة</button>
            </>
          ) : (
            <>
              <div className="font-medium text-slate-200">لم يُجرَ فحص بعد</div>
              <div className="text-sm">اضغط «فحص الآن» لرصد نشاطك.</div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col items-center justify-center text-center">
              <div
                className={`text-5xl font-extrabold tabular-nums ${healthColor(s.businessHealth)}`}
              >
                {s.businessHealth}
              </div>
              <div className="text-xs text-slate-400 mt-1">صحة النشاط / 100</div>
              {data!.healthTrend.length > 1 && (
                <div className="mt-3 w-full">
                  <Sparkline
                    data={data!.healthTrend}
                    tone={s.businessHealth >= 50 ? "positive" : "negative"}
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    اتجاه صحة النشاط ({data!.healthTrend.length} قياسات)
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5">
              <div className="text-xs font-bold text-slate-300 mb-1 inline-flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-300" /> محرّك المخاطر
              </div>
              <Risk label="الإيرادات" val={s.revenueRisk} />
              <Risk label="التسرّب" val={s.churnRisk} />
              <Risk label="الخدمة" val={s.serviceRisk} />
              <Risk label="الحملات" val={s.campaignRisk} />
              <Risk label="الذكاء" val={s.aiRisk} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="الطلبات (٧ أيام)"
              value={s.ordersNow}
              delta={<Delta now={s.ordersNow} prev={s.ordersPrev} />}
            />
            <Metric
              label="المبيعات"
              value={s.salesNow.toLocaleString()}
              delta={<Delta now={s.salesNow} prev={s.salesPrev} />}
            />
            <Metric
              label="عملاء جدد"
              value={s.newCustomersNow}
              delta={<Delta now={s.newCustomersNow} prev={s.newCustomersPrev} />}
            />
            <Metric
              label="تصعيدات"
              value={s.escalationsNow}
              delta={<Delta now={s.escalationsNow} prev={s.escalationsPrev} />}
            />
          </div>

          {/* Alert center */}
          <section>
            <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-300" /> مركز التنبيهات ({data!.openAlerts.length})
            </h2>
            {data!.openAlerts.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center text-sm text-emerald-200 inline-flex items-center gap-2 w-full justify-center">
                <CheckCircle2 className="h-4 w-4" /> لا توجد تنبيهات مفتوحة.
              </div>
            ) : (
              <div className="space-y-2">
                {data!.openAlerts.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-2xl border p-4 flex flex-wrap items-start justify-between gap-2 ${SEV[a.severity]?.cls || SEV.medium.cls}`}
                  >
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-bold text-sm inline-flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> {a.title}
                      </div>
                      <div className="text-xs text-slate-200/80 mt-1">{a.message}</div>
                    </div>
                    <button
                      onClick={() => resolve(a.id)}
                      disabled={busy === a.id}
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {busy === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}{" "}
                      معالجة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {data!.resolvedAlerts.length > 0 && (
            <section>
              <h2 className="font-bold text-sm mb-2 text-slate-400">
                تنبيهات معالَجة ({data!.resolvedAlerts.length})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data!.resolvedAlerts.map((a) => (
                  <span
                    key={a.id}
                    className="text-[11px] rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-slate-400"
                  >
                    {a.title}
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="text-[11px] text-slate-500 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
            التنبؤ بالـ ML للإيرادات/التسرّب —{" "}
            <span className="text-slate-400">جاهز للإعداد (يتطلب مزوّد)</span>. الإسقاط الحالي حتمي
            بناءً على الاتجاه.
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string | number;
  delta: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-0.5">{delta}</div>
    </div>
  );
}
