"use client";
import { useState } from "react";

export default function BillingClient({ plans, methods }: { plans: any[]; methods: any[] }) {
  const [plan, setPlan] = useState(plans[0]?.slug || "");
  const [method, setMethod] = useState(methods[0]?.key || "");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedPlan = plans.find((p) => p.slug === plan);
  async function submit() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/payments/proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ methodKey: method, planSlug: plan, amountUsd: selectedPlan?.price || 0, reference, proofUrl }) });
      const j = await res.json().catch(() => null);
      setMsg(j?.ok ? "✓ تم إرسال طلب الدفع — بانتظار مراجعة الفريق." : "خطأ: " + (j?.error || "تعذّر الإرسال"));
    } finally { setBusy(false); }
  }
  return (
    <div className="card p-5 space-y-3 max-w-lg">
      <label className="block text-sm">الباقة
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 w-full bg-white/5 rounded px-2 py-1.5">{plans.map((p) => <option key={p.slug} value={p.slug}>{p.name} — ${p.price}/mo</option>)}</select>
      </label>
      <label className="block text-sm">طريقة الدفع
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full bg-white/5 rounded px-2 py-1.5">{methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
      </label>
      <input placeholder="رقم العملية / المرجع" value={reference} onChange={(e) => setReference(e.target.value)} className="w-full bg-white/5 rounded px-2 py-1.5 text-sm" />
      <input placeholder="رابط إيصال الدفع (صورة)" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} className="w-full bg-white/5 rounded px-2 py-1.5 text-sm" />
      <button disabled={busy || !plan || !method} onClick={submit} className="rounded bg-brand-500/15 text-brand-300 px-4 py-2 text-sm disabled:opacity-50">إرسال طلب الدفع</button>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}
