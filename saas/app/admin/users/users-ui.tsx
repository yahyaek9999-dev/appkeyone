"use client";

import { useState, useMemo } from "react";
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Ban,
  Plus,
  ExternalLink,
  UserPlus,
  Copy,
  Check,
  KeyRound,
  Trash2,
} from "lucide-react";

type Sub = {
  status: string;
  planSlug: string;
  planName: string;
  expiresAt: string;
  msgsUsed: number;
  monthlyMsgs: number;
  billingCycle: string;
  paymentRef: string | null;
};
type User = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  createdAt: string;
  approvalStatus: string;
  suspended: boolean;
  suspendedReason: string | null;
  subscription: Sub | null;
};
type Plan = {
  slug: string;
  name: string;
  priceUsd: number;
  yearlyUsd: number | null;
  monthlyMsgs: number;
};

function statusBadge(s: string | undefined) {
  if (s === "active")
    return {
      label: "نشط",
      className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      Icon: CheckCircle2,
    };
  if (s === "pending")
    return {
      label: "بانتظار",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      Icon: Clock,
    };
  if (s === "expired")
    return {
      label: "منتهي",
      className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
      Icon: AlertTriangle,
    };
  if (s === "canceled")
    return {
      label: "ملغي",
      className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
      Icon: Ban,
    };
  return {
    label: "بدون اشتراك",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    Icon: XCircle,
  };
}

function ApproveButtons({ userId }: { userId: string }) {
  const [loading, setLoading] = useState<"" | "approve" | "reject">("");

  async function act(kind: "approve" | "reject") {
    if (kind === "reject" && !confirm("رفض هذا الطلب؟ لن يتمكن صاحبه من الدخول.")) return;
    setLoading(kind);
    try {
      const r = await fetch(`/api/admin/users/${userId}/approve`, {
        method: kind === "approve" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: kind === "reject" ? JSON.stringify({ reason: "rejected_by_admin" }) : undefined,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error || "فشل الإجراء");
        setLoading("");
        return;
      }
      window.location.reload();
    } catch {
      alert("فشل الإجراء");
      setLoading("");
    }
  }

  return (
    <>
      <button
        onClick={() => act("approve")}
        disabled={!!loading}
        title="الموافقة على الحساب"
        className="px-2 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-xs inline-flex items-center disabled:opacity-50"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => act("reject")}
        disabled={!!loading}
        title="رفض الحساب"
        className="px-2 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs inline-flex items-center disabled:opacity-50"
      >
        <XCircle className="w-3.5 h-3.5" />
      </button>
    </>
  );
}

export default function UsersUi({
  users,
  plans,
}: {
  users: User[];
  plans: Plan[];
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [modal, setModal] = useState<User | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [resetUsageTarget, setResetUsageTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (u.role === "admin") return false;
      if (filter === "pending_approval" && u.approvalStatus !== "pending")
        return false;
      if (filter === "active" && u.subscription?.status !== "active")
        return false;
      if (filter === "pending" && u.subscription?.status !== "pending")
        return false;
      if (filter === "expired" && u.subscription?.status !== "expired")
        return false;
      if (filter === "none" && u.subscription) return false;
      if (filter === "suspended" && !u.suspended) return false;
      const Q = q.trim().toLowerCase();
      if (!Q) return true;
      return [u.email, u.name, u.phone].some((v) =>
        (v || "").toLowerCase().includes(Q),
      );
    });
  }, [users, q, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو البريد أو الهاتف..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pr-10 pl-4 py-2 outline-none focus:border-brand-400"
          />
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-brand-500/20"
        >
          <UserPlus className="w-4 h-4" /> إنشاء عميل جديد
        </button>
        <div className="flex gap-2">
          {[
            ["all", "الكل"],
            ["pending_approval", "بانتظار الموافقة"],
            ["none", "بدون اشتراك"],
            ["pending", "بانتظار"],
            ["active", "نشط"],
            ["expired", "منتهي"],
            ["suspended", "معلّق"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-2 rounded-lg text-sm border ${filter === k ? "bg-brand-500/20 border-brand-500/40 text-brand-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">العميل</th>
                <th className="text-right p-3">الهاتف</th>
                <th className="text-right p-3">الباقة</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">الاستهلاك</th>
                <th className="text-right p-3">ينتهي</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const b = statusBadge(u.subscription?.status);
                const Icon = b.Icon;
                const usage = u.subscription
                  ? Math.round(
                      (u.subscription.msgsUsed / u.subscription.monthlyMsgs) *
                        100,
                    )
                  : 0;
                return (
                  <tr
                    key={u.id}
                    className="border-t border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="p-3">
                      <div className="font-medium">{u.name || "—"}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="p-3 text-slate-300">{u.phone || "—"}</td>
                    <td className="p-3">{u.subscription?.planName || "—"}</td>
                    <td className="p-3">
                      {u.approvalStatus === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs bg-amber-500/15 text-amber-300 border-amber-500/30">
                          <Clock className="w-3 h-3" /> بانتظار الموافقة
                        </span>
                      ) : u.approvalStatus === "rejected" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs bg-rose-500/15 text-rose-300 border-rose-500/30">
                          <XCircle className="w-3 h-3" /> مرفوض
                        </span>
                      ) : u.suspended ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs bg-rose-500/15 text-rose-300 border-rose-500/30"
                          title={u.suspendedReason || ""}
                        >
                          <Ban className="w-3 h-3" /> معلّق
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${b.className}`}
                        >
                          <Icon className="w-3 h-3" /> {b.label}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {u.subscription ? (
                        <div className="min-w-[110px]">
                          <div className="text-xs text-slate-400 mb-1">
                            {u.subscription.msgsUsed}/
                            {u.subscription.monthlyMsgs}
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${usage > 80 ? "bg-rose-500" : "bg-emerald-500"}`}
                              style={{ width: `${Math.min(usage, 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-slate-300">
                      {u.subscription
                        ? new Date(u.subscription.expiresAt).toLocaleDateString(
                            "ar-EG",
                          )
                        : "—"}
                    </td>
                    <td className="p-3 text-left">
                      <div className="flex gap-1.5 justify-end">
                        {u.approvalStatus === "pending" && (
                          <ApproveButtons userId={u.id} />
                        )}
                        {u.subscription && (
                          <button
                            onClick={() => setResetUsageTarget(u.id)}
                            title="إعادة تعيين الاستهلاك"
                            className="px-2 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-200 text-xs inline-flex items-center"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setResetUser(u)}
                          title="إعادة تعيين كلمة المرور"
                          className="px-2 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-xs inline-flex items-center"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u.id)}
                          title="حذف العميل"
                          className="px-2 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs inline-flex items-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setModal(u)}
                          className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium inline-flex items-center gap-1"
                        >
                          {u.subscription ? (
                            <>
                              <RefreshCw className="w-3 h-3" /> إدارة
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" /> تفعيل
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا يوجد عملاء يطابقون البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <SubscriptionModal
          user={modal}
          plans={plans}
          onClose={() => setModal(null)}
        />
      )}
      {createOpen && (
        <CreateUserModal plans={plans} onClose={() => setCreateOpen(false)} />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
      <DeleteUserModalWrapper userId={deleteTarget} plans={plans} onClose={() => setDeleteTarget(null)} />
      <ResetUsageModalWrapper userId={resetUsageTarget} onClose={() => setResetUsageTarget(null)} />
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function doReset() {
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل إعادة التعيين");
      setTempPassword(j.tempPassword);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function copyCredentials() {
    if (!tempPassword) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = [
      `تم تحديث كلمة مرور حسابك:`,
      ``,
      `البريد: ${user.email}`,
      `كلمة المرور الجديدة: ${tempPassword}`,
      `الدخول: ${origin}/login`,
      ``,
      `يُرجى تغيير كلمة المرور بعد أول دخول.`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold inline-flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-400" /> إعادة تعيين كلمة
            المرور
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="mb-4 text-sm">
          <div className="text-slate-400">العميل:</div>
          <div className="font-medium">{user.name || "—"}</div>
          <div className="text-xs text-slate-400" dir="ltr">
            {user.email}
          </div>
        </div>

        {tempPassword ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 text-emerald-300 font-bold mb-3">
                <CheckCircle2 className="w-5 h-5" /> تم إنشاء كلمة مرور جديدة
              </div>
              <div className="space-y-2 text-sm">
                <Row label="البريد" value={user.email} mono />
                <Row label="كلمة المرور" value={tempPassword} mono highlight />
              </div>
            </div>

            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              ⚠️ هذه آخر مرة تظهر فيها كلمة المرور. انسخها وأرسلها للعميل الآن.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyCredentials}
                className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "تم النسخ" : "نسخ البيانات"}
              </button>
              {user.phone && (
                <a
                  href={`https://wa.me/${user.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                    `تم تحديث كلمة مرور حسابك:\n\nالبريد: ${user.email}\nكلمة المرور الجديدة: ${tempPassword}\nالدخول من: ${typeof window !== "undefined" ? window.location.origin : ""}/login\n\nيُرجى تغيير كلمة المرور بعد أول دخول.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-200 text-sm inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> واتساب
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-4 leading-relaxed">
              سيتم توليد كلمة مرور جديدة عشوائية وتعطيل كلمة المرور الحالية
              فوراً. العميل المسجّل دخوله حالياً سيبقى بجلسته حتى تنتهي صلاحيتها
              (٣٠ يوم بحد أقصى).
            </p>
            {err && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm mb-3">
                {err}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={doReset}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-semibold inline-flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                {loading ? "جاري التوليد..." : "توليد كلمة مرور جديدة"}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
              >
                إلغاء
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreateUserModal({
  plans,
  onClose,
}: {
  plans: Plan[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [planSlug, setPlanSlug] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<null | {
    email: string;
    name: string | null;
    phone: string | null;
    tempPassword: string;
    planName?: string;
    expiresAt?: string;
  }>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          phone: phone.trim() || null,
          planSlug: planSlug || null,
          billingCycle,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل الإنشاء");
      setResult({
        email: j.user.email,
        name: j.user.name,
        phone: j.user.phone,
        tempPassword: j.tempPassword,
        planName: j.subscription?.planName,
        expiresAt: j.subscription?.expiresAt,
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function copyCredentials() {
    if (!result) return;
    const text = [
      `تم إنشاء حسابك في المنصة:`,
      ``,
      `البريد: ${result.email}`,
      `كلمة المرور: ${result.tempPassword}`,
      `الدخول: ${typeof window !== "undefined" ? window.location.origin : ""}/login`,
      ``,
      result.planName ? `الباقة: ${result.planName}` : "",
      result.expiresAt
        ? `صالح حتى: ${new Date(result.expiresAt).toLocaleDateString("ar-EG")}`
        : "",
      ``,
      `يُرجى تغيير كلمة المرور بعد أول دخول.`,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setPlanSlug("");
    setBillingCycle("monthly");
    setResult(null);
    setErr("");
  }

  function done() {
    onClose();
    if (result) window.location.reload();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={done}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold inline-flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-brand-400" /> إنشاء عميل جديد
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              سيتم توليد كلمة مرور مؤقتة. أرسلها للعميل ليُغيّرها.
            </p>
          </div>
          <button onClick={done} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 text-emerald-300 font-bold mb-3">
                <CheckCircle2 className="w-5 h-5" /> تم إنشاء الحساب بنجاح
              </div>
              <div className="space-y-2 text-sm">
                <Row label="الاسم" value={result.name || "—"} />
                <Row label="البريد" value={result.email} mono />
                <Row label="الهاتف" value={result.phone || "—"} mono />
                <Row
                  label="كلمة المرور"
                  value={result.tempPassword}
                  mono
                  highlight
                />
                {result.planName && (
                  <Row label="الباقة" value={result.planName} />
                )}
                {result.expiresAt && (
                  <Row
                    label="ينتهي"
                    value={new Date(result.expiresAt).toLocaleDateString(
                      "ar-EG",
                    )}
                  />
                )}
              </div>
            </div>

            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              ⚠️ هذه آخر مرة تظهر فيها كلمة المرور. انسخها وأرسلها للعميل الآن
              عبر إيميل أو واتساب.
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyCredentials}
                className="flex-1 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "تم النسخ" : "نسخ بيانات الدخول"}
              </button>
              {result.phone && (
                <a
                  href={`https://wa.me/${result.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
                    `مرحباً ${result.name || ""}\nتم إنشاء حسابك في المنصة:\n\nالبريد: ${result.email}\nكلمة المرور: ${result.tempPassword}\nالدخول من: ${typeof window !== "undefined" ? window.location.origin : ""}/login\n\n${result.planName ? `الباقة: ${result.planName}\n` : ""}يُرجى تغيير كلمة المرور بعد أول دخول.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-200 text-sm inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> إرسال واتساب
                </a>
              )}
              <button
                onClick={reset}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
              >
                + عميل آخر
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {err && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm">
                {err}
              </div>
            )}

            <div>
              <label className="text-sm text-slate-400 mb-1 block">الاسم</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم العميل"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-brand-400"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">
                البريد الإلكتروني *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                dir="ltr"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-brand-400"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">
                رقم الواتساب
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+201234567890"
                dir="ltr"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-brand-400"
              />
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1 block">
                الباقة (اختياري)
              </label>
              <select
                value={planSlug}
                onChange={(e) => setPlanSlug(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-brand-400"
              >
                <option value="" className="bg-slate-900">
                  — بدون اشتراك الآن —
                </option>
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug} className="bg-slate-900">
                    {p.name} — ${p.priceUsd}/شهر —{" "}
                    {p.monthlyMsgs.toLocaleString()} رسالة
                  </option>
                ))}
              </select>
            </div>

            {planSlug && (
              <div>
                <label className="text-sm text-slate-400 mb-1 block">
                  نوع الفاتورة
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["monthly", "yearly"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBillingCycle(c)}
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        billingCycle === c
                          ? "bg-brand-500/20 border-brand-500/40 text-brand-200"
                          : "bg-white/5 border-white/10 text-slate-300"
                      }`}
                    >
                      {c === "monthly" ? "شهري (30 يوم)" : "سنوي (365 يوم)"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-xl py-2.5 font-medium inline-flex items-center justify-center gap-2 mt-2"
            >
              <UserPlus className="w-4 h-4" />
              {loading ? "جاري الإنشاء..." : "إنشاء الحساب وتوليد كلمة المرور"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400 shrink-0">{label}:</span>
      <span
        className={`${mono ? "font-mono text-xs" : ""} ${
          highlight
            ? "bg-amber-500/20 text-amber-200 px-2 py-1 rounded"
            : "text-white"
        } truncate`}
        dir="ltr"
      >
        {value}
      </span>
    </div>
  );
}

function SubscriptionModal({
  user,
  plans,
  onClose,
}: {
  user: User;
  plans: Plan[];
  onClose: () => void;
}) {
  const [planSlug, setPlanSlug] = useState(
    user.subscription?.planSlug || plans[0]?.slug || "",
  );
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    (user.subscription?.billingCycle as any) || "monthly",
  );
  const [paymentRef, setPaymentRef] = useState(
    user.subscription?.paymentRef || "",
  );
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function activate() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          planSlug,
          billingCycle,
          paymentRef,
          adminNote,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل التفعيل");
      window.location.reload();
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  async function cancel() {
    if (!confirm("هل تريد إلغاء الاشتراك؟")) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action: "cancel" }),
      });
      if (!r.ok) throw new Error("فشل الإلغاء");
      window.location.reload();
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  const waMsg = encodeURIComponent(
    `مرحباً، تم تفعيل اشتراكك (${plans.find((p) => p.slug === planSlug)?.name}) بنجاح ✅\nيمكنك الدخول لحسابك الآن.`,
  );
  const waLink = user.phone
    ? `https://wa.me/${user.phone.replace(/[^\d]/g, "")}?text=${waMsg}`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold">إدارة اشتراك</h3>
            <div className="text-sm text-slate-400">
              {user.name} — {user.email}
            </div>
            <div className="text-xs text-slate-500 mt-1">{user.phone}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {err && (
          <div className="mb-3 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm">
            {err}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-sm text-slate-400 mb-1 block">الباقة</label>
            <select
              value={planSlug}
              onChange={(e) => setPlanSlug(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none"
            >
              {plans.map((p) => (
                <option key={p.slug} value={p.slug} className="bg-slate-900">
                  {p.name} — ${p.priceUsd}/شهر —{" "}
                  {p.monthlyMsgs.toLocaleString()} رسالة
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">
              نوع الفاتورة
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["monthly", "yearly"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setBillingCycle(c)}
                  className={`px-3 py-2 rounded-lg border text-sm ${billingCycle === c ? "bg-brand-500/20 border-brand-500/40 text-brand-200" : "bg-white/5 border-white/10 text-slate-300"}`}
                >
                  {c === "monthly" ? "شهري (30 يوم)" : "سنوي (365 يوم)"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">
              رقم التحويل / المرجع (اختياري)
            </label>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="رقم العملية أو الإيصال"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 mb-1 block">
              ملاحظة داخلية (اختياري)
            </label>
            <input
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="ملاحظة الإدارة"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={activate}
            disabled={loading}
            className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-xl py-2.5 font-medium inline-flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {user.subscription?.status === "active"
              ? "تمديد / تجديد"
              : "تفعيل الآن"}
          </button>
          {user.subscription && user.subscription.status === "active" && (
            <button
              onClick={cancel}
              disabled={loading}
              className="px-4 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 rounded-xl py-2.5 text-rose-200 text-sm"
            >
              إلغاء
            </button>
          )}
        </div>

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener"
            className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
          >
            <ExternalLink className="w-4 h-4" /> أبلغ العميل عبر واتساب
          </a>
        )}
      </div>
    </div>
  );
}

function DeleteUserModalWrapper({ userId, plans, onClose }: { userId: string | null; plans: Plan[]; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  if (!userId) return null;

  async function doDelete() {
    if (!confirm("هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع بيانات العميل بما فيها الطلبات والمحادثات.")) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/users/${userId}/delete`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل الحذف");
      setDone(true);
      setTimeout(() => { onClose(); window.location.reload(); }, 1500);
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold inline-flex items-center gap-2 mb-4">
          <Trash2 className="w-5 h-5 text-rose-400" /> حذف العميل
        </h3>
        {done ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">✅ تم الحذف بنجاح</div>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-4">سيتم حذف العميل وجميع بياناته. هذا الإجراء نهائي.</p>
            {err && <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm mb-3">{err}</div>}
            <div className="flex gap-2">
              <button onClick={doDelete} disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-medium inline-flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> {loading ? "جاري الحذف..." : "تأكيد الحذف"}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm">إلغاء</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResetUsageModalWrapper({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  if (!userId) return null;

  async function doReset() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/users/${userId}/reset-usage`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "فشل إعادة التعيين");
      setDone(true);
      setTimeout(() => { onClose(); window.location.reload(); }, 1500);
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold inline-flex items-center gap-2 mb-4">
          <RefreshCw className="w-5 h-5 text-teal-400" /> إعادة تعيين الاستهلاك
        </h3>
        {done ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">✅ تم إعادة التعيين بنجاح</div>
        ) : (
          <>
            <p className="text-sm text-slate-300 mb-4">سيتم تصفير عداد الرسائل للاشتراك الحالي دون تغيير تاريخ الانتهاء.</p>
            {err && <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm mb-3">{err}</div>}
            <div className="flex gap-2">
              <button onClick={doReset} disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-medium inline-flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> {loading ? "جاري..." : "تصفير الاستهلاك"}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm">إلغاء</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
