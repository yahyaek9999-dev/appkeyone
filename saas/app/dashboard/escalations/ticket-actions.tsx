"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function EscalationActions({ ticketId, status }: { ticketId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
          حل وإعادة البوت
        </button>
        <button disabled={pending || busy !== null} onClick={() => act("resolve", false)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-200 disabled:opacity-50">
          إغلاق دون إعادة البوت
        </button>
      </div>
      {err && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1">
          {err}
        </div>
      )}
    </div>
  );
}
