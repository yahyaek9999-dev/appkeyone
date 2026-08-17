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
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold tabular-nums text-white">${p.amountUsd}</span>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-400">{p.methodKey}</span>
              {p.planSlug && <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">{p.planSlug}</span>}
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${p.status === "under_review" ? "border-sky-500/20 bg-sky-500/10 text-sky-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                {p.status === "under_review" ? "قيد المراجعة" : "بانتظار المراجعة"}
              </span>
            </div>
            <div className="text-[12px] text-slate-500">
              العميل: <span className="font-mono text-slate-400">{String(p.userId).slice(-8)}</span>
              <span className="mx-1.5 text-white/20">·</span>
              {fmt(p.createdAt)}
            </div>
            {p.reference && <div className="text-[12px] text-slate-500">المرجع: <span className="font-mono text-slate-400">{p.reference}</span></div>}

            <div className="flex flex-wrap gap-2 pt-1">
              {p.status === "pending" && (
                <button disabled={!!busy} onClick={() => act(p.id, { action: "start_review" })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50">
                  بدء المراجعة
                </button>
              )}
              <button disabled={busy === p.id} onClick={() => act(p.id, { decision: "approve" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50">
                اعتماد وشحن الرصيد
              </button>
              <button disabled={busy === p.id} onClick={() => { setRejectFor(rejectFor === p.id ? null : p.id); setReason(""); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50">
                رفض
              </button>
            </div>

            {rejectFor === p.id && (
              <div className="mt-2 space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3">
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="سبب الرفض (يراه العميل) — إلزامي"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:border-rose-500/40 focus:outline-none" />
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظة داخلية (اختياري)"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white placeholder-slate-600 focus:outline-none" />
                <button disabled={busy === p.id || !reason.trim()} onClick={() => act(p.id, { decision: "reject", rejectionReason: reason, note })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50">
                  تأكيد الرفض
                </button>
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
                      ? <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-500">مُسترَد</span>
                      : <button disabled={busy === p.id} onClick={() => refund(p.id)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition">استرداد</button>}
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
