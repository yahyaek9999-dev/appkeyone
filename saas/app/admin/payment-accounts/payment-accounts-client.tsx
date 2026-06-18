"use client";
import { useState } from "react";

export default function PaymentAccountsClient({ initial, methods }: { initial: any[]; methods: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [form, setForm] = useState({ methodKey: methods[0]?.key || "", label: "", accountId: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!form.methodKey || !form.label) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/payment-accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const j = await res.json().catch(() => null);
      if (j?.account) { setRows((rs) => [{ ...j.account, usage: 0 }, ...rs]); setForm({ ...form, label: "", accountId: "", note: "" }); }
    } finally { setBusy(false); }
  }
  async function action(id: string, body: any) {
    const res = await fetch(`/api/admin/payment-accounts/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    if (j?.account) {
      if (body.isDefault) { window.location.reload(); return; }
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...j.account } : r)));
    }
  }
  const methodLabel = (k: string) => methods.find((m) => m.key === k)?.label || k;

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-2 items-end">
        <select value={form.methodKey} onChange={(e) => setForm({ ...form, methodKey: e.target.value })} className="bg-white/5 rounded px-2 py-1.5 text-sm">{methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        <input placeholder="اسم الحساب (مثلاً: فودافون كاش الرئيسي)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="bg-white/5 rounded px-2 py-1.5 text-sm flex-1 min-w-[180px]" />
        <input placeholder="الرقم / العنوان / المعرّف" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="bg-white/5 rounded px-2 py-1.5 text-sm flex-1 min-w-[160px]" />
        <input placeholder="ملاحظة (اختياري)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="bg-white/5 rounded px-2 py-1.5 text-sm" />
        <button disabled={busy || !form.label} onClick={create} className="rounded bg-brand-500/15 text-brand-300 text-sm px-3 py-1.5 disabled:opacity-50">أضف حساب استلام</button>
      </div>
      <div className="card p-5 overflow-x-auto">
        {rows.length === 0 ? <p className="text-slate-500 text-sm">لا توجد حسابات بعد — أضف أول حساب أعلاه.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">الطريقة</th><th className="p-1.5 text-right">الحساب</th><th className="p-1.5">الحالة</th><th className="p-1.5">افتراضي</th><th className="p-1.5">الاستخدام</th><th className="p-1.5 text-left">إجراءات</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="p-1.5 font-mono text-xs">{methodLabel(a.methodKey)}</td>
                  <td className="p-1.5"><div className="font-semibold">{a.label}</div><div className="font-mono text-[10px] text-slate-500">{a.accountId || "—"}</div></td>
                  <td className="p-1.5">
                    <select value={a.status} onChange={(e) => action(a.id, { status: e.target.value })} className="bg-white/5 rounded px-1.5 py-0.5 text-xs">
                      <option value="active">نشط</option><option value="maintenance">صيانة</option><option value="archived">مؤرشف</option>
                    </select>
                  </td>
                  <td className="p-1.5 text-center">{a.isDefault ? <span className="text-emerald-300">★</span> : <button onClick={() => action(a.id, { isDefault: true })} className="text-xs text-slate-400 underline">تعيين</button>}</td>
                  <td className="p-1.5 text-center">{a.usage}</td>
                  <td className="p-1.5 text-left whitespace-nowrap">
                    <button onClick={() => action(a.id, { enabled: !a.enabled })} className={"rounded text-xs px-2 py-1 " + (a.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-400")}>{a.enabled ? "مفعّل" : "موقوف"}</button>
                    <button onClick={() => action(a.id, { action: "reorder", direction: "up" })} className="ms-1 rounded bg-white/5 text-xs px-2 py-1">↑</button>
                    <button onClick={() => action(a.id, { action: "reorder", direction: "down" })} className="ms-1 rounded bg-white/5 text-xs px-2 py-1">↓</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
