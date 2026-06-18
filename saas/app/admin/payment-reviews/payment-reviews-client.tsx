"use client";
import { useState } from "react";

export default function PaymentReviewsClient({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [busy, setBusy] = useState("");
  async function review(id: string, decision: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/payment-reviews/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const j = await res.json().catch(() => null);
      if (j && j.ok) setRows((rs) => rs.filter((r) => r.id !== id));
    } finally { setBusy(""); }
  }
  return (
    <div className="card p-5 overflow-x-auto">
      {rows.length === 0 ? <p className="text-slate-500 text-sm">لا توجد مدفوعات معلّقة للمراجعة.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">المستخدم</th><th className="p-1.5">الطريقة</th><th className="p-1.5">المبلغ</th><th className="p-1.5">الباقة</th><th className="p-1.5">المرجع</th><th className="p-1.5 text-left">إجراء</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="p-1.5 font-mono text-xs text-slate-400">{String(r.userId).slice(0, 8)}…</td>
                <td className="p-1.5 font-mono text-xs">{r.methodKey}</td>
                <td className="p-1.5 font-bold">${r.amountUsd}</td>
                <td className="p-1.5">{r.planSlug || "—"}</td>
                <td className="p-1.5 text-xs text-slate-400">{r.reference || "—"}</td>
                <td className="p-1.5 text-left whitespace-nowrap">
                  <button disabled={busy === r.id} onClick={() => review(r.id, "approve")} className="rounded bg-emerald-500/15 text-emerald-300 text-xs px-3 py-1 disabled:opacity-50">اعتماد</button>
                  <button disabled={busy === r.id} onClick={() => review(r.id, "reject")} className="ms-1 rounded bg-rose-500/15 text-rose-300 text-xs px-3 py-1 disabled:opacity-50">رفض</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
