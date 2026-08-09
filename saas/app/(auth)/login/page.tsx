"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd)),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error || "خطأ في تسجيل الدخول"); return; }
    r.push(data.redirectTo || "/dashboard");
    r.refresh();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">تسجيل الدخول</h1>
        <p className="mt-1.5 text-sm text-slate-400">أهلاً برجوعك — ادخل إلى لوحة تشغيل KEYONE.</p>
      </div>

      {/* Glass card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-7 sm:p-8"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)" }}>
        {/* Top edge highlight */}
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

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">كلمة المرور</label>
              <Link href="/forgot-password" className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors">
                نسيت كلمة المرور؟
              </Link>
            </div>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
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
                جاري الدخول...
              </span>
            ) : "دخول"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="font-medium text-brand-400 hover:text-brand-300 transition-colors">
            إنشاء حساب جديد
          </Link>
        </p>
      </div>
    </div>
  );
}
