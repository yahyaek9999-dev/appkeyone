"use client";
import { useState } from "react";

export default function IncidentsClient({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [busy, setBusy] = useState("");
  async function resolve(id: string) {
    // Record WHAT was actually done — this persists to the incident's Resolution
    // history, so the log is meaningful instead of a generic "resolved by admin".
    const resolution = window.prompt("صف كيف تم حلّ الحادثة (يُحفظ في سجل الحوادث):", "");
    if (resolution === null) return; // admin cancelled
    const rootCause = window.prompt("السبب الجذري (اختياري):", "") || "";
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/incidents/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolution: resolution.trim() || "تم الحلّ يدويًا", rootCause: rootCause.trim() }) });
      const j = await res.json().catch(() => null);
      if (j?.ok) setRows((rs) => rs.filter((r) => r.id !== id));
    } finally { setBusy(""); }
  }
  return (
    <div className="card p-5 overflow-x-auto">
      {rows.length === 0 ? <p className="text-slate-500 text-sm">لا توجد حوادث مفتوحة.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">الفئة</th><th className="p-1.5">الخطورة</th><th className="p-1.5">العنوان</th><th className="p-1.5">القسم</th><th className="p-1.5">الحالة</th><th className="p-1.5 text-left">إجراء</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="p-1.5 font-mono text-xs">{r.category}</td>
                <td className="p-1.5">{r.severity}</td>
                <td className="p-1.5">{r.title}</td>
                <td className="p-1.5 font-mono text-xs">{r.department}</td>
                <td className="p-1.5">{r.status}</td>
                <td className="p-1.5 text-left"><button disabled={busy === r.id} onClick={() => resolve(r.id)} className="rounded bg-emerald-500/15 text-emerald-300 text-xs px-3 py-1 disabled:opacity-50">حلّ</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
