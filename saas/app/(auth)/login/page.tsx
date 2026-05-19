"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";

export default function LoginPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: any) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.target);
    const res = await fetch("/api/auth/login", {
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
    r.push(data.redirectTo || "/dashboard");
    r.refresh();
  }

  return (
    <div className="card p-7 sm:p-8">
      <div className="mb-7 text-center">
        <div className="ai-badge mb-5">
          <Sparkles className="h-3.5 w-3.5" /> دخول آمن للمنصة
        </div>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 text-brand-300 shadow-[0_0_28px_rgba(34,197,94,0.18)]">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="ai-heading text-3xl">تسجيل الدخول</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          أهلاً برجوعك — ادخل إلى لوحة تشغيل KEYONE الذكية.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">البريد الإلكتروني</label>
          <input
            name="email"
            type="email"
            required
            className="input"
            dir="ltr"
          />
        </div>
        <div>
          <label className="label">كلمة المرور</label>
          <input name="password" type="password" required className="input" />
        </div>
        {err && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={loading}
          className="btn-primary w-full py-3.5 text-base"
        >
          {loading ? "..." : "دخول"}
        </button>
      </form>

      <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center text-xs leading-relaxed text-slate-400">
        الاشتراك يتم بتفعيل الإدارة فقط.
        <br />
        تواصل عبر واتساب لطلب حساب جديد.
      </p>
    </div>
  );
}
