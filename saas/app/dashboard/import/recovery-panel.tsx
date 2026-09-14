"use client";

/**
 * The Bridge tenant's Recovery panel.
 *
 * A Bridge tenant used to reach this page and be told the recovery needs a
 * connected QR session — while the normal QR flow is deliberately hidden from
 * them. That was a dead end with no exit. This panel is the exit: a WhatsApp
 * session created for the length of the recovery and destroyed afterwards,
 * with Bridge staying the account's channel throughout.
 *
 * Nothing starts on render. WhatsApp's linked-device capacity cannot be read
 * programmatically, so the customer is told plainly that a slot may be needed
 * and has to press the button themselves.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScanLine, Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, DatabaseZap, Clock,
} from "lucide-react";

type State =
  | "idle" | "preparing" | "qr_ready" | "scanning" | "connected"
  | "importing" | "completed" | "failed" | "expired" | "cancelled";

type View = { state: State; qr: string | null; error: string | null; expiresAt: string | null };

const ERROR_AR: Record<string, string> = {
  recovery_service_unavailable: "خدمة الربط غير متاحة حاليًا. حاول لاحقًا، ولو استمرت المشكلة كلّم الدعم.",
  recovery_expired: "انتهت مهلة مسح الكود قبل ما يتم الربط.",
  recovery_cancelled: "تم إلغاء الاسترداد.",
  export_unavailable: "تعذّر سحب البيانات من واتساب بعد الربط.",
  not_a_bridge_tenant: "هذه الشاشة مخصصة لحسابات KEYONE Bridge فقط.",
};

/** How the QR-scanning window is displayed while it is counting down. */
function remaining(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RecoveryPanel({ onFinished }: { onFinished?: () => void }) {
  const [view, setView] = useState<View>({ state: "idle", qr: null, error: null, expiresAt: null });
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const finishedRef = useRef(false);

  const poll = useCallback(async () => {
    const r = await fetch("/api/import/recovery", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const j = await r.json().catch(() => null);
    if (!j?.ok) return;
    setView({ state: j.state, qr: j.qr ?? null, error: j.error ?? null, expiresAt: j.expiresAt ?? null });
    if (j.state === "completed" && !finishedRef.current) {
      finishedRef.current = true;
      onFinished?.();
    }
  }, [onFinished]);

  // Poll only while something is actually in flight — never on a resting page.
  const live = ["preparing", "qr_ready", "scanning", "connected", "importing"].includes(view.state);
  useEffect(() => {
    void poll();
  }, [poll]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      void poll();
      setTick((n) => n + 1);
    }, 3000);
    return () => clearInterval(t);
  }, [live, poll]);

  async function act(action: "start" | "cancel") {
    setBusy(true);
    try {
      const r = await fetch("/api/import/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => null);
      if (j?.ok) setView({ state: j.state, qr: j.qr ?? null, error: j.error ?? null, expiresAt: j.expiresAt ?? null });
    } finally {
      setBusy(false);
      void poll();
    }
  }

  const left = remaining(view.expiresAt);
  const errText = view.error ? ERROR_AR[view.error] || null : null;

  return (
    <div className="card p-6 border border-emerald-500/20 space-y-4">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2 mb-1">
          <ScanLine className="h-5 w-5 text-emerald-300" /> استرداد العملاء
        </h2>
        <p className="text-sm text-slate-300">
          لإتمام الاسترداد سننشئ جلسة QR مؤقتة مخصصة للاسترداد فقط. لن يتم تغيير قناة واتساب الأساسية.
        </p>
      </div>

      {/* The device-slot caveat. WhatsApp does not expose the limit, so this is
          stated honestly as something to check rather than something we tested. */}
      {["idle", "failed", "expired", "cancelled"].includes(view.state) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            سيتم إنشاء جلسة واتساب مؤقتة مخصصة للاسترداد فقط. لن يتم تغيير قناة Bridge الأساسية.
            تأكد من وجود مكان متاح ضمن الأجهزة المرتبطة في واتساب، لأن واتساب قد يطلب إزالة جهاز
            مرتبط عند الوصول للحد.
          </p>
        </div>
      )}

      {errText && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{errText}</span>
        </div>
      )}

      {/* ── idle / terminal-but-retryable ── */}
      {["idle", "failed", "expired", "cancelled"].includes(view.state) && (
        <button onClick={() => act("start")} disabled={busy} className="btn-primary justify-center disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          بدء جلسة الاسترداد
        </button>
      )}

      {/* ── preparing ── */}
      {view.state === "preparing" && (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري تجهيز الجلسة المؤقتة…
        </div>
      )}

      {/* ── QR ready: rendered ONLY here, only while the session is waiting ── */}
      {view.state === "qr_ready" && view.qr && (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.qr} alt="رمز الاسترداد" width={200} height={200} className="rounded-xl bg-white p-2 shrink-0" />
          <div className="text-xs text-slate-300 space-y-1">
            <p className="text-sm text-slate-200">افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز</p>
            {left && (
              <p className="flex items-center gap-1 text-slate-400">
                <Clock className="h-3.5 w-3.5" /> صالح لمدة {left}
              </p>
            )}
            <button onClick={() => act("cancel")} disabled={busy} className="btn-ghost mt-2 disabled:opacity-50">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ── scanned / importing ── */}
      {["scanning", "connected", "importing"].includes(view.state) && (
        <div className="flex items-center gap-2 text-sm text-emerald-200">
          {view.state === "importing" ? <DatabaseZap className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          {view.state === "importing" ? "جاري استيراد بياناتك…" : "تم الربط، جاري بدء الاستيراد…"}
        </div>
      )}

      {/* ── completed: say plainly that the temporary session is gone ── */}
      {view.state === "completed" && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            اكتمل الاسترداد. تم إغلاق جلسة الاسترداد المؤقتة وحذفها، وقناة KEYONE Bridge ما زالت
            قناتك الأساسية كما هي.
          </p>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5" />
        الجلسة المؤقتة لا تستقبل رسائل ولا ترد على عملائك، وتنتهي تلقائيًا.
      </p>
      <span className="hidden">{tick}</span>
    </div>
  );
}
