"use client";
import { useState } from "react";

const PRIO_AR: Record<string, string> = { urgent: "عاجلة", high: "عالية", medium: "متوسطة", low: "منخفضة" };
const PRIO_CLR: Record<string, string> = { urgent: "bg-rose-500/20 text-rose-300", high: "bg-amber-500/20 text-amber-300", medium: "bg-sky-500/20 text-sky-300", low: "bg-white/10 text-slate-300" };
const KIND_AR: Record<string, string> = { created: "أُنشئت", assigned: "أُسندت", reassigned: "أُعيد إسنادها", priority_changed: "تغيّرت الأولوية", status_changed: "تغيّرت الحالة", resolved: "حُلّت", note: "ملاحظة", due_set: "حُدّد الاستحقاق" };

function fmt(d?: string | null) { if (!d) return ""; try { return new Date(d).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } }

export default function IncidentsClient({ initial, staff }: { initial: any[]; staff: { id: string; name: string; dept: string }[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function call(id: string, body: any) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/incidents/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      return j;
    } finally { setBusy(""); }
  }

  async function resolve(id: string) {
    const resolution = window.prompt("صف كيف تم حلّ الحادثة (يُحفظ في السجل):", "");
    if (resolution === null) return;
    const rootCause = window.prompt("السبب الجذري (اختياري):", "") || "";
    const j = await call(id, { resolution: resolution.trim() || "تم الحلّ يدويًا", rootCause: rootCause.trim() });
    if (j?.ok) setRows((rs) => rs.filter((r) => r.id !== id));
  }
  async function assign(id: string, staffId: string) {
    if (!staffId) return;
    const j = await call(id, { action: "assign", staffId });
    if (j?.ok) { const s = staff.find((x) => x.id === staffId); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, assignedStaffId: staffId, ownerName: s?.name || staffId, status: r.status === "open" ? "assigned" : r.status } : r))); }
  }
  async function setPriority(id: string, priority: string) {
    const j = await call(id, { action: "priority", priority });
    if (j?.ok) setRows((rs) => rs.map((r) => (r.id === id ? { ...r, priority } : r)));
  }

  if (rows.length === 0) return <div className="card p-6 text-sm text-slate-400">لا توجد حوادث مفتوحة. 🎉</div>;

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const overdue = r.dueDate && new Date(r.dueDate).getTime() < Date.now();
        return (
          <div key={r.id} className="card p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-slate-400">{r.category}</span>
              <b>{r.title}</b>
              <span className={`rounded px-2 py-0.5 text-[11px] ${PRIO_CLR[r.priority] || PRIO_CLR.medium}`}>{PRIO_AR[r.priority] || r.priority}</span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-[11px]">{r.status}</span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-[11px]">قسم: {r.department}</span>
              {r.dueDate && <span className={`text-[11px] ${overdue ? "text-rose-300" : "text-slate-500"}`}>الاستحقاق: {fmt(r.dueDate)}{overdue ? " (متأخرة)" : ""}</span>}
            </div>
            {r.detail && <div className="text-xs text-slate-500">{r.detail}</div>}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">المالك:</span>
              <select value={r.assignedStaffId || ""} onChange={(e) => assign(r.id, e.target.value)} disabled={busy === r.id} className="bg-white/5 rounded px-1.5 py-0.5">
                <option value="">— بلا مالك —</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.dept || "—"})</option>)}
              </select>
              <span className="text-slate-400 ms-2">الأولوية:</span>
              <select value={r.priority} onChange={(e) => setPriority(r.id, e.target.value)} disabled={busy === r.id} className="bg-white/5 rounded px-1.5 py-0.5">
                {["urgent", "high", "medium", "low"].map((p) => <option key={p} value={p}>{PRIO_AR[p]}</option>)}
              </select>
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="ms-2 rounded bg-white/5 px-2 py-0.5">{open === r.id ? "إخفاء السجل" : `السجل (${r.events?.length || 0})`}</button>
              <button disabled={busy === r.id} onClick={() => resolve(r.id)} className="ms-auto rounded bg-emerald-500/15 text-emerald-300 px-3 py-1 disabled:opacity-50">حلّ</button>
            </div>

            {open === r.id && (
              <ol className="mt-1 space-y-1 border-r border-white/10 pe-3 text-[11px]">
                {(r.events || []).map((e: any) => (
                  <li key={e.id} className="text-slate-400"><span className="text-slate-300">{KIND_AR[e.kind] || e.kind}</span>{e.toValue ? ` → ${e.toValue}` : ""}{e.actorEmail && e.actorEmail !== "system" ? ` · ${e.actorEmail}` : ""} <span className="text-slate-600">{fmt(e.createdAt)}</span></li>
                ))}
                {(r.events || []).length === 0 && <li className="text-slate-600">لا يوجد سجل.</li>}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
