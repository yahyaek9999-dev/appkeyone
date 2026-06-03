"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Loader2, Server, Database, Smartphone, Brain,
  AlertTriangle, HardDrive, Zap, Wifi, Clock, RefreshCw,
  CheckCircle2, XCircle, BarChart3, Shield, Megaphone,
} from "lucide-react";

type Metric = {
  server: { cpuModel: string; cpuCores: number; totalMemMB: number; freeMemMB: number; usedMemMB: number; heapUsedMB: number; rssMB: number; uptimeSec: number };
  database: { sizeBytes: number | null; messages: number; customers: number; orders: number };
  queue: { queued: number; failed24h: number; deadLetter: number };
  whatsapp: { activeSessions: number };
  ai: { calls7d: number; inputTokens7d: number; outputTokens7d: number; cacheHits7d: number };
  errors: { critical24h: number; warn24h: number };
  broadcasts: { sending: number; queued: number };
};

function fmtBytes(b: number | null) {
  if (!b) return "—";
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fmtPct(a: number, b: number) {
  if (b <= 0) return "0";
  return Math.round((a / b) * 100).toString();
}
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}ي ${h}س`;
  if (h > 0) return `${h}س ${m}د`;
  return `${m}د`;
}

export default function SystemHealthUi() {
  const [data, setData] = useState<Metric | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/system/health", { cache: "no-store" });
      const j = await r.json();
      setData(j?.error ? null : j);
      setLastUpdated(new Date());
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  const memPct = data ? data.server.usedMemMB / data.server.totalMemMB : 0;
  const overallOk = data && data.queue.failed24h === 0 && data.errors.critical24h === 0 && data.queue.deadLetter === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-cyan-400" />
          <div>
            <h1 className="page-title">صحة النظام والمراقبة</h1>
            <p className="page-desc mt-1">مؤشرات أداء فورية للخادم وقاعدة البيانات والواتساب والذكاء الاصطناعي</p>
          </div>
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
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        <div className="card p-10 text-center text-sm text-slate-500">تعذّر تحميل بيانات المراقبة.</div>
      ) : (
        <>
          {/* Overall status banner */}
          <div className={`card p-4 flex items-center gap-3 ${overallOk ? "border-brand-500/20 bg-brand-500/[0.04]" : "border-rose-500/20 bg-rose-500/[0.04]"}`}>
            {overallOk ? (
              <CheckCircle2 className="h-5 w-5 text-brand-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            )}
            <span className={`text-sm font-medium ${overallOk ? "text-brand-300" : "text-rose-300"}`}>
              {overallOk ? "النظام يعمل بشكل طبيعي" : "يوجد تحذيرات تحتاج مراجعة"}
            </span>
          </div>

          {/* Server */}
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-400" /> الخادم
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniCard icon={<Zap className="h-4 w-4" />} label="المعالج" value={data.server.cpuModel.replace(/\(R\)|\(TM\)|Processor/gi, "").trim().slice(0, 28)} sub={`${data.server.cpuCores} نواة`} />
              <MiniCard icon={<HardDrive className="h-4 w-4" />} label="الذاكرة" value={`${data.server.usedMemMB}/${data.server.totalMemMB} MB`} sub={`${fmtPct(data.server.usedMemMB, data.server.totalMemMB)}% مستخدم`} tone={memPct > 0.85 ? "rose" : memPct > 0.7 ? "amber" : "emerald"} />
              <MiniCard icon={<Activity className="h-4 w-4" />} label="Heap" value={`${data.server.heapUsedMB} MB`} sub={`RSS: ${data.server.rssMB} MB`} />
              <MiniCard icon={<Clock className="h-4 w-4" />} label="وقت التشغيل" value={fmtUptime(data.server.uptimeSec)} />
            </div>
          </div>

          {/* Database */}
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-sky-400" /> قاعدة البيانات
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniCard icon={<Database className="h-4 w-4" />} label="حجم الملف" value={fmtBytes(data.database.sizeBytes)} />
              <MiniCard icon={<Database className="h-4 w-4" />} label="الرسائل" value={(data.database.messages || 0).toLocaleString("ar-EG")} />
              <MiniCard icon={<Server className="h-4 w-4" />} label="العملاء" value={(data.database.customers || 0).toLocaleString("ar-EG")} />
              <MiniCard icon={<Server className="h-4 w-4" />} label="الطلبات" value={(data.database.orders || 0).toLocaleString("ar-EG")} />
            </div>
          </div>

          {/* WhatsApp + Queue */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-400" /> واتساب والطابور
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniCard icon={<Wifi className="h-4 w-4" />} label="جلسات نشطة" value={String(data.whatsapp.activeSessions)} tone="emerald" />
                <MiniCard icon={<Activity className="h-4 w-4" />} label="في الانتظار" value={String(data.queue.queued)} tone={data.queue.queued > 50 ? "rose" : data.queue.queued > 10 ? "amber" : "emerald"} />
                <MiniCard icon={<AlertTriangle className="h-4 w-4" />} label="فشل الإرسال (24س)" value={String(data.queue.failed24h)} tone={data.queue.failed24h > 0 ? "rose" : "emerald"} />
                <MiniCard icon={<XCircle className="h-4 w-4" />} label="Dead-letter" value={String(data.queue.deadLetter ?? 0)} tone={(data.queue.deadLetter ?? 0) > 0 ? "rose" : "emerald"} />
              </div>
            </div>
            <div className="card p-5">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-purple-400" /> البث الجماعي
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniCard icon={<Activity className="h-4 w-4" />} label="قيد الإرسال" value={String((data as any).broadcasts?.sending ?? 0)} tone={(data as any).broadcasts?.sending > 0 ? "amber" : "emerald"} />
                <MiniCard icon={<Clock className="h-4 w-4" />} label="منتظر" value={String((data as any).broadcasts?.queued ?? 0)} />
              </div>
              <div className="mt-3">
                <h3 className="section-title mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-400" /> أخطاء
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <MiniCard icon={<AlertTriangle className="h-4 w-4" />} label="حرجة (24س)" value={String(data.errors.critical24h)} tone={data.errors.critical24h > 0 ? "rose" : "emerald"} />
                  <MiniCard icon={<AlertTriangle className="h-4 w-4" />} label="تحذيرات (24س)" value={String((data.errors as any).warn24h ?? 0)} tone={(data.errors as any).warn24h > 3 ? "amber" : "emerald"} />
                </div>
              </div>
            </div>
          </div>

          {/* AI */}
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-400" /> الذكاء الاصطناعي (آخر 7 أيام)
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniCard icon={<Brain className="h-4 w-4" />} label="استدعاءات" value={(data.ai.calls7d || 0).toLocaleString("ar-EG")} />
              <MiniCard icon={<CheckCircle2 className="h-4 w-4" />} label="كاش هيت" value={((data.ai as any).cacheHits7d || 0).toLocaleString("ar-EG")} tone="emerald" sub="توفير في التكلفة" />
              <MiniCard icon={<Zap className="h-4 w-4" />} label="رموز مدخلة" value={(data.ai.inputTokens7d || 0).toLocaleString("ar-EG")} />
              <MiniCard icon={<BarChart3 className="h-4 w-4" />} label="إجمالي الرموز" value={((data.ai.inputTokens7d || 0) + (data.ai.outputTokens7d || 0)).toLocaleString("ar-EG")} />
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-600">يُحدَّث كل 30 ثانية تلقائياً · جميع المقاييس للعرض فقط</p>
        </>
      )}
    </div>
  );
}

function MiniCard({ icon, label, value, sub, tone = "default" }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string;
}) {
  const border = tone === "rose" ? "border-rose-500/30" : tone === "amber" ? "border-amber-500/30" : tone === "emerald" ? "border-emerald-500/30" : "border-white/10";
  const text = tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-300" : "text-white";
  return (
    <div className={`rounded-xl border ${border} bg-white/[0.02] p-3`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500">{icon}{label}</div>
      <div className={`truncate text-base font-bold ${text}`} title={value}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
