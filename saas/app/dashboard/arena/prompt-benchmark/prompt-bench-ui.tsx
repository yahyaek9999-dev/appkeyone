"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Play, Trophy, ArrowRight, TrendingUp, MessageSquare } from "lucide-react";
import Link from "next/link";

type Run = {
  aLabel: string;
  aScore: number;
  bLabel: string;
  bScore: number;
  cLabel: string;
  cScore: number;
  winner: string;
  knowledgeCoverage: number;
  confidence: number;
  resolution: number;
  hallucinationRisk: number;
  arenaScore: number;
  brainScore: number;
  conversationQuality: number;
  createdAt?: string;
};
type Reply = { label: string; reply: string };
type Data = {
  latest: Run | null;
  history: Run[];
  trend: number[];
};

function color(s: number) {
  return s >= 80 ? "text-emerald-400" : s >= 50 ? "text-amber-400" : "text-rose-400";
}

export default function PromptBenchUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/prompt-benchmark", { cache: "no-store" }).then((r) =>
        r.json(),
      );
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
      const j = await fetch("/api/arena/prompt-benchmark/run", { method: "POST" }).then((r) => r.json());
      if (j.ok && Array.isArray(j.replies)) setReplies(j.replies);
      await load();
    } finally {
      setRunning(false);
    }
  }

  const r = data?.latest;
  const prompts = r
    ? [
        { label: r.aLabel, score: r.aScore },
        { label: r.bLabel, score: r.bScore },
        { label: r.cLabel, score: r.cScore },
      ]
    : [];
  const ctx = r
    ? [
        { label: "تغطية المعرفة", val: r.knowledgeCoverage },
        { label: "الثقة", val: r.confidence },
        { label: "معدّل الحل", val: r.resolution },
        { label: "درجة الساحة", val: r.arenaScore },
        { label: "درجة العقل", val: r.brainScore },
        { label: "جودة المحادثة", val: r.conversationQuality },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">مقارنة نصوص الردود</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يقارن 3 نسخ برومبت على معيار جودة حتمي (دقة الأسعار، التقاط العميل، التصعيد، النبرة،
            اللغة، النطاق) + سياق الساحة المشترك.
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
          تشغيل المقارنة
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !r ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <Trophy className="h-10 w-10 opacity-40" />
          <div className="font-medium text-slate-200">لا توجد مقارنة بعد</div>
          <div className="text-sm">اضغط «تشغيل المقارنة».</div>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {prompts.map((p, i) => {
              const isWinner = p.label === r.winner;
              return (
                <div
                  key={i}
                  className={`rounded-2xl border p-4 ${isWinner ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-white/10 bg-white/5"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400 truncate">{p.label}</span>
                    {isWinner && (
                      <span className="text-[10px] rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 px-2 py-0.5 inline-flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> فائز
                      </span>
                    )}
                  </div>
                  <div className={`text-3xl font-extrabold tabular-nums ${color(p.score)}`}>
                    {p.score}
                  </div>
                </div>
              );
            })}
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/10 p-3 font-bold text-sm">
              السياق المشترك (الاسترجاع/الساحة)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <tbody>
                  {ctx.map((c, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="p-3 text-slate-300">{c.label}</td>
                      <td className="p-3 tabular-nums text-left w-20">{c.val}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/5">
                    <td className="p-3 text-slate-300">خطر الهلوسة</td>
                    <td className="p-3 tabular-nums text-left">{r.hallucinationRisk}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {data!.trend.length > 1 && (
            <div className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> أفضل درجة عبر التشغيلات:{" "}
              {data!.trend.join(" ← ")}
            </div>
          )}

          {replies && (
            <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="border-b border-white/10 p-3 font-bold text-sm inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-400" /> الردود المولّدة (نفس السؤال التجريبي لكل نسخة)
              </div>
              <div className="divide-y divide-white/5">
                {replies.map((rp, i) => (
                  <div key={i} className="p-3">
                    <div className="text-xs text-slate-400 mb-1 truncate">{rp.label}</div>
                    <div className="text-sm text-slate-200 whitespace-pre-wrap">
                      {rp.reply || <span className="text-slate-500">— لم يتم توليد رد —</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
