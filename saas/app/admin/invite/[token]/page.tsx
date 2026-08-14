"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ShieldCheck, Eye, EyeOff, CheckCircle } from "lucide-react";

export default function StaffInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل."); return; }
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff-auth?action=setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: params.token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "token_expired") setError("رابط الدعوة منتهي الصلاحية. اطلب دعوة جديدة.");
        else if (data.error === "invalid_token") setError("رابط الدعوة غير صالح.");
        else if (data.error === "suspended") setError("الحساب موقوف.");
        else setError("حدث خطأ. حاول مجدداً.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/admin"), 2000);
    } catch {
      setError("حدث خطأ في الاتصال. حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">قبول دعوة الانضمام</h1>
            <p className="mt-1 text-sm text-slate-500">حدد كلمة مرور لحساب طاقم KEYONE</p>
          </div>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
            <p className="text-base font-medium text-white">تم تفعيل حسابك بنجاح!</p>
            <p className="text-sm text-slate-400">جارٍ التحويل إلى لوحة الإدارة...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-200">كلمة المرور الجديدة</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full pr-10"
                  placeholder="8 أحرف على الأقل"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-200"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-200">تأكيد كلمة المرور</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input w-full"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? "جارٍ الحفظ..." : "تفعيل الحساب"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
