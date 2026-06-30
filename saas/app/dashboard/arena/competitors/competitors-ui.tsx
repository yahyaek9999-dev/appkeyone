"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Swords, CheckCircle2, AlertTriangle, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";

type Dim = { key: string; label: string };
type Run = Record<string, number> & { overall: number; createdAt: string };
type Data = {
  latest: Run | null;
  history: Run[];
  dimensions: Dim[];
  competitorBaselines: Record<string, Record<string, number>>;
  strengths: string[];
  weaknesses: string[];
  trend: number[];
};
const COMP_LABEL: Record<string, string> = {
  intercom: "Intercom",
  zendesk: "Zendesk",
  manychat: "ManyChat",
  freshdesk: "Freshdesk",
};

export default function CompetitorBenchUi() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/arena/competitor-benchmark", { cache: "no-store" }).then((r) =>
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
      await fetch("/api/arena/competitor-benchmark/run", { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  }

  const comps = data ? Object.keys(data.competitorBaselines) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">مقارنة المنافسين (Real)</h1>
          <p className="text-sm text-slate-400 max-w-xl">
            يحسب درجات KEYONE لكل بُعد من إعدادك الفعلي ويقارنها بالمنافسين، مع حفظ كل تشغيل وتتبّع
            التطوّر.
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
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}{" "}
          تشغيل المقارنة
        </button>
      </div>

      {loading && !data ? (
        <div className="p-12 text-center text-slate-400">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
        </div>
      ) : !data || !data.latest ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-400 flex flex-col items-center gap-3">
          <Swords className="h-10 w-10 opacity-40" />
          <div className="font-medium text-slate-200">لا توجد مقارنة بعد</div>
          <div className="text-sm">اضغط «تشغيل المقارنة» لقياس KEYONE مقابل المنافسين.</div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.06] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">الدرجة الكلية لـ KEYONE</div>
            <div className="text-3xl font-extrabold text-brand-200 tabular-nums">
              {data.latest.overall}
              <span className="text-sm text-slate-400">/100</span>
            </div>
            {data.trend.length > 1 && (
              <div className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> {data.trend.join(" ← ")}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/10 p-3 font-bold text-sm">
              المقارنة حسب البُعد
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-white/5 text-slate-400">
                  <tr>
                    <th className="text-right p-3">البُعد</th>
                    <th className="p-3 text-brand-200">KEYONE</th>
                    {comps.map((c) => (
                      <th key={c} className="p-3">
                        {COMP_LABEL[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dimensions.map((d) => {
                    const mine = (data.latest as any)[d.key] as number;
                    return (
                      <tr key={d.key} className="border-t border-white/5">
                        <td className="p-3">{d.label}</td>
                        <td className="p-3 text-center font-bold tabular-nums text-brand-200">
                          {mine}
                        </td>
                        {comps.map((c) => {
                          const v = data.competitorBaselines[c][d.key];
                          return (
                            <td
                              key={c}
                              className={`p-3 text-center tabular-nums ${mine >= v ? "text-emerald-300" : "text-slate-400"}`}
                            >
                              {v}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" /> نقاط القوة (
                {data.strengths.length})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data.strengths.map((s, i) => (
                  <span
                    key={i}
                    className="text-[11px] rounded-full bg-white/5 border border-white/10 px-2 py-0.5"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <h2 className="font-bold text-sm mb-2 inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-300" /> نقاط الضعف (
                {data.weaknesses.length})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data.weaknesses.length ? (
                  data.weaknesses.map((s, i) => (
                    <span
                      key={i}
                      className="text-[11px] rounded-full bg-white/5 border border-white/10 px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">
                    لا توجد — KEYONE متفوّق في كل الأبعاد.
                  </span>
                )}
              </div>
            </section>
          </div>

          {data.history.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="border-b border-white/10 p-3 font-bold text-sm">
                سجل التشغيل ({data.history.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead className="bg-white/5 text-slate-400">
                    <tr>
                      <th className="text-right p-3">التاريخ</th>
                      <th className="p-3">الدرجة الكلية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="p-3 text-xs">
                          {new Date(h.createdAt).toLocaleString("ar-EG")}
                        </td>
                        <td className="p-3 text-center tabular-nums">{h.overall}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
