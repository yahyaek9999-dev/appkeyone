"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, Brain, Gauge, Lightbulb, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";

type Brain = {
  coverage: number;
  retrievalAccuracy: number;
  missingKnowledge: number;
  conflicts: number;
  density: number;
  health: number;
  score: number;
  createdAt?: string;
};
type Readiness = {
  knowledge: number;
  arena: number;
  monitoring: number;
  revenue: number;
  prompts: number;
  integrations: number;
  automation: number;
  score: number;
  level: string;
  createdAt?: string;
};
type Data = {
  brain: Brain | null;
  readiness: Readiness | null;
  brainHistory: Brain[];
  readinessHistory: Readiness[];
};

const LEVEL: Record<string, { label: string; cls: string }> = {
  excellent: { label: "ممتاز", cls: "text-emerald-400" },
  good: { label: "جيد", cls: "text-sky-400" },
  weak: { label: "ضعيف", cls: "text-amber-400" },
  critical: { label: "حرج", cls: "text-rose-400" },
};
function color(s: number) {
  return s >= 80 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-rose-400";
}
function barColor(s: number) {
  return s >= 80 ? "bg-emerald-400" : s >= 50 ? "bg-amber-400" : "bg-rose-400";
}

function Bar({ label, val }: { label: string; val: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-24 shrink-0">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${barColor(val)}`} style={{ width: `${val}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-300 w-8 text-left">{val}</span>
    </div>
  );
}

export default function BenchmarkUi() {
  const [data, setData] = useState<Data | null>(null);
  const [recs, setRecs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/benchmark", { cache: "no-store" }).then((r) => r.json());
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
      const j = await fetch("/api/arena/benchmark/run", { method: "POST" }).then((r) => r.json());
      if (j.ok) setRecs(j.brain?.recommendations || []);
      await load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">جاهزية المساعد</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يقيس قوة عقل المعرفة (TA-7) ويحسب درجة جاهزية الذكاء الموحّدة (TA-9) من كل أنظمتك
            الفعلية.
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
          حساب المعايير
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data || (!data.brain && !data.readiness) ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <Gauge className="h-10 w-10 opacity-40" />
          <div className="font-medium text-slate-200">لم تُحسب المعايير بعد</div>
          <div className="text-sm">اضغط «حساب المعايير» لقياس عقل المعرفة وجاهزية الذكاء.</div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* TA-7 Brain Benchmark */}
          {data.brain && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
              <h2 className="font-bold inline-flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-300" /> معيار العقل (Brain Score)
              </h2>
              <div className="flex items-end gap-3">
                <div className={`text-5xl font-extrabold tabular-nums ${color(data.brain.score)}`}>
                  {data.brain.score}
                </div>
                <div className="text-xs text-slate-400 mb-2">/ 100</div>
              </div>
              <div className="space-y-1.5">
                <Bar label="التغطية" val={data.brain.coverage} />
                <Bar label="دقة الاسترجاع" val={data.brain.retrievalAccuracy} />
                <Bar label="الكثافة" val={data.brain.density} />
                <Bar label="الصحة" val={data.brain.health} />
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-amber-200">
                  فجوات: {data.brain.missingKnowledge}
                </span>
                <span className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-2 py-1 text-rose-200">
                  تعارضات: {data.brain.conflicts}
                </span>
              </div>
              {recs.length > 0 && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-xs font-bold mb-1.5 inline-flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-300" /> توصيات
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-300 list-disc pr-4">
                    {recs.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* TA-9 AI Readiness */}
          {data.readiness && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
              <h2 className="font-bold inline-flex items-center gap-2">
                <Gauge className="h-4 w-4 text-brand-300" /> جاهزية المساعد
              </h2>
              <div className="flex items-end gap-3">
                <div
                  className={`text-5xl font-extrabold tabular-nums ${color(data.readiness.score)}`}
                >
                  {data.readiness.score}
                </div>
                <div className={`mb-2 text-sm font-bold ${LEVEL[data.readiness.level]?.cls}`}>
                  {LEVEL[data.readiness.level]?.label}
                </div>
              </div>
              <div className="space-y-1.5">
                <Bar label="المعرفة" val={data.readiness.knowledge} />
                <Bar label="ساحة الاختبار" val={data.readiness.arena} />
                <Bar label="البرومبت" val={data.readiness.prompts} />
                <Bar label="التكاملات" val={data.readiness.integrations} />
                <Bar label="الأتمتة" val={data.readiness.automation} />
                <Bar label="الرصد" val={data.readiness.monitoring} />
                <Bar label="الإيرادات" val={data.readiness.revenue} />
              </div>
              {data.readinessHistory.length > 1 && (
                <div className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> آخر القياسات:{" "}
                  {data.readinessHistory
                    .slice(0, 6)
                    .map((h) => h.score)
                    .join(" ← ")}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
