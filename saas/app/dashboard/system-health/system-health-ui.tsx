"use client";

// System health monitoring dashboard (premium, mobile responsive).
// Read-only aggregation of existing metrics — no new data models.

import { useEffect, useState } from "react";
import {
  Activity,
  Loader2,
  Server,
  Database,
  Smartphone,
  Brain,
  AlertTriangle,
  HardDrive,
  Zap,
  Wifi,
  Clock,
} from "lucide-react";

type Metric = {
  server: { cpuModel: string; cpuCores: number; totalMemMB: number; freeMemMB: number; usedMemMB: number; heapUsedMB: number; rssMB: number; uptimeSec: number };
  database: { sizeBytes: number | null; messages: number; customers: number; orders: number };
  queue: { queued: number; failed24h: number };
  whatsapp: { activeSessions: number };
  ai: { calls7d: number; inputTokens7d: number; outputTokens7d: number };
  errors: { critical24h: number };
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
  if (d > 0) return `${d}ي ${h}س`;
  return `${h}س ${Math.floor((s % 3600) / 60)}د`;
}

export default function SystemHealthUi() {
  const [data, setData] = useState<Metric | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/system/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j?.error ? null : j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-cyan-400" />
        <div>
          <h1 className="page-title">صحة النظام والمراقبة</h1>
          <p className="page-desc mt-1">مؤشرات أداء فورية للخادم وقاعدة البيانات والواتساب والذكاء الاصطناعي</p>
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
          {/* Server */}
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-400" /> الخادم
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniCard icon={<Zap className="h-4 w-4" />} label="المعالج" value={data.server.cpuModel.replace(/\(R\)|\(TM\)|Processor/gi, "").trim().slice(0, 30)} sub={`${data.server.cpuCores} نواة`} />
              <MiniCard icon={<HardDrive className="h-4 w-4" />} label="الذاكرة العشوائية" value={`${data.server.usedMemMB}/${data.server.totalMemMB} MB`} sub={`${fmtPct(data.server.usedMemMB, data.server.totalMemMB)}% مستخدم`} tone={data.server.usedMemMB / data.server.totalMemMB > 0.8 ? "rose" : "emerald"} />
              <MiniCard icon={<Activity className="h-4 w-4" />} label="Heap المستخدم" value={`${data.server.heapUsedMB} MB`} sub={`RSS: ${data.server.rssMB} MB`} />
              <MiniCard icon={<Clock className="h-4 w-4" />} label="وقت التشغيل" value={fmtUptime(data.server.uptimeSec)} sub={`Node ${process.version || ""}`} />
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
                <Smartphone className="h-4 w-4 text-emerald-400" /> واتساب
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniCard icon={<Wifi className="h-4 w-4" />} label="جلسات نشطة" value={String(data.whatsapp.activeSessions)} tone="emerald" />
                <MiniCard icon={<AlertTriangle className="h-4 w-4" />} label="فشل الإرسال (24س)" value={String(data.queue.failed24h)} tone={data.queue.failed24h > 0 ? "rose" : "emerald"} />
              </div>
            </div>
            <div className="card p-5">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-400" /> الطابور
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniCard icon={<Activity className="h-4 w-4" />} label="في الانتظار" value={String(data.queue.queued)} tone={data.queue.queued > 50 ? "rose" : data.queue.queued > 10 ? "amber" : "emerald"} />
                <MiniCard icon={<AlertTriangle className="h-4 w-4" />} label="أخطاء حرجة (24س)" value={String(data.errors.critical24h)} tone={data.errors.critical24h > 0 ? "rose" : "emerald"} />
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
              <MiniCard icon={<Zap className="h-4 w-4" />} label="مدخلات" value={(data.ai.inputTokens7d || 0).toLocaleString("ar-EG")} />
              <MiniCard icon={<Zap className="h-4 w-4" />} label="مخرجات" value={(data.ai.outputTokens7d || 0).toLocaleString("ar-EG")} />
              <MiniCard icon={<Brain className="h-4 w-4" />} label="إجمالي الرموز" value={((data.ai.inputTokens7d || 0) + (data.ai.outputTokens7d || 0)).toLocaleString("ar-EG")} />
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-600">يُحدّث كل مرة تُفتح فيها الصفحة. جميع المقاييس للعرض فقط.</p>
        </>
      )}
    </div>
  );
}

function MiniCard({ icon, label, value, sub, tone = "default" }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  const border = tone === "rose" ? "border-rose-500/30" : tone === "amber" ? "border-amber-500/30" : tone === "emerald" ? "border-emerald-500/30" : "border-white/10";
  const text = tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : tone === "emerald" ? "text-emerald-300" : "text-white";
  return (
    <div className={`rounded-xl border ${border} bg-white/[0.02] p-3`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500">{icon}{label}</div>
      <div className={`truncate text-base font-bold ${text}`} title={value}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
