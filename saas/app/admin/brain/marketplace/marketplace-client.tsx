"use client";
import { useState } from "react";

export default function MarketplaceClient({ initial }: { initial: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [busy, setBusy] = useState("");

  async function update(key: string, patch: { enabled?: boolean; priceUsd?: number }) {
    setBusy(key);
    try {
      const res = await fetch(`/api/admin/brain/marketplace/${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.listing) setRows((rs) => rs.map((r) => (r.key === key ? j.listing : r)));
      else alert("فشل تحديث القائمة");
    } catch {
      alert("تعذّر الاتصال بالخادم");
    } finally { setBusy(""); }
  }

  return (
    <div className="card p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">القطاع</th><th className="p-1.5 text-right">مفعّل</th><th className="p-1.5 text-right">السعر ($/شهر)</th><th className="p-1.5 text-left">إجراء</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/5">
              <td className="p-1.5 font-semibold">{r.label} <span className="font-mono text-xs text-slate-500">{r.key}</span></td>
              <td className="p-1.5">{r.enabled ? <span className="text-emerald-300">✓</span> : <span className="text-rose-300">✗</span>}</td>
              <td className="p-1.5">
                <input type="number" defaultValue={r.priceUsd} min={0} className="w-20 bg-white/5 rounded px-2 py-1 text-sm" onBlur={(e) => { const v = Number(e.currentTarget.value); if (v !== r.priceUsd) update(r.key, { priceUsd: v }); }} />
              </td>
              <td className="p-1.5 text-left">
                <button disabled={busy === r.key} onClick={() => update(r.key, { enabled: !r.enabled })} className="rounded bg-brand-500/15 text-brand-300 text-xs px-3 py-1 disabled:opacity-50">{r.enabled ? "تعطيل" : "تفعيل"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
