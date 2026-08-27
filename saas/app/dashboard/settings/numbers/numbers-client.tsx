"use client";

import { useState } from "react";
import { Plus, Phone, Settings2, Star, Wifi, WifiOff, AlertCircle, ChevronRight, Crown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useMutate } from "@/components/ui/use-mutate";

interface WaNumber {
  id: string;
  displayName: string;
  phone: string;
  connectionMethod: string;
  status: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

interface Props {
  numbers: WaNumber[];
  numberLimit: number;
  canAddMore: boolean;
  tier: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active:     { label: "متصل", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    inactive:   { label: "غير مربوط", className: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
    connecting: { label: "جارٍ الاتصال", className: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    error:      { label: "خطأ", className: "bg-red-500/15 text-red-400 border-red-500/20" },
    banned:     { label: "محظور", className: "bg-red-600/20 text-red-300 border-red-600/20" },
  };
  const cfg = map[status] ?? map.inactive;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cfg.className}`}>
      {status === "active" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

export function NumbersClient({ numbers, numberLimit, canAddMore, tier }: Props) {
  const mutate = useMutate();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();

  async function handleAdd() {
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/numbers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "number_limit_reached") {
          toastError("وصلت للحد الأقصى من الأرقام في باقتك. يرجى الترقية.");
        } else {
          toastError("حدث خطأ أثناء إضافة الرقم");
        }
        return;
      }
      toastSuccess("تم إنشاء الرقم بنجاح");
      setAdding(false);
      setNewName("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPrimary(id: string) {
    if (!(await mutate(`/api/numbers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isPrimary: true }),
    }))) return;
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title mb-1">أرقام واتساب</h1>
          <p className="page-desc">
            {numberLimit === 0
              ? "أرقام واتساب غير محدودة"
              : `${numbers.length} من ${numberLimit} ${numberLimit === 1 ? "رقم" : "أرقام"} مستخدمة`}
          </p>
        </div>
        {canAddMore && (
          <button
            onClick={() => setAdding(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            إضافة رقم
          </button>
        )}
      </div>

      {/* Plan limit warning */}
      {!canAddMore && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Crown className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">
            وصلت للحد الأقصى ({numberLimit} رقم) في باقتك الحالية.{" "}
            <Link href="/dashboard/settings/billing" className="underline hover:text-amber-200">
              ترقية الباقة
            </Link>
          </p>
        </div>
      )}

      {/* Add number form */}
      {adding && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
          <p className="mb-3 text-sm font-medium text-white">إضافة رقم واتساب جديد</p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="الاسم المعروض (مثال: دعم العملاء)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="input flex-1"
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={submitting || !newName.trim()}
              className="btn-primary disabled:opacity-50"
            >
              {submitting ? "..." : "إنشاء"}
            </button>
            <button onClick={() => { setAdding(false); setNewName(""); }} className="btn-ghost">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Numbers list */}
      {numbers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
          <Phone className="mb-4 h-10 w-10 text-slate-600" />
          <p className="text-base font-medium text-slate-300">لا توجد أرقام واتساب</p>
          <p className="mt-1 text-sm text-slate-500">أضف رقمك الأول للبدء</p>
          {canAddMore && (
            <button onClick={() => setAdding(true)} className="btn-primary mt-5">
              <Plus className="h-4 w-4" /> إضافة رقم
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {numbers.map((num) => (
            <div
              key={num.id}
              className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.10] hover:bg-white/[0.04]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                <Phone className="h-5 w-5 text-brand-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{num.displayName}</span>
                  {num.isPrimary && (
                    <span className="flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-300">
                      <Star className="h-2.5 w-2.5" /> رئيسي
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {num.phone || "لم يُضَف الرقم بعد"}
                  </span>
                  <StatusBadge status={num.status} />
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                {!num.isPrimary && (
                  <button
                    onClick={() => handleSetPrimary(num.id)}
                    className="btn-ghost text-xs"
                    title="تعيين كرقم رئيسي"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <Link
                  href={`/dashboard/settings/numbers/${num.id}`}
                  className="btn-ghost flex items-center gap-1 text-xs"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  الإعدادات
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connection method note */}
      {numbers.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-slate-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p>
            لربط رقم بواتساب، اذهب إلى إعدادات الرقم ثم قسم "الاتصال" لتوصيله بجسر KEYONE المثبت على جهازك.
          </p>
        </div>
      )}
    </div>
  );
}
