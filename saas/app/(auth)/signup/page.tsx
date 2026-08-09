"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd)),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error || "تعذّر إنشاء الحساب"); return; }
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
  }

  if (pending) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-8 text-center"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">تم استلام طلبك</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{pending}</p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">إنشاء حساب جديد</h1>
        <p className="mt-1.5 text-sm text-slate-400">ابدأ مع KEYONE — مساعد المبيعات الذكي على واتساب.</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] p-7 sm:p-8"
        style={{ background: "linear-gradient(160deg,rgba(255,255,255,0.042) 0%,rgba(255,255,255,0.014) 100%)" }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">الاسم</label>
            <input name="name" type="text" required autoComplete="name" className="input" />
          </div>

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
            <label className="mb-1.5 block text-sm font-medium text-slate-300">كلمة المرور</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">8 أحرف على الأقل.</p>
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
                جاري الإنشاء...
              </span>
            ) : "إنشاء الحساب"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300 transition-colors">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
