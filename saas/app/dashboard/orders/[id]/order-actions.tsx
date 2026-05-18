"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending",   label: "قيد المراجعة" },
  { value: "confirmed", label: "مؤكد" },
  { value: "shipped",   label: "تم الشحن" },
  { value: "delivered", label: "تم التسليم" },
  { value: "canceled",  label: "ملغي" },
];

export default function OrderActions({
  orderId,
  status,
  fulfillmentStatus,
}: {
  orderId: string;
  status: string;
  fulfillmentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState(status);

  async function update(patch: any) {
    setErr(null);
    try {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error || "request_failed");
      }
      startTransition(() => router.refresh());
    } catch (e: any) {
      setErr(e?.message || "خطأ غير متوقع");
    }
  }

  async function remove() {
    if (!confirm("هل تريد حذف هذا الطلب؟")) return;
    setErr(null);
    try {
      const r = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("request_failed");
      startTransition(() => router.push("/dashboard/orders"));
    } catch (e: any) {
      setErr(e?.message || "خطأ غير متوقع");
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs text-slate-400">تغيير الحالة</span>
        <select
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            update({ status: e.target.value });
          }}
          disabled={pending}
          className="mt-1 w-full bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => update({ status: "confirmed", fulfillmentStatus: "unfulfilled" })}
          className="flex-1 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 text-xs"
        >
          تأكيد الطلب
        </button>
        <button
          disabled={pending}
          onClick={() => update({ status: "canceled" })}
          className="flex-1 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-xs"
        >
          إلغاء
        </button>
      </div>

      <button
        disabled={pending}
        onClick={remove}
        className="w-full px-3 py-2 rounded-xl border border-white/5 text-slate-400 hover:text-rose-300 text-xs"
      >
        حذف الطلب
      </button>

      {err && <div className="text-rose-300 text-xs">{err}</div>}
    </div>
  );
}
