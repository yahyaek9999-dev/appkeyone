"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, CheckCircle2, Loader2 } from "lucide-react";

export default function SignupPage() {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function onSubmit(e: any) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const fd = new FormData(e.target);
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
      r.push(data.redirectTo || "/onboarding");
      r.refresh();
    } else {
      setPending(data.message || "تم استلام طلبك! سيتم تفعيل الحساب قريباً.");
    }
  }

  if (pending) {
    return (
      <div className="surface p-7 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-white">تم استلام طلبك</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{pending}</p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-medium text-brand-400 hover:text-brand-300">
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="surface p-7 sm:p-8">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gold-500/20 bg-gradient-to-b from-white/[0.06] to-white/[0.01] text-brand-300 shadow-card">
          <UserPlus className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-white">إنشاء حساب جديد</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          ابدأ مع KEYONE، مساعد المبيعات الذكي على واتساب.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-slate-300">الاسم</label>
          <input id="signup-name" name="name" type="text" autoComplete="name" required className="input" />
        </div>
        <div>
          <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-300">البريد الإلكتروني</label>
          <input id="signup-email" name="email" type="email" autoComplete="email" required className="input" dir="ltr" />
        </div>
        <div>
          <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-300">كلمة المرور</label>
          <input id="signup-password" name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
          <p className="mt-1 text-[11px] text-slate-500">8 أحرف على الأقل.</p>
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
              جارٍ إنشاء الحساب…
            </>
          ) : (
            "إنشاء الحساب"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        لديك حساب بالفعل؟{" "}
        <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
