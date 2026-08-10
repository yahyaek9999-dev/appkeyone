"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Play,
  Trophy,
  CheckCircle2,
  Lightbulb,
  BarChart3,
  Swords,
  MessagesSquare,
  Gauge,
} from "lucide-react";

type Cat = {
  key: string;
  label: string;
  pass: number;
  weak: number;
  fail: number;
  avgConfidence: number;
};
type Weak = { category: string; label: string; fail: number; weak: number; suggestion: string };
type Sample = {
  category: string;
  message: string;
  confidence: number;
  verdict: string;
  topDoc: string;
};
type Comp = {
  total: number;
  keyoneHas: number;
  coverageScore: number;
  perCompetitor: { competitor: string; coverage: number; has: number }[];
  strengths: string[];
  gaps: string[];
  capabilities: any[];
};
type Data = {
  corpus: { total: number; categories: { key: string; label: string; count: number }[] };
  run: null | {
    total: number;
    passed: number;
    weak: number;
    failed: number;
    score: number;
    avgConfidence: number;
    createdAt: string;
  };
  categories: Cat[];
  weaknesses: Weak[];
  samples: Sample[];
  competitors: Comp;
};

const VERDICT: Record<string, string> = {
  pass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  weak: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  fail: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};
function scoreColor(s: number) {
  return s >= 80 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-rose-400";
}
const COMP_LABEL: Record<string, string> = {
  intercom: "Intercom",
  zendesk: "Zendesk",
  manychat: "ManyChat",
  respondio: "Respond.io",
};

export default function ArenaUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"results" | "competitors">("results");
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena", { cache: "no-store" }).then((r) => r.json());
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

  async function run() {
    setRunning(true);
    try {
      await fetch("/api/arena/run", { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">اختبار أداء المساعد</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يشغّل {data?.corpus.total || 120}+ سيناريو عميل عبر محرّك الاسترجاع الحقيقي ليقيس جاهزية
            معرفتك، يكشف نقاط الضعف، ويقترح إصلاحات.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/dashboard/arena/simulate"
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium inline-flex items-center gap-2 hover:bg-white/10"
          >
            <MessagesSquare className="h-4 w-4" /> محاكاة محادثة
          </a>
          <a
            href="/dashboard/arena/benchmark"
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-medium inline-flex items-center gap-2 hover:bg-white/10"
          >
            <Gauge className="h-4 w-4" /> المعايير
          </a>
          <button
            onClick={run}
            disabled={running}
            className="px-4 py-2 rounded-xl bg-brand-500/20 border border-brand-500/40 text-brand-100 text-sm font-medium inline-flex items-center gap-2 hover:bg-brand-500/30 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{" "}
            {running ? `جارٍ تشغيل ${data?.corpus.total || 120} سيناريو…` : "تشغيل الاختبار"}
          </button>
        </div>
      </div>

      {running && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.06] px-4 py-3 text-sm text-brand-200 inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> يجري تشغيل السيناريوهات وتقييم الردود…
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
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setTab("results")}
              className={`px-3 py-1.5 rounded-lg text-sm border inline-flex items-center gap-1.5 ${tab === "results" ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"}`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> النتائج
            </button>
            <button
              onClick={() => setTab("competitors")}
              className={`px-3 py-1.5 rounded-lg text-sm border inline-flex items-center gap-1.5 ${tab === "competitors" ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"}`}
            >
              <Swords className="h-3.5 w-3.5" /> مقارنة المنافسين
            </button>
          </div>

          {tab === "results" ? (
            !data.run ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
                <Trophy className="h-10 w-10 opacity-40" />
                <div className="font-medium text-slate-200">لم يُشغّل اختبار بعد</div>
                <div className="text-sm">
                  اضغط «تشغيل الاختبار» لتشغيل {data.corpus.total} سيناريو عبر معرفتك.
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col items-center justify-center text-center">
                    <div
                      className={`text-5xl font-extrabold tabular-nums ${scoreColor(data.run.score)}`}
                    >
                      {data.run.score}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">درجة الجاهزية / 100</div>
                    <div className="text-[10px] text-slate-500 mt-2">
                      {new Date(data.run.createdAt).toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Kpi label="إجمالي" value={data.run.total} />
                    <Kpi label="ناجح" value={data.run.passed} tone="ok" />
                    <Kpi label="ضعيف" value={data.run.weak} tone="warn" />
                    <Kpi
                      label="فاشل"
                      value={data.run.failed}
                      tone={data.run.failed > 0 ? "bad" : "ok"}
                    />
                  </div>
                </div>

                {/* Recommendations */}
                {data.weaknesses.length > 0 && (
                  <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
                    <h2 className="font-bold mb-3 inline-flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-300" /> التوصيات (
                      {data.weaknesses.length})
                    </h2>
                    <div className="space-y-2">
                      {data.weaknesses.map((w) => (
                        <div
                          key={w.category}
                          className="rounded-xl bg-white/5 border border-white/10 p-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-sm font-medium">
                            <span>{w.label}</span>
                            <span className="text-xs text-slate-400">
                              {w.fail} فاشل · {w.weak} ضعيف
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-1">
                            <span className="text-slate-500">الإصلاح: </span>
                            {w.suggestion}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Category breakdown */}
                <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="border-b border-white/10 p-3 font-bold text-sm">حسب الفئة</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead className="bg-white/5 text-slate-400">
                        <tr>
                          <th className="text-right p-3">الفئة</th>
                          <th className="text-right p-3">ناجح</th>
                          <th className="text-right p-3">ضعيف</th>
                          <th className="text-right p-3">فاشل</th>
                          <th className="text-right p-3">متوسط الثقة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.categories.map((c) => (
                          <tr key={c.key} className="border-t border-white/5">
                            <td className="p-3 font-medium">{c.label}</td>
                            <td className="p-3 tabular-nums text-emerald-300">{c.pass}</td>
                            <td className="p-3 tabular-nums text-amber-300">{c.weak}</td>
                            <td className="p-3 tabular-nums text-rose-300">{c.fail}</td>
                            <td className="p-3 tabular-nums">{c.avgConfidence}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Failing samples */}
                {data.samples.length > 0 && (
                  <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <h2 className="font-bold mb-3 text-sm">عيّنات تحتاج تحسين</h2>
                    <div className="space-y-2">
                      {data.samples.map((s, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full border px-2 py-0.5 ${VERDICT[s.verdict]}`}>
                            {s.verdict}
                          </span>
                          <span className="text-slate-300">«{s.message}»</span>
                          <span className="text-slate-500">· ثقة {s.confidence}%</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )
          ) : (
            /* Competitor benchmark */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.08] p-4 text-center">
                  <div className="text-3xl font-extrabold text-brand-200 tabular-nums">
                    {data.competitors.coverageScore}%
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">KEYONE تغطية</div>
                </div>
                {data.competitors.perCompetitor.map((c) => (
                  <div
                    key={c.competitor}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center"
                  >
                    <div className="text-3xl font-extrabold tabular-nums">{c.coverage}%</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {COMP_LABEL[c.competitor]}
                    </div>
                  </div>
                ))}
              </div>

              <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <h2 className="font-bold mb-2 inline-flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" /> نقاط القوة (
                  {data.competitors.strengths.length})
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {data.competitors.strengths.map((s, i) => (
                    <span
                      key={i}
                      className="text-[11px] rounded-full bg-white/5 border border-white/10 px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="border-b border-white/10 p-3 font-bold text-sm">مصفوفة القدرات</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-white/5 text-slate-400">
                      <tr>
                        <th className="text-right p-3">القدرة</th>
                        <th className="p-3">KEYONE</th>
                        <th className="p-3">Intercom</th>
                        <th className="p-3">Zendesk</th>
                        <th className="p-3">ManyChat</th>
                        <th className="p-3">Respond.io</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.competitors.capabilities.map((c: any) => (
                        <tr key={c.key} className="border-t border-white/5">
                          <td className="p-3">{c.label}</td>
                          {["keyone", "intercom", "zendesk", "manychat", "respondio"].map((k) => (
                            <td key={k} className="p-3 text-center">
                              {c[k] ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 inline" />
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${cls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  );
}
