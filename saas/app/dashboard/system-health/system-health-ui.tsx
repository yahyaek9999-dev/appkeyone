"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Loader2, Server, Database, Smartphone, Brain,
  AlertTriangle, HardDrive, Zap, Wifi, Clock, RefreshCw,
  CheckCircle2, XCircle, BarChart3, Shield, Megaphone,
} from "lucide-react";

type SubsystemState = "ok" | "degraded" | "down" | "unknown";
type Subsystem = { status: SubsystemState; detail: string };

type Metric = {
  overall?: SubsystemState;
  version?: string;
  subsystems?: Record<string, Subsystem>;
  server: { cpuModel: string; cpuCores: number; totalMemMB: number; freeMemMB: number; usedMemMB: number; heapUsedMB: number; heapTotalMB: number; rssMB: number; uptimeSec: number };
  database: { sizeBytes: number | null; messages: number; customers: number; orders: number };
  queue: { queued: number; failed24h: number; deadLetter: number };
  whatsapp: { activeSessions: number };
  ai: { calls7d: number; inputTokens7d: number; outputTokens7d: number; cacheHits7d: number };
  errors: { critical24h: number; warn24h: number };
  broadcasts: { sending: number; queued: number };
};

// Distinct failure modes so the UI can explain *what* went wrong + the fix,
// instead of one catch-all "failed to load" message.
type LoadError =
  | { kind: "auth"; detail?: string }
  | { kind: "network"; detail?: string }
  | { kind: "server"; detail?: string };

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
  const [error, setError] = useState<LoadError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/system/health", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        setError({ kind: "auth" });
        setData(null);
        return;
      }
      if (!r.ok) {
        setError({ kind: "server", detail: `HTTP ${r.status}` });
        setData(null);
        return;
      }
      const j = await r.json();
      // Only treat a response as failed when it carries an error AND no usable
      // subsystem data. The endpoint is fail-open: if it returned subsystems we
      // render them even when some are degraded/down — a single unhealthy
      // provider must never blank the whole page.
      if (j?.error && !j?.subsystems) {
        setError({ kind: "server", detail: String(j.error) });
        setData(null);
        return;
      }
      setData(j);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      // fetch() rejects on network failure / offline / DNS — distinct from a
      // server 500 (which resolves with !r.ok above).
      setError({ kind: "network", detail: e instanceof Error ? e.message : undefined });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  const memPct = data && data.server.totalMemMB > 0 ? data.server.usedMemMB / data.server.totalMemMB : 0;
  const overallOk = data && data.queue.failed24h === 0 && data.errors.critical24h === 0 && data.queue.deadLetter === 0;
  // Name the specific degradation(s) so the banner is actionable, not generic.
  const issues: string[] = [];
  if (data) {
    if (data.queue.deadLetter > 0) issues.push(`${data.queue.deadLetter} رسالة فشلت نهائياً (dead-letter)`);
    if (data.queue.failed24h > 0) issues.push(`${data.queue.failed24h} فشل إرسال خلال 24 ساعة`);
    if (data.errors.critical24h > 0) issues.push(`${data.errors.critical24h} خطأ حرج خلال 24 ساعة`);
  }

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
        <HealthSkeleton />
      ) : !data ? (
        <ErrorState error={error} onRetry={fetchData} retrying={loading} />
      ) : (
        <>
          {/* Overall status banner */}
          <div className={`card p-4 flex items-center gap-3 ${overallOk ? "border-brand-500/20 bg-brand-500/[0.04]" : "border-rose-500/20 bg-rose-500/[0.04]"}`}>
            {overallOk ? (
              <CheckCircle2 className="h-5 w-5 text-brand-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            )}
            <div className="min-w-0">
              <span className={`text-sm font-medium ${overallOk ? "text-brand-300" : "text-rose-300"}`}>
                {overallOk ? "النظام يعمل بشكل طبيعي" : "النظام يعمل مع تحذيرات تحتاج مراجعة"}
              </span>
              {!overallOk && issues.length > 0 && (
                <p className="mt-0.5 truncate text-xs text-rose-300/70">{issues.join(" · ")}</p>
              )}
            </div>
          </div>

          {/* Per-subsystem status grid — each dependency reports ok/degraded/down
              independently so a single failure is visible without crashing. */}
          {data.subsystems && (
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="section-title flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" /> حالة الأنظمة الفرعية
                </h3>
                {data.version && (
                  <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-slate-400">
                    إصدار: {data.version}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <SubsystemCard name="قاعدة البيانات" icon={<Database className="h-4 w-4" />} sub={data.subsystems.database} />
                <SubsystemCard name="واتساب" icon={<Smartphone className="h-4 w-4" />} sub={data.subsystems.whatsapp} />
                <SubsystemCard name="الطابور" icon={<Activity className="h-4 w-4" />} sub={data.subsystems.queue} />
                <SubsystemCard name="مزود الذكاء الاصطناعي" icon={<Brain className="h-4 w-4" />} sub={data.subsystems.aiProvider} />
                <SubsystemCard name="العامل (Worker)" icon={<Server className="h-4 w-4" />} sub={data.subsystems.worker} />
                <SubsystemCard name="Redis" icon={<Zap className="h-4 w-4" />} sub={data.subsystems.redis} />
              </div>
            </div>
          )}

          {/* Server */}
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-400" /> الخادم
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniCard icon={<Zap className="h-4 w-4" />} label="المعالج" value={(data.server.cpuModel || "—").replace(/\(R\)|\(TM\)|Processor/gi, "").trim().slice(0, 28) || "—"} sub={`${data.server.cpuCores || 0} نواة`} />
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
                <Megaphone className="h-4 w-4 text-gold-400" /> البث الجماعي
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
              <Brain className="h-4 w-4 text-gold-400" /> الذكاء الاصطناعي (آخر 7 أيام)
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

// Loading skeleton — mirrors the real layout so the page doesn't jump on load.
function HealthSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="جارٍ تحميل بيانات المراقبة">
      <div className="card h-14 p-4" />
      {[0, 1].map((i) => (
        <div key={i} className="card p-5">
          <div className="mb-4 h-4 w-32 rounded bg-white/[0.06]" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 h-3 w-16 rounded bg-white/[0.06]" />
                <div className="h-5 w-20 rounded bg-white/[0.06]" />
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
    auth: {
      title: "انتهت الجلسة",
      desc: "يبدو أن جلستك انتهت. سجّل الدخول مرة أخرى لعرض بيانات المراقبة.",
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
      title: "تعذّر تحميل البيانات",
      desc: "حدث خطأ مؤقت أثناء جمع مؤشرات النظام. عادةً ما يُحل بإعادة المحاولة.",
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

// Per-subsystem status card — colored dot + label + one-line detail.
function SubsystemCard({ name, icon, sub }: { name: string; icon: React.ReactNode; sub?: Subsystem }) {
  const status = sub?.status ?? "unknown";
  const cfg = {
    ok: { dot: "bg-emerald-400", border: "border-emerald-500/30", label: "سليم", text: "text-emerald-300" },
    degraded: { dot: "bg-amber-400", border: "border-amber-500/30", label: "متدهور", text: "text-amber-300" },
    down: { dot: "bg-rose-500", border: "border-rose-500/40", label: "متوقف", text: "text-rose-300" },
    unknown: { dot: "bg-slate-500", border: "border-white/10", label: "غير معروف", text: "text-slate-400" },
  }[status];
  return (
    <div className={`rounded-xl border ${cfg.border} bg-white/[0.02] p-3`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">{icon}{name}</div>
        <span className={`flex items-center gap-1 text-[10px] font-medium ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${status === "down" ? "animate-pulse" : ""}`} />
          {cfg.label}
        </span>
      </div>
      <div className="truncate text-xs text-slate-400" title={sub?.detail}>{sub?.detail ?? "—"}</div>
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
