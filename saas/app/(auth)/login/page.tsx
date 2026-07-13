"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";

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
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 sm:p-8">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-brand-400">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-white">تسجيل الدخول</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          أهلاً برجوعك — ادخل إلى لوحة تشغيل KEYONE.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">البريد الإلكتروني</label>
          <input
            name="email"
            type="email"
            required
            className="input"
            dir="ltr"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-300">كلمة المرور</label>
            <Link href="/forgot-password" className="text-xs font-medium text-brand-400 hover:text-brand-300">
              نسيت كلمة المرور؟
            </Link>
          </div>
          <input name="password" type="password" required className="input" />
        </div>
        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {err}
          </div>
        )}
        <button
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
        >
          {loading ? "..." : "دخول"}
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
