"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { UserCheck, CheckCircle2 } from "lucide-react";

function AcceptInner() {
  const r = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: any) {
    e.preventDefault();
    setErr("");
    if (!token) { setErr("رابط الدعوة ناقص"); return; }
    setLoading(true);
    const fd = new FormData(e.target);
    const res = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...Object.fromEntries(fd) }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErr(data.error || "تعذّر قبول الدعوة");
      return;
    }
    setDone(true);
    setTimeout(() => { r.push("/login"); r.refresh(); }, 1800);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">تم تفعيل حسابك</h1>
        <p className="mt-3 text-sm text-slate-400">يمكنك الآن تسجيل الدخول بكلمة المرور التي اخترتها.</p>
        <Link href="/login" className="mt-6 inline-flex text-sm font-medium text-brand-400 hover:text-brand-300">
          الذهاب لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7 sm:p-8">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-brand-400">
          <UserCheck className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-white">قبول الدعوة</h1>
        <p className="mt-1.5 text-sm text-slate-400">اختر اسمك وكلمة مرور لتفعيل عضويتك في الفريق.</p>
      </div>

      {!token && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          رابط الدعوة غير مكتمل. تأكد من فتح الرابط كاملاً.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">الاسم (اختياري)</label>
          <input name="name" type="text" className="input" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">كلمة المرور</label>
          <input name="password" type="password" required minLength={8} className="input" />
          <p className="mt-1 text-[11px] text-slate-500">8 أحرف على الأقل.</p>
        </div>
        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>
        )}
        <button
          disabled={loading || !token}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:opacity-50"
        >
          {loading ? "..." : "تفعيل الحساب"}
        </button>
      </form>
    </div>
  );
}

export default function TeamAcceptPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-slate-400">...</div>}>
      <AcceptInner />
    </Suspense>
  );
}
