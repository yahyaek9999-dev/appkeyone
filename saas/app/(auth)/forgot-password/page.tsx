"use client";
import { useState } from "react";
import Link from "next/link";
import { KeyRound, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function onSubmit(e: any) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.target);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd)),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErr(data.error || "خطأ");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">تحقق من بريدك</h1>
        <p className="mt-3 text-sm text-slate-400">
          إذا كان البريد الإلكتروني مسجلاً لدينا، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.
        </p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-medium text-brand-400 hover:text-brand-300">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 sm:p-8">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-brand-400">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-white">نسيت كلمة المرور؟</h1>
        <p className="mt-1.5 text-sm text-slate-400">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">البريد الإلكتروني</label>
          <input name="email" type="email" required className="input" dir="ltr" />
        </div>
        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>
        )}
        <button
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
        >
          {loading ? "..." : "إرسال رابط إعادة التعيين"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        تذكرت كلمة المرور؟{" "}
        <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
