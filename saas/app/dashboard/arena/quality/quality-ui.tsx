"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, Gauge, Lightbulb, ArrowRight, TrendingUp, Lock } from "lucide-react";
import Link from "next/link";

type Q = {
  resolution: number;
  completeness: number;
  knowledge: number;
  confidence: number;
  flow: number;
  hallucinationRisk: number;
  overall: number;
  createdAt?: string;
};
type Data = { latest: Q | null; history: Q[]; trend: number[]; readyForConfiguration: string[] };

function color(s: number) {
  return s >= 80 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-rose-400";
}
function barColor(s: number) {
  return s >= 80 ? "bg-emerald-400" : s >= 50 ? "bg-amber-400" : "bg-rose-400";
}
function Bar({ label, val, invert }: { label: string; val: number; invert?: boolean }) {
  const c = invert
    ? val <= 20
      ? "bg-emerald-400"
      : val <= 50
        ? "bg-amber-400"
        : "bg-rose-400"
    : barColor(val);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-28 shrink-0">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${c}`} style={{ width: `${val}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-300 w-8 text-left">{val}</span>
    </div>
  );
}

export default function QualityUi() {
  const [data, setData] = useState<Data | null>(null);
  const [recs, setRecs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/quality", { cache: "no-store" }).then((r) => r.json());
      if (j.ok) setData(j);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run() {
    setRunning(true);
    try {
      const j = await fetch("/api/arena/quality/run", { method: "POST" }).then((r) => r.json());
      if (j.ok) setRecs(j.recommendations || []);
      await load();
    } finally {
      setRunning(false);
    }
  }

  const q = data?.latest;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">معيار جودة المحادثة</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            درجات حقيقية من محادثات ساحة الاختبار والنتائج وأحداث الهلوسة وعقل المعرفة.
          </p>
          <Link
            href="/dashboard/arena"
            className="text-xs text-brand-200 hover:underline inline-flex items-center gap-1 mt-1"
          >
            رجوع لساحة الاختبار <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{" "}
          حساب الجودة
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !q ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <Gauge className="h-10 w-10 opacity-40" />
          <div className="font-medium text-slate-200">لم تُحسب الجودة بعد</div>
          <div className="text-sm">اضغط «حساب الجودة».</div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <h2 className="font-bold inline-flex items-center gap-2">
              <Gauge className="h-4 w-4 text-brand-300" /> الدرجة الكلية
            </h2>
            <div className={`text-5xl font-extrabold tabular-nums ${color(q.overall)}`}>
              {q.overall}
              <span className="text-sm text-slate-400">/100</span>
            </div>
            <div className="space-y-1.5">
              <Bar label="معدّل الحل" val={q.resolution} />
              <Bar label="الاكتمال" val={q.completeness} />
              <Bar label="تغطية المعرفة" val={q.knowledge} />
              <Bar label="الثقة" val={q.confidence} />
              <Bar label="انسياب المحادثة" val={q.flow} />
              <Bar label="خطر الهلوسة" val={q.hallucinationRisk} invert />
            </div>
            {data!.trend.length > 1 && (
              <div className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> {data!.trend.join(" ← ")}
              </div>
            )}
          </section>

          <div className="space-y-4">
            {recs.length > 0 && (
              <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
                <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-300" /> التوصيات
                </h2>
                <ul className="space-y-1 text-xs text-slate-300 list-disc pr-4">
                  {recs.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" /> جاهز للإعداد (يتطلب مزوّد LLM)
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data!.readyForConfiguration.map((r, i) => (
                  <span
                    key={i}
                    className="text-[11px] rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-slate-400"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
