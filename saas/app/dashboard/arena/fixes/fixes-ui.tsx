"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Wand2, CheckCircle2, XCircle, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";

type Fix = {
  id: string;
  type: string;
  category: string;
  title: string;
  detail: string;
  status: string;
  beforeScore: number;
  afterScore: number;
  improvement: number;
  createdAt: string;
};
type Data = { queued: Fix[]; history: Fix[] };

export default function FixesUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/fixes", { cache: "no-store" }).then((r) => r.json());
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

  async function generate() {
    setGen(true);
    setNote(null);
    try {
      const j = await fetch("/api/arena/fixes/generate", { method: "POST" }).then((r) => r.json());
      if (j.ok) setNote(`تم توليد ${j.created} إصلاحاً من ${j.weaknesses} نقطة ضعف.`);
      await load();
    } finally {
      setGen(false);
    }
  }
  async function apply(id: string) {
    setBusy(id);
    setNote(null);
    try {
      const j = await fetch(`/api/arena/fixes/${id}/apply`, { method: "POST" }).then((r) =>
        r.json(),
      );
      if (j.ok)
        setNote(
          `طُبّق الإصلاح — الدرجة من ${j.before} إلى ${j.after} (${j.improvement >= 0 ? "+" : ""}${j.improvement}).`,
        );
      await load();
    } finally {
      setBusy(null);
    }
  }
  async function reject(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/arena/fixes/${id}/reject`, { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">محرّك الإصلاح التلقائي</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يولّد إصلاحات من نقاط ضعف ساحة الاختبار. التطبيق يُنشئ مستند معرفة حقيقي، يعيد الفهرسة،
            ويعيد تشغيل الاختبار لقياس التحسّن فعلياً.
          </p>
          <Link
            href="/dashboard/arena"
            className="text-xs text-brand-200 hover:underline inline-flex items-center gap-1 mt-1"
          >
            رجوع لساحة الاختبار <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          onClick={generate}
          disabled={gen}
          className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
        >
          {gen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} توليد
          الإصلاحات
        </button>
      </div>

      {note && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-2.5 text-sm text-emerald-200">
          {note}
        </div>
      )}

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
          {/* Queue */}
          <section>
            <h2 className="font-bold text-sm mb-2">قائمة الانتظار ({data.queued.length})</h2>
            {data.queued.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400 text-sm">
                لا توجد إصلاحات في الانتظار. اضغط «توليد الإصلاحات».
              </div>
            ) : (
              <div className="space-y-2">
                {data.queued.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-medium text-sm">{f.title}</div>
                      <div className="text-xs text-slate-400">{f.detail}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => apply(f.id)}
                        disabled={busy === f.id}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {busy === f.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}{" "}
                        تطبيق
                      </button>
                      <button
                        onClick={() => reject(f.id)}
                        disabled={busy === f.id}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* History */}
          <section>
            <h2 className="font-bold text-sm mb-2">السجل ({data.history.length})</h2>
            {data.history.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-500 text-xs">
                لا يوجد سجل بعد.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead className="bg-white/5 text-slate-400">
                      <tr>
                        <th className="text-right p-3">الإصلاح</th>
                        <th className="text-right p-3">الحالة</th>
                        <th className="text-right p-3">قبل</th>
                        <th className="text-right p-3">بعد</th>
                        <th className="text-right p-3">التحسّن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.history.map((f) => (
                        <tr key={f.id} className="border-t border-white/5">
                          <td className="p-3">{f.title}</td>
                          <td className="p-3">
                            {f.status === "applied" ? (
                              <span className="text-emerald-300">مطبّق</span>
                            ) : (
                              <span className="text-slate-400">مرفوض</span>
                            )}
                          </td>
                          <td className="p-3 tabular-nums">
                            {f.status === "applied" ? f.beforeScore : "—"}
                          </td>
                          <td className="p-3 tabular-nums">
                            {f.status === "applied" ? f.afterScore : "—"}
                          </td>
                          <td className="p-3 tabular-nums">
                            {f.status === "applied" ? (
                              <span
                                className={
                                  f.improvement >= 0 ? "text-emerald-300" : "text-rose-300"
                                }
                              >
                                <TrendingUp className="inline h-3 w-3" />{" "}
                                {f.improvement >= 0 ? "+" : ""}
                                {f.improvement}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
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
