"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Loader2 } from "lucide-react";

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
    <div className="surface p-7 sm:p-8">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gold-500/20 bg-gradient-to-b from-white/[0.06] to-white/[0.01] text-brand-300 shadow-card">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-white">تسجيل الدخول</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          أهلاً برجوعك، ادخل إلى لوحة تشغيل KEYONE.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-300">البريد الإلكتروني</label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            dir="ltr"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-300">كلمة المرور</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {err && (
          <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
            {err}
          </div>
        )}
        <button disabled={loading} className="btn-primary w-full py-3">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ الدخول…
            </>
          ) : (
            "دخول"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        ليس لديك حساب؟{" "}
        <Link href="/signup" className="font-medium text-brand-400 hover:text-brand-300">
          إنشاء حساب جديد
        </Link>
      </p>
    </div>
  );
}
