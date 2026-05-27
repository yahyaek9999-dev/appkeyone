"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ORDER_STATUSES = ["pending","confirmed","preparing","shipped","out_for_delivery","delivered","canceled","refunded"] as const;

export function OrderStatusUpdater({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateStatus(status: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: `تم تغيير الحالة إلى ${status} بواسطة الإدارة` }),
      });
      if (r.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const nextStatuses = ORDER_STATUSES.filter((s) => s !== currentStatus);

  return (
    <select
      value={currentStatus}
      onChange={(e) => updateStatus(e.target.value)}
      disabled={loading}
      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none focus:border-brand-400 disabled:opacity-50 max-w-[120px]"
    >
      <option value={currentStatus} className="bg-slate-900" disabled>{currentStatus}</option>
      {nextStatuses.map((s) => (
        <option key={s} value={s} className="bg-slate-900">{s}</option>
      ))}
    </select>
  );
}
