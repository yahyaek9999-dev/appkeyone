"use client";

// Device-link approval form (RFC 8628 user-approval step).
//
// The logged-in workspace owner types the short user_code their Bridge printed
// after `keyone-bridge login`, then Approve → POST /api/bridge/v1/device/approve.
// On success the Bridge's next poll binds it to this workspace. No secrets are
// entered here beyond the short one-time user code.

import { useState, useTransition } from "react";

export function LinkForm({ presetCode }: { presetCode?: string }) {
  const [pending, start] = useTransition();
  const [code, setCode] = useState(presetCode || "");
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);

  function approve() {
    const user_code = code.trim().toUpperCase();
    if (user_code.length < 4) {
      setRes({ ok: false, text: "أدخل رمزاً صحيحاً." });
      return;
    }
    setRes(null);
    start(async () => {
      try {
        const r = await fetch("/api/bridge/v1/device/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_code }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok) {
          setRes({ ok: true, text: "✓ تم اعتماد الرمز. سيكتمل ربط الجهاز خلال لحظات — ارجع للوحة الـ Bridge." });
        } else {
          const map: Record<string, string> = {
            invalid_or_expired_code: "الرمز غير صحيح أو منتهي الصلاحية. أنشئ رمزاً جديداً من الجهاز وحاول مجدداً.",
            already_claimed: "هذا الرمز مرتبط بمساحة عمل أخرى بالفعل.",
            bad_body: "صيغة الرمز غير صحيحة.",
          };
          setRes({ ok: false, text: map[j?.error] || j?.message || `فشل الاعتماد (${r.status})` });
        }
      } catch {
        setRes({ ok: false, text: "تعذّر الاتصال بالخادم — حاول مجدداً." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-slate-400 block mb-1">رمز الجهاز (User Code)</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="مثال: WXYZ-1234"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-lg tracking-widest uppercase focus:border-sky-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-slate-500">
          هذا هو الرمز الذي عرضه الجهاز بعد تشغيل <span className="font-mono text-slate-300">keyone-bridge login</span>.
        </p>
      </div>

      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className="rounded-lg bg-sky-500 px-5 py-2 font-bold text-white hover:bg-sky-400 disabled:opacity-50"
      >
        {pending ? "جاري الاعتماد..." : "اعتماد وربط الجهاز"}
      </button>

      {res && (
        <div
          className={`card p-3 text-sm ${
            res.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {res.text}
        </div>
      )}
    </div>
  );
}
