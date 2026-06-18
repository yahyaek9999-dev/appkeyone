"use client";
import { useState } from "react";

export default function StaffClient({ initial, departments }: { initial: any[]; departments: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [form, setForm] = useState({ name: "", email: "", role: "support", departmentKey: "finance" });
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const j = await res.json().catch(() => null);
      if (j?.staff) { setRows((rs) => [j.staff, ...rs]); setForm({ ...form, name: "", email: "" }); }
    } finally { setBusy(false); }
  }
  async function suspend(id: string, val: boolean) {
    const res = await fetch(`/api/admin/staff/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "suspend", suspend: val }) });
    const j = await res.json().catch(() => null);
    if (j?.staff) setRows((rs) => rs.map((r) => (r.id === id ? j.staff : r)));
  }
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap gap-2 items-end">
        <input placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white/5 rounded px-2 py-1 text-sm" />
        <input placeholder="البريد" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-white/5 rounded px-2 py-1 text-sm" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-white/5 rounded px-2 py-1 text-sm">{["finance", "support", "operations", "sales", "developer", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}</select>
        <select value={form.departmentKey} onChange={(e) => setForm({ ...form, departmentKey: e.target.value })} className="bg-white/5 rounded px-2 py-1 text-sm">{departments.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
        <button disabled={busy || !form.name || !form.email} onClick={create} className="rounded bg-brand-500/15 text-brand-300 text-sm px-3 py-1 disabled:opacity-50">إنشاء موظف</button>
      </div>
      <div className="card p-5 overflow-x-auto">
        {rows.length === 0 ? <p className="text-slate-500 text-sm">لا يوجد طاقم بعد.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">الاسم</th><th className="p-1.5">الدور</th><th className="p-1.5">القسم</th><th className="p-1.5">العبء</th><th className="p-1.5">الحالة</th><th className="p-1.5 text-left">إجراء</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-1.5 font-semibold">{r.name}<div className="text-xs text-slate-500 font-mono">{r.email}</div></td>
                  <td className="p-1.5 font-mono text-xs">{r.role}</td>
                  <td className="p-1.5 font-mono text-xs">{r.departmentKey || "—"}</td>
                  <td className="p-1.5 text-center">{r.workload}</td>
                  <td className="p-1.5">{r.status === "active" ? <span className="text-emerald-300">نشط</span> : <span className="text-rose-300">موقوف</span>}</td>
                  <td className="p-1.5 text-left"><button onClick={() => suspend(r.id, r.status === "active")} className="rounded bg-white/5 text-xs px-3 py-1">{r.status === "active" ? "إيقاف" : "تفعيل"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
