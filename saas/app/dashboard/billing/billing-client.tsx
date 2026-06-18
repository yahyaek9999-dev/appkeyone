"use client";
import { useState } from "react";
import Link from "next/link";

export default function BillingClient({ plans, methods, proofs: initialProofs }: { plans: any[]; methods: any[]; proofs: any[] }) {
  const [plan, setPlan] = useState(plans[0]?.slug || "");
  const [method, setMethod] = useState(methods[0]?.key || "");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<any[]>(initialProofs || []);
  const selectedPlan = plans.find((p) => p.slug === plan);
  const selectedMethod = methods.find((m) => m.key === method);

  async function submit() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/payments/proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ methodKey: method, planSlug: plan, amountUsd: selectedPlan?.price || 0, reference, proofUrl }) });
      const j = await res.json().catch(() => null);
      if (j?.ok) { setMsg("✓ تم إرسال طلب الدفع — بانتظار مراجعة فريق المالية."); setProofs((ps) => [j.proof, ...ps]); setReference(""); setProofUrl(""); }
      else setMsg("خطأ: " + (j?.error || "تعذّر الإرسال"));
    } finally { setBusy(false); }
  }
  async function cancel(id: string) {
    const res = await fetch(`/api/payments/proof/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    const j = await res.json().catch(() => null);
    if (j?.ok) setProofs((ps) => ps.map((p) => (p.id === id ? { ...p, status: "canceled" } : p)));
  }
  const statusLabel = (s: string) => s === "approved" ? "معتمد ✓" : s === "rejected" ? "مرفوض" : s === "canceled" ? "ملغى" : "قيد المراجعة";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card p-5 space-y-3">
        <label className="block text-sm">الباقة
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 w-full bg-white/5 rounded px-2 py-1.5">{plans.map((p) => <option key={p.slug} value={p.slug}>{p.name} — ${p.price}/mo</option>)}</select>
        </label>
        <label className="block text-sm">طريقة الدفع
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full bg-white/5 rounded px-2 py-1.5">{methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
        </label>
        {selectedMethod?.instructions ? <div className="rounded-lg bg-white/5 p-3 text-xs text-slate-300 whitespace-pre-wrap">{selectedMethod.instructions}</div> : null}
        <input placeholder="رقم العملية / المرجع" value={reference} onChange={(e) => setReference(e.target.value)} className="w-full bg-white/5 rounded px-2 py-1.5 text-sm" />
        <input placeholder="رابط إيصال الدفع (صورة)" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} className="w-full bg-white/5 rounded px-2 py-1.5 text-sm" />
        <button disabled={busy || !plan || !method} onClick={submit} className="rounded bg-brand-500/15 text-brand-300 px-4 py-2 text-sm disabled:opacity-50">إرسال طلب الدفع</button>
        {msg && <p className="text-sm text-slate-300">{msg}</p>}
      </div>

      <div className="card p-4 text-sm text-slate-400 space-y-1">
        <div className="font-semibold text-white mb-1">ماذا يحدث بعد الإرسال؟</div>
        <p>• يراجع طلبك <b className="text-slate-200">فريق المالية</b> يدويًا.</p>
        <p>• المدة المتوقعة: <b className="text-slate-200">خلال ٢٤ ساعة</b> عادةً.</p>
        <p>• تتبّع الحالة في الجدول أدناه — يمكنك <b className="text-slate-200">الإلغاء</b> ما دام الطلب قيد المراجعة.</p>
        <p>• بعد الاعتماد: يُشحن رصيدك وتُفعَّل باقتك تلقائيًا. تحتاج مساعدة؟ <Link href="/support" className="text-brand-300 underline">مركز المساعدة</Link></p>
      </div>

      {proofs.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold mb-3">طلباتك وحالتها</h2>
          <table className="w-full text-sm"><tbody>
            {proofs.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="p-1.5 font-mono text-xs">{p.methodKey}</td>
                <td className="p-1.5">${p.amountUsd}</td>
                <td className="p-1.5">{p.planSlug || "—"}</td>
                <td className="p-1.5">{statusLabel(p.status)}</td>
                <td className="p-1.5 text-left">{p.status === "pending" ? <button onClick={() => cancel(p.id)} className="text-xs text-rose-300 underline">إلغاء</button> : null}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
