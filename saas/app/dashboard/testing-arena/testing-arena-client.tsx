"use client";

import { useState } from "react";
import { Loader2, Play, CheckCircle2, AlertTriangle, XCircle, Lightbulb, MessageSquare } from "lucide-react";

type Check = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string; recommendation: string; fixHref?: string };
type Scenario = { key: string; label: string; message: string; reply: string; score: number; addressed: boolean; responded: boolean; weaknesses: string[]; suggestions: string[] };
type Result = { overall: number; auditScore: number; scenarioScore: number; checks: Check[]; scenarios: Scenario[]; recommendations: { priority: string; text: string; fixHref?: string }[] };

function tone(score: number): string {
  return score >= 75 ? "text-emerald-300" : score >= 45 ? "text-amber-300" : "text-rose-300";
}
function StatusIcon({ s }: { s: Check["status"] }) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-rose-400" />;
}

export default function TestingArenaClient() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/testing-arena/run", { method: "POST" });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "تعذّر تشغيل الفحص");
      else setRes(j);
    } catch {
      setErr("خطأ في الشبكة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="text-sm text-slate-400">
          يشغّل الفحص ٥ سيناريوهات حقيقية عبر نظام الردود التلقائية، ويراجع جاهزية الإعداد.
        </div>
        <button onClick={run} disabled={busy} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {busy ? "جارٍ الفحص…" : "تشغيل الفحص"}
        </button>
      </div>

      {err && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{err}</div>}

      {res && (
        <>
          {/* Scores */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="kpi-card text-center">
              <div className="kpi-label mb-1">الدرجة الكلية</div>
              <div className={`text-4xl font-extrabold ${tone(res.overall)}`}>{res.overall}<span className="text-lg text-slate-500">/100</span></div>
            </div>
            <div className="kpi-card text-center">
              <div className="kpi-label mb-1">جاهزية الإعداد</div>
              <div className={`text-4xl font-extrabold ${tone(res.auditScore)}`}>{res.auditScore}</div>
            </div>
            <div className="kpi-card text-center">
              <div className="kpi-label mb-1">جودة الردود</div>
              <div className={`text-4xl font-extrabold ${tone(res.scenarioScore)}`}>{res.scenarioScore}</div>
            </div>
          </div>

          {/* Readiness audit */}
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-bold">مراجعة الجاهزية</h2>
            <div className="space-y-2">
              {res.checks.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <StatusIcon s={c.status} />
                    <div>
                      <div className="text-sm font-medium text-white">{c.label} <span className="text-xs text-slate-500">· {c.detail}</span></div>
                      {c.recommendation && <div className="mt-0.5 text-xs text-slate-400">{c.recommendation}</div>}
                    </div>
                  </div>
                  {c.status !== "ok" && c.fixHref && (
                    <a href={c.fixHref} className="shrink-0 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs text-brand-200 hover:bg-brand-500/20">إصلاح</a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scenario results */}
          <div className="card p-5">
            <h2 className="mb-3 text-lg font-bold">نتائج السيناريوهات</h2>
            <div className="space-y-3">
              {res.scenarios.map((s) => (
                <div key={s.key} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{s.label}</span>
                    <span className={`text-sm font-bold ${tone(s.score)}`}>{s.score}/100</span>
                  </div>
                  <div className="mb-2 rounded-lg bg-white/[0.03] p-2.5 text-xs text-slate-400">
                    <span className="text-slate-500">رسالة العميل:</span> {s.message}
                  </div>
                  <div className="mb-2 flex items-start gap-2 rounded-lg bg-white/[0.03] p-2.5 text-xs text-slate-200">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300" />
                    <span><span className="text-slate-500">الرد التلقائي:</span> {s.reply}</span>
                  </div>
                  {s.weaknesses.length > 0 && (
                    <ul className="space-y-1">
                      {s.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-200/90"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {res.recommendations.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Lightbulb className="h-4 w-4 text-amber-300" /> التوصيات</h2>
              <ul className="space-y-2">
                {res.recommendations.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.priority === "high" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-200"}`}>{r.priority === "high" ? "هام" : "متوسط"}</span>
                      {r.text}
                    </span>
                    {r.fixHref && <a href={r.fixHref} className="shrink-0 text-xs text-brand-300 hover:underline">إصلاح</a>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
