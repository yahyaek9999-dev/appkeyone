"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";

function fmt(d?: string | null) { if (!d) return ""; try { return new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } }

export default function FinancePaymentsClient({ initial, approved = [] }: { initial: any[]; approved?: any[] }) {
  const [rows, setRows] = useState<any[]>(initial);
  const [done, setDone] = useState<any[]>(approved);
  const [busy, setBusy] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const { success, error } = useToast();

  async function refund(id: string) {
    const why = window.prompt("سبب استرداد هذه الدفعة (يُسجَّل في سجل التدقيق):", "");
    if (why === null) return;
    if (!why.trim()) { error("سبب الاسترداد مطلوب."); return; }
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/payment-reviews/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refund", reason: why.trim() }) });
      const j = await res.json().catch(() => null);
      if (j?.ok) { setDone((ds) => ds.map((d) => (d.id === id ? { ...d, status: "refunded" } : d))); success("تم استرداد الدفعة وعكس الرصيد ✓"); }
      else error(j?.message || j?.reason || "تعذّر الاسترداد.");
    } finally { setBusy(""); }
  }

  async function act(id: string, payload: any, removeOnOk = true) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/payment-reviews/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json().catch(() => null);
      if (j && (j.ok || j.status)) {
        if (payload.action === "start_review") { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "under_review", reviewStartedAt: new Date().toISOString() } : r))); }
        else if (removeOnOk) { setRows((rs) => rs.filter((r) => r.id !== id)); setRejectFor(null); setReason(""); setNote(""); success(payload.decision === "approve" ? "تم الاعتماد — شُحنت المحفظة وفُعّلت الباقة 🎉" : "تم رفض الدفعة وإبلاغ العميل بالسبب."); }
      } else error(j?.message || j?.error || "تعذّر تنفيذ الإجراء.");
    } finally { setBusy(""); }
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && <EmptyState size="md" icon={<span>🎉</span>} title="لا توجد مدفوعات بانتظار المراجعة" description="طابور المراجعة فارغ — كل المدفوعات تمت معالجتها. ستظهر الطلبات الجديدة هنا فور وصولها." />}
      {rows.map((p) => (
        <div key={p.id} className="card p-4 flex flex-col gap-3 md:flex-row md:items-start">
          {/* receipt image */}
          <div className="shrink-0">
            {p.proofImagePath ? (
              <button onClick={() => setZoom(`/api/payments/proof/${p.id}/image`)} className="block">
                <img src={`/api/payments/proof/${p.id}/image`} alt="إيصال" className="h-28 w-28 rounded-lg border border-white/10 object-cover hover:opacity-80" />
                <span className="text-[10px] text-slate-500">اضغط للتكبير</span>
              </button>
            ) : p.proofUrl ? (
              <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-300 underline">رابط إيصال خارجي</a>
            ) : <div className="h-28 w-28 rounded-lg border border-dashed border-rose-500/40 grid place-items-center text-[10px] text-rose-300 text-center p-1">لا يوجد إيصال مرفوع</div>}
          </div>

          {/* details + actions */}
          <div className="flex-1 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-lg">${p.amountUsd}</b>
              <span className="font-mono text-xs text-slate-400">{p.methodKey}</span>
              {p.planSlug && <span className="rounded bg-white/5 px-2 py-0.5 text-xs">{p.planSlug}</span>}
              <span className={`rounded px-2 py-0.5 text-xs ${p.status === "under_review" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>{p.status === "under_review" ? "قيد المراجعة" : "بانتظار المراجعة"}</span>
            </div>
            <div className="text-xs text-slate-500">العميل: <span className="font-mono">{p.userId}</span> · {fmt(p.createdAt)}</div>
            {p.reference && <div className="text-xs text-slate-400">المرجع: <span className="font-mono">{p.reference}</span></div>}

            <div className="flex flex-wrap gap-2 pt-1">
              {p.status === "pending" && <button disabled={!!busy} onClick={() => act(p.id, { action: "start_review" })} className="rounded bg-sky-500/15 text-sky-300 text-xs px-3 py-1.5 disabled:opacity-50">بدء المراجعة</button>}
              <button disabled={busy === p.id} onClick={() => act(p.id, { decision: "approve" })} className="rounded bg-emerald-500/15 text-emerald-300 text-xs px-3 py-1.5 disabled:opacity-50">اعتماد وشحن الرصيد</button>
              <button disabled={busy === p.id} onClick={() => { setRejectFor(rejectFor === p.id ? null : p.id); setReason(""); }} className="rounded bg-rose-500/15 text-rose-300 text-xs px-3 py-1.5 disabled:opacity-50">رفض</button>
            </div>

            {rejectFor === p.id && (
              <div className="mt-2 space-y-1.5 rounded-lg bg-rose-500/5 border border-rose-500/20 p-2.5">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب الرفض (يراه العميل) — إلزامي" className="w-full bg-white/5 rounded px-2 py-1.5 text-xs" />
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة داخلية (اختياري)" className="w-full bg-white/5 rounded px-2 py-1.5 text-xs" />
                <button disabled={busy === p.id || !reason.trim()} onClick={() => act(p.id, { decision: "reject", rejectionReason: reason, note })} className="rounded bg-rose-500/20 text-rose-200 text-xs px-3 py-1.5 disabled:opacity-50">تأكيد الرفض</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {zoom && (
        <div onClick={() => setZoom(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 cursor-zoom-out">
          <img src={zoom} alt="إيصال مكبّر" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}

      {/* Recently approved — with refund (reverses the wallet credit) */}
      {done.length > 0 && (
        <div className="card p-5 mt-2">
          <h2 className="font-bold mb-3 text-sm">المعتمدة مؤخرًا — استرداد عند الحاجة</h2>
          <table className="w-full text-xs">
            <tbody>
              {done.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="p-1.5"><b>${p.amountUsd}</b></td>
                  <td className="p-1.5 font-mono text-slate-400">{p.methodKey}</td>
                  <td className="p-1.5 text-slate-500">{p.planSlug || "—"}</td>
                  <td className="p-1.5 font-mono text-[10px] text-slate-500">{String(p.userId).slice(0, 10)}</td>
                  <td className="p-1.5 text-left">
                    {p.status === "refunded"
                      ? <span className="rounded bg-white/5 px-2 py-0.5 text-slate-400">مُسترَد</span>
                      : <button disabled={busy === p.id} onClick={() => refund(p.id)} className="rounded bg-rose-500/10 text-rose-300 px-3 py-1 disabled:opacity-50">استرداد</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
