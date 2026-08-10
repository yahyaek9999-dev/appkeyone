"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Play,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

type Severity = "critical" | "high" | "medium" | "low";
type Issue = {
  area: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  href?: string;
};
type Data = {
  score: number;
  counts: { critical: number; high: number; medium: number; low: number; total: number };
  issues: Issue[];
  lastRun: { createdAt: string; score: number } | null;
};

const SEV: Record<Severity, { label: string; cls: string; icon: any }> = {
  critical: {
    label: "حرج",
    cls: "border-rose-500/40 bg-rose-500/[0.08] text-rose-200",
    icon: AlertOctagon,
  },
  high: {
    label: "مرتفع",
    cls: "border-orange-500/40 bg-orange-500/[0.08] text-orange-200",
    icon: AlertTriangle,
  },
  medium: {
    label: "متوسط",
    cls: "border-amber-500/40 bg-amber-500/[0.08] text-amber-200",
    icon: AlertTriangle,
  },
  low: { label: "منخفض", cls: "border-sky-500/40 bg-sky-500/[0.08] text-sky-200", icon: Info },
};

function scoreColor(s: number) {
  return s >= 80 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-rose-400";
}

export default function AuditUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/ai-audit", { cache: "no-store" });
      if (!r.ok) {
        setError("تعذّر تحميل التدقيق.");
        return;
      }
      const j = await r.json();
      if (j.ok) setData(j);
      else setError("تعذّر تحميل التدقيق.");
    } catch {
      setError("تعذّر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/ai-audit/run", { method: "POST" });
      if (!r.ok) {
        setError("فشل تشغيل التدقيق.");
        return;
      }
      await load();
    } catch {
      setError("فشل تشغيل التدقيق.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">تدقيق جاهزية المساعد</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يفحص إعداد مساعدك بالكامل ويعطيك درجة جاهزية مع قائمة إصلاحات مرتّبة بالأولوية.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{" "}
          تشغيل التدقيق
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] text-rose-200 px-4 py-3 text-sm inline-flex items-center gap-2">
          <AlertOctagon className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
            <button onClick={load} className="text-sm underline text-slate-300 hover:text-white">إعادة المحاولة</button>
          </div>
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col items-center justify-center text-center">
              <div className={`text-5xl font-extrabold tabular-nums ${scoreColor(data.score)}`}>
                {data.score}
              </div>
              <div className="text-xs text-slate-400 mt-1">درجة الجاهزية / 100</div>
              {data.lastRun && (
                <div className="text-[10px] text-slate-500 mt-2">
                  آخر تشغيل: {new Date(data.lastRun.createdAt).toLocaleString("ar-EG")}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                <div key={s} className={`rounded-2xl border p-4 text-center ${SEV[s].cls}`}>
                  <div className="text-3xl font-bold tabular-nums">{data.counts[s]}</div>
                  <div className="text-[11px] mt-0.5">{SEV[s].label}</div>
                </div>
              ))}
            </div>
          </div>

          {data.issues.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
              <ShieldCheck className="h-10 w-10 text-emerald-400/70" />
              <div className="font-medium text-slate-200">إعداد مكتمل</div>
              <div className="text-sm">لم يُكتشف أي مشكلة في إعداد مساعدك. أحسنت!</div>
            </div>
          ) : (
            <div className="space-y-3">
              {data.issues.map((it, i) => {
                const Icon = SEV[it.severity].icon;
                return (
                  <div key={i} className={`rounded-2xl border p-4 ${SEV[it.severity].cls}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold inline-flex items-center gap-2">
                        <Icon className="h-4 w-4" /> {it.title}
                      </div>
                      <span className="text-[10px] uppercase rounded-full bg-black/20 px-2 py-0.5">
                        {it.area}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-200/90">{it.detail}</div>
                    <div className="mt-1.5 text-xs text-slate-300">
                      <span className="text-slate-400">الإصلاح: </span>
                      {it.fix}
                    </div>
                    {it.href && (
                      <Link
                        href={it.href}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-200 hover:underline"
                      >
                        انتقل للإصلاح <ArrowLeft className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
