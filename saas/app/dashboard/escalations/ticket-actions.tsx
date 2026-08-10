"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2, Copy, Check } from "lucide-react";

export default function EscalationActions({
  ticketId,
  status,
  initialDraft,
}: {
  ticketId: string;
  status: string;
  initialDraft?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(initialDraft || null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateDraft() {
    setDraftBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/escalations/${ticketId}/draft-reply`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error === "no_provider_configured" ? "لم يتم إعداد مزوّد الخدمة لهذا الحساب بعد." : "تعذّر توليد رد مقترح.");
        return;
      }
      setDraft(json.draft);
    } finally {
      setDraftBusy(false);
    }
  }

  function copyDraft() {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function act(action: "acknowledge" | "resolve", resumeAi = true) {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/escalations/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, resumeAi }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(json.error || "تعذّر تحديث التصعيد، يرجى المحاولة مرة أخرى.");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 text-xs">
      <div className="flex flex-wrap gap-2">
        {status === "open" && (
          <button disabled={pending || busy !== null} onClick={() => act("acknowledge", false)} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-200 disabled:opacity-50 inline-flex items-center gap-1">
            {busy === "acknowledge" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            استلام
          </button>
        )}
        <button disabled={pending || busy !== null} onClick={() => act("resolve", true)} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200 disabled:opacity-50 inline-flex items-center gap-1">
          {busy === "resolve" ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          حل واستئناف التلقائي
        </button>
        <button disabled={pending || busy !== null} onClick={() => act("resolve", false)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-200 disabled:opacity-50">
          إغلاق بدون استئناف تلقائي
        </button>
        <button
          disabled={draftBusy}
          onClick={generateDraft}
          className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-violet-200 disabled:opacity-50 inline-flex items-center gap-1"
        >
          {draftBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          توليد رد مقترح
        </button>
      </div>
      {err && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1">
          {err}
        </div>
      )}
      {draft && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3 space-y-2">
          <div className="text-[11px] font-medium text-violet-300">رد مقترح — راجعه وأرسله يدوياً</div>
          <div className="text-slate-200 whitespace-pre-wrap">{draft}</div>
          <button onClick={copyDraft} className="text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "تم النسخ" : "نسخ"}
          </button>
        </div>
      )}
    </div>
  );
}
