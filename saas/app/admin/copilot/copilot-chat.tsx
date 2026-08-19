"use client";

import { useState } from "react";
import { Send, Loader2, Sparkles, Database, ShieldAlert } from "lucide-react";

type Turn = { q: string; a: string; usedLlm: boolean; sources: string[] };

const SUGGESTIONS = [
  "لماذا تغيّر الإيراد هذا الأسبوع؟",
  "من هم التجّار الأعلى خطراً؟",
  "هل توجد مشاكل دفع اليوم؟",
  "أي بوابة دفع تفشل؟",
  "ما الحوادث غير المحلولة؟",
  "أي عملاء يحتاجون متابعة؟",
];

export default function CopilotChat() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [err, setErr] = useState("");

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const j = await r.json();
      if (j.ok) {
        setTurns((prev) => [{ q: text, a: j.answer, usedLlm: j.usedLlm, sources: j.sources || [] }, ...prev]);
        setQ("");
      } else {
        setErr(j.error === "question_too_short" ? "السؤال قصير جداً." : "تعذّر الحصول على إجابة.");
      }
    } catch {
      setErr("فشل الاتصال.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
            placeholder="اسأل عن الإيرادات، المخاطر، المدفوعات، الحوادث…"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
            disabled={busy}
          />
          <button
            onClick={() => ask(q)}
            disabled={busy || q.trim().length < 3}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500/20 border border-brand-500/30 px-3 py-1.5 text-xs font-semibold text-brand-200 hover:bg-brand-500/30 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            اسأل
          </button>
        </div>
        {err && <div className="mt-2 text-[12px] text-rose-300">{err}</div>}
      </div>

      {/* Suggestions */}
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[12px] text-slate-300 hover:border-white/[0.16] hover:text-white disabled:opacity-40">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Safety note */}
      <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-slate-500">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        المساعد للقراءة والتحليل فقط — لا ينفّذ استرداداً أو تعديل رصيد أو تغيير باقة أو أي إجراء حسّاس. أي إجراء يتطلّب
        تأكيدك ثم يُنفَّذ عبر الصفحة المختصة مع تسجيله في التدقيق.
      </div>

      {/* Turns */}
      <div className="space-y-3">
        {turns.map((t, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-2 text-sm font-semibold text-white">{t.q}</div>
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">{t.a}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2 text-[11px] text-slate-500">
              <Database className="h-3 w-3" />
              <span>المصادر:</span>
              {t.sources.map((s) => <span key={s} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-slate-400">{s}</span>)}
              {!t.usedLlm && <span className="ms-auto text-amber-400/80">مُلخّص حتمي (الذكاء غير متاح)</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
