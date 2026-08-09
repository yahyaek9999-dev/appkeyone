"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd)),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error || "خطأ"); return; }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-8 text-center"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">تحقق من بريدك</h1>
        <p className="mt-3 text-sm text-slate-400">
          إذا كان البريد الإلكتروني مسجلاً لدينا، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.
        </p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">نسيت كلمة المرور؟</h1>
        <p className="mt-1.5 text-sm text-slate-400">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-7 sm:p-8"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">البريد الإلكتروني</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="input"
              dir="ltr"
            />
          </div>

          {err && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-[14px] disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
                جاري الإرسال...
              </span>
            ) : "إرسال رابط إعادة التعيين"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          تذكرت كلمة المرور؟{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300 transition-colors">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
