"use client";
import { useState } from "react";
import Link from "next/link";

function fmt(d?: string | null) { if (!d) return ""; try { return new Date(d).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } }

export default function AiOperationsClient({ current, providers, providerStats, recentFailures, totals }: {
  current: { provider: string; label: string; model: string; hasKey: boolean };
  providers: { id: string; label: string }[];
  providerStats: any[]; recentFailures: any[]; totals: { calls: number; failures: number; failovers: number };
}) {
  const [provider, setProvider] = useState(current.provider);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function switchProvider() {
    setBusy("switch"); setMsg(null);
    try {
      const res = await fetch("/api/settings/ai-provider", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setMsg({ ok: true, text: `تم التبديل إلى ${provider}.` + (provider !== "keyone" && !current.hasKey ? " ⚠️ لم يُحفظ مفتاح بعد — أضِفه من الإعدادات." : "") });
      else setMsg({ ok: false, text: j?.error || "تعذّر التبديل." });
    } finally { setBusy(""); }
  }
  async function probe() {
    setBusy("probe"); setMsg(null);
    try {
      const res = await fetch("/api/settings/ai-provider/probe", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) setMsg({ ok: true, text: `✓ المزوّد ${j.provider} يعمل — ${j.latencyMs}ms — «${j.sample || ""}»` });
      else setMsg({ ok: false, text: `✗ فشل (${j?.provider}): ${j?.error || "غير معروف"} (${j?.latencyMs || 0}ms)` });
    } finally { setBusy(""); }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">إجمالي الاستدعاءات</div><div className="text-2xl font-extrabold">{totals.calls}</div></div>
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">الأعطال</div><div className={`text-2xl font-extrabold ${totals.failures > 0 ? "text-rose-300" : "text-emerald-300"}`}>{totals.failures}</div></div>
        <div className="card p-4"><div className="text-slate-400 text-xs mb-1">تجاوز المزوّد (failover)</div><div className="text-2xl font-extrabold">{totals.failovers}</div></div>
      </div>

      <div className="card p-4 space-y-2">
        <div className="text-sm">المزوّد الحالي: <b>{current.label}</b>{current.model ? ` · ${current.model}` : ""} {current.provider !== "keyone" && !current.hasKey && <span className="text-amber-300 text-xs">(بدون مفتاح)</span>}</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="bg-white/5 rounded px-2 py-1.5 text-sm">
            {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button onClick={switchProvider} disabled={busy === "switch" || provider === current.provider} className="rounded bg-brand-500/15 text-brand-300 px-3 py-1.5 text-sm disabled:opacity-50">تبديل المزوّد</button>
          <button onClick={probe} disabled={!!busy} className="rounded bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50">{busy === "probe" ? "جاري الاختبار..." : "اختبار المزوّد الآن"}</button>
          <Link href="/dashboard/settings/ai-provider" className="rounded bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">المفاتيح والاحتياطي (failover)</Link>
        </div>
        {msg && <p className={msg.ok ? "text-emerald-300 text-sm" : "text-rose-300 text-sm"}>{msg.text}</p>}
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-2 text-sm">الأداء حسب المزوّد (آخر 500 استدعاء)</h2>
        {providerStats.length === 0 ? <p className="text-slate-500 text-sm">لا توجد بيانات استخدام بعد.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-400"><th className="p-1.5 text-right">المزوّد</th><th className="p-1.5">الاستدعاءات</th><th className="p-1.5">نجاح %</th><th className="p-1.5">متوسط الكمون</th><th className="p-1.5">failover</th></tr></thead>
            <tbody>
              {providerStats.map((s) => (
                <tr key={s.provider} className="border-t border-white/5">
                  <td className="p-1.5">{s.label}</td>
                  <td className="p-1.5 text-center">{s.calls}</td>
                  <td className={`p-1.5 text-center ${s.okRate < 90 ? "text-rose-300" : "text-emerald-300"}`}>{s.okRate}%</td>
                  <td className="p-1.5 text-center">{s.avgLatency}ms</td>
                  <td className="p-1.5 text-center">{s.failover}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {recentFailures.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold mb-2 text-sm">آخر الأعطال</h2>
          <ul className="space-y-1 text-xs">
            {recentFailures.map((f, n) => (
              <li key={n} className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-rose-400" /><span className="font-mono text-slate-500">{f.provider}</span><span className="text-slate-300">{f.error || "خطأ"}</span><span className="text-slate-600">{fmt(f.createdAt)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
