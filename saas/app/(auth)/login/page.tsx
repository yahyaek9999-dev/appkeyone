"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fd)),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setErr(data.error || "خطأ في تسجيل الدخول");
        return;
      }
      r.push(data.redirectTo || "/dashboard");
      r.refresh();
    } catch {
      setLoading(false);
      setErr("تعذّر الاتصال بالخادم. تحقّق من اتصالك وحاول مرة أخرى.");
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-heading text-[1.75rem] sm:text-3xl">تسجيل الدخول</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          أهلاً برجوعك — ادخل إلى لوحة تشغيل KEYONE.
        </p>
      </div>

      {/* Glass card */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-7 sm:p-8"
        style={{
          background:
            "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)",
        }}
      >
        {/* Top edge highlight */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              البريد الإلكتروني
            </label>
            <input
              id="login-email"
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
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label
                htmlFor="login-password"
                className="text-sm font-medium text-slate-300"
              >
                كلمة المرور
              </label>
              <Link
                href="/forgot-password"
                className="rounded text-xs font-medium text-brand-400 transition-colors hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={showPw ? "text" : "password"}
                required
                autoComplete="current-password"
                className="input pe-11"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                aria-pressed={showPw}
                className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                {showPw ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {err && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="btn-primary w-full py-3 text-[14px] disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
                جاري الدخول...
              </span>
            ) : (
              "دخول"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          ليس لديك حساب؟{" "}
          <Link
            href="/signup"
            className="rounded font-medium text-brand-400 transition-colors hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            إنشاء حساب جديد
          </Link>
        </p>
      </div>
    </div>
  );
}
