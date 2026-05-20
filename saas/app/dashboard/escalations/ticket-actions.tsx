"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function EscalationActions({ ticketId, status }: { ticketId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: "acknowledge" | "resolve", resumeAi = true) {
    setBusy(action);
    try {
      const res = await fetch(`/api/escalations/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, resumeAi }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "فشل تحديث التصعيد");
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap gap-2 text-xs">
      {status === "open" && (
        <button disabled={pending || busy !== null} onClick={() => act("acknowledge", false)} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-200 disabled:opacity-50">
          {busy === "acknowledge" ? "..." : "استلام"}
        </button>
      )}
      <button disabled={pending || busy !== null} onClick={() => act("resolve", true)} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200 disabled:opacity-50">
        {busy === "resolve" ? "..." : "حل وإرجاع AI"}
      </button>
      <button disabled={pending || busy !== null} onClick={() => act("resolve", false)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-200 disabled:opacity-50">
        إبقاء بشري
      </button>
    </div>
  );
}
