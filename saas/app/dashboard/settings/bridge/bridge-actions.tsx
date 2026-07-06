"use client";

// Client action controls for a single Bridge row.
//
// Phase 1 wires the two Cloud-side, WS-free actions that are already live:
//   - Set Primary  → POST /api/bridge/v1/primary  { bridge_id }
//   - Disconnect   → POST /api/bridge/v1/revoke   { bridge_id }  (unlink + kill tokens)
//
// Reconnect / Logout / Update need the WS gateway that ships in Phase 2, so they
// are rendered but visibly disabled with a "قريباً (المرحلة 2)" label — never
// silently no-oping. Nothing here ever touches WhatsApp auth.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function BridgeActions({ bridgeId, isPrimary }: { bridgeId: string; isPrimary: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<null | "primary" | "revoke">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function call(kind: "primary" | "revoke", url: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg(null);
    setBusy(kind);
    start(async () => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bridge_id: bridgeId }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          setMsg({ kind: "ok", text: "تم ✓" });
          router.refresh();
        } else {
          setMsg({ kind: "err", text: j?.message || j?.error || `فشل (${r.status})` });
        }
      } catch {
        setMsg({ kind: "err", text: "تعذّر الاتصال بالخادم." });
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || isPrimary}
          onClick={() => call("primary", "/api/bridge/v1/primary")}
          title={isPrimary ? "هذا الجهاز أساسي بالفعل" : "اجعل هذا الجهاز الأساسي لمساحة العمل"}
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy === "primary" ? "..." : "تعيين كأساسي"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            call(
              "revoke",
              "/api/bridge/v1/revoke",
              "سيتم فصل هذا الجهاز وإبطال رموزه. لن يتمكّن من الاتصال مجدداً إلا بربط جديد. متابعة؟",
            )
          }
          title="فصل الجهاز وإبطال رموزه"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
        >
          {busy === "revoke" ? "..." : "فصل الجهاز"}
        </button>

        {/* Phase-2 (WS gateway) actions — present but clearly disabled. */}
        <Soon label="إعادة الاتصال" />
        <Soon label="تسجيل الخروج" />
        <Soon label="تحديث" />
      </div>
      {msg && (
        <p className={msg.kind === "ok" ? "text-emerald-300 text-xs" : "text-rose-300 text-xs"}>{msg.text}</p>
      )}
    </div>
  );
}

function Soon({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title="يتطلب بوابة الاتصال المباشر — تصل في المرحلة 2"
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-500 cursor-not-allowed"
    >
      {label} <span className="text-[10px] font-normal text-slate-600">قريباً (م2)</span>
    </button>
  );
}
