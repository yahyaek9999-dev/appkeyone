"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

export default function SignupPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fd)),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setErr(data.error || "تعذّر إنشاء الحساب");
        return;
      }
      if (data.status === "approved") {
        let dest = data.redirectTo || "/onboarding";
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          const plan = sp.get("plan");
          if (plan) {
            const cycle = sp.get("cycle") === "yearly" ? "yearly" : "monthly";
            dest = `/dashboard/billing?plan=${encodeURIComponent(plan)}&cycle=${cycle}`;
          }
        }
        r.push(dest);
        r.refresh();
      } else {
        setPending(data.message || "تم استلام طلبك! سيتم تفعيل الحساب قريباً.");
      }
    } catch {
      setLoading(false);
      setErr("تعذّر الاتصال بالخادم. تحقّق من اتصالك وحاول مرة أخرى.");
    }
  }

  if (pending) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-8 text-center"
        style={{
          background:
            "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="display-heading text-xl sm:text-2xl">تم استلام طلبك</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{pending}</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded text-sm font-medium text-brand-400 transition-colors hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-heading text-[1.75rem] sm:text-3xl">إنشاء حساب جديد</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          ابدأ مع KEYONE — مساعد المبيعات الذكي على واتساب.
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-7 sm:p-8"
        style={{
          background:
            "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="signup-name"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              الاسم
            </label>
            <input
              id="signup-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              className="input"
            />
          </div>

          <div>
            <label
              htmlFor="signup-email"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              البريد الإلكتروني
            </label>
            <input
              id="signup-email"
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
            <label
              htmlFor="signup-password"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="signup-password"
                name="password"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby="signup-password-hint"
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
            <p id="signup-password-hint" className="mt-1.5 text-[11px] text-slate-500">
              8 أحرف على الأقل.
            </p>
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
                جاري الإنشاء...
              </span>
            ) : (
              "إنشاء الحساب"
            )}
          </button>

          {/* Reassurance at the point of commitment — factual only */}
          <p className="text-center text-[11.5px] leading-relaxed text-slate-500">
            إنشاء الحساب مجاني — تختار باقتك بعد الدخول.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          لديك حساب بالفعل؟{" "}
          <Link
            href="/login"
            className="rounded font-medium text-brand-400 transition-colors hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
