"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Play, ArrowRight, TrendingUp, Clock } from "lucide-react";
import Link from "next/link";

type Job = {
  id: string;
  type: string;
  status: string;
  beforeScore: number;
  afterScore: number;
  improvement: number;
  note: string;
  createdAt: string;
  completedAt: string | null;
};
type OptType = { key: string; label: string };
type Data = { queue: Job[]; history: Job[]; types: OptType[] };

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "في الانتظار", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  running: { label: "قيد التشغيل", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  completed: { label: "مكتمل", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  failed: { label: "فشل", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

export default function OptimizeUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("knowledge");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/optimize", { cache: "no-store" }).then((r) => r.json());
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

  async function queue() {
    setBusy("__queue__");
    try {
      await fetch("/api/arena/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function run(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/arena/optimize/${id}/run`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const label = (k: string) => data?.types.find((t) => t.key === k)?.label || k;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">محرّك التحسين التلقائي</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            مهام تحسين حقيقية (إعادة فهرسة، بناء المخطط) تُقاس قبل/بعد عبر إعادة تشغيل ساحة
            الاختبار.
          </p>
          <Link
            href="/dashboard/arena"
            className="text-xs text-brand-200 hover:underline inline-flex items-center gap-1 mt-1"
          >
            رجوع لساحة الاختبار <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
          >
            {(data?.types || []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={queue}
            disabled={busy !== null}
            className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
          >
            {busy === "__queue__" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}{" "}
            إضافة للطابور
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        loadFailed && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.08] p-10 text-center text-rose-200">
            <div className="mb-2">تعذّر تحميل البيانات</div>
            <button onClick={load} className="text-sm underline text-slate-300 hover:text-white">إعادة المحاولة</button>
          </div>
        )
      ) : (
        <>
          <section>
            <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" /> الطابور ({data.queue.length})
            </h2>
            {data.queue.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
                الطابور فارغ. اختر نوعاً وأضِفه للطابور.
              </div>
            ) : (
              <div className="space-y-2">
                {data.queue.map((j) => (
                  <div
                    key={j.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] rounded-full border px-2 py-0.5 ${STATUS[j.status]?.cls}`}
                      >
                        {STATUS[j.status]?.label}
                      </span>
                      <span className="font-medium text-sm">{label(j.type)}</span>
                    </div>
                    <button
                      onClick={() => run(j.id)}
                      disabled={busy === j.id}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {busy === j.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}{" "}
                      تشغيل
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-bold text-sm mb-2">السجل ({data.history.length})</h2>
            {data.history.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-500 text-xs">
                لا يوجد سجل بعد.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-white/5 text-slate-400">
                      <tr>
                        <th className="text-right p-3">النوع</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">قبل</th>
                        <th className="text-right p-3">بعد</th>
                        <th className="text-right p-3">التحسّن</th>
                        <th className="text-right p-3">ملاحظة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((j) => (
                        <tr key={j.id} className="border-t border-white/5">
                          <td className="p-3">{label(j.type)}</td>
                          <td className="p-3">
                            <span
                              className={`text-[11px] rounded-full border px-2 py-0.5 ${STATUS[j.status]?.cls}`}
                            >
                              {STATUS[j.status]?.label}
                            </span>
                          </td>
                          <td className="p-3 tabular-nums">{j.beforeScore}</td>
                          <td className="p-3 tabular-nums">{j.afterScore}</td>
                          <td className="p-3 tabular-nums">
                            <span
                              className={j.improvement >= 0 ? "text-emerald-300" : "text-rose-300"}
                            >
                              <TrendingUp className="inline h-3 w-3" />{" "}
                              {j.improvement >= 0 ? "+" : ""}
                              {j.improvement}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-400 max-w-[220px]">{j.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
