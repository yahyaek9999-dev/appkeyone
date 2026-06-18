"use client";
import { useState } from "react";

export default function PaymentMethodsClient({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [busy, setBusy] = useState("");
  async function call(key: string, body: any) {
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/payment-methods/${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (j?.ok && j.method) setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...j.method } : r)).sort((a, b) => a.sortOrder - b.sortOrder));
    } finally { setBusy(""); }
  }
  return (
    <div className="card p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">الطريقة</th><th className="p-1.5">مفعّلة</th><th className="p-1.5 text-right">التعليمات للعميل</th><th className="p-1.5 text-left">ترتيب</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.key} className="border-t border-white/5 align-top">
              <td className="p-1.5 font-semibold whitespace-nowrap">{m.label}<div className="font-mono text-[10px] text-slate-500">{m.key}</div></td>
              <td className="p-1.5"><button disabled={busy === m.key} onClick={() => call(m.key, { enabled: !m.enabled })} className={"rounded text-xs px-3 py-1 " + (m.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400")}>{m.enabled ? "مفعّلة" : "موقوفة"}</button></td>
              <td className="p-1.5 w-1/2"><textarea defaultValue={m.instructions} rows={2} placeholder="تعليمات الدفع التي يراها العميل…" onBlur={(e) => { if (e.currentTarget.value !== m.instructions) call(m.key, { instructions: e.currentTarget.value }); }} className="w-full bg-white/5 rounded px-2 py-1 text-xs" /></td>
              <td className="p-1.5 text-left whitespace-nowrap"><button disabled={busy === m.key} onClick={() => call(m.key, { action: "reorder", direction: "up" })} className="rounded bg-white/5 text-xs px-2 py-1">↑</button><button disabled={busy === m.key} onClick={() => call(m.key, { action: "reorder", direction: "down" })} className="ms-1 rounded bg-white/5 text-xs px-2 py-1">↓</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
