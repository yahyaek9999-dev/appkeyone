"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import ImageDropzone from "@/components/ui/image-dropzone";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";

type Account = { id: string; label: string; accountHolder: string; accountId: string; instructions: string; note: string; isDefault: boolean };
type Method = { key: string; label: string; kind: string; instructions: string; accounts: Account[] };

const STATUS_AR: Record<string, string> = {
  pending: "قيد الانتظار", under_review: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض", canceled: "ملغى",
};

function fmt(d?: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}
      className="ms-2 rounded bg-white/10 px-2 py-0.5 text-[11px] hover:bg-white/20"
    >{done ? "✓ تم النسخ" : "نسخ"}</button>
  );
}

/** Vertical status timeline (A3). */
function Timeline({ p }: { p: any }) {
  const steps = [
    { key: "submitted", label: "تم الإرسال", at: p.createdAt, done: true },
    { key: "received", label: "تم الاستلام", at: p.createdAt, done: true },
    { key: "review", label: "قيد المراجعة", at: p.reviewStartedAt, done: !!p.reviewStartedAt || p.status === "approved" || p.status === "rejected" },
    p.status === "rejected"
      ? { key: "rejected", label: "مرفوض", at: p.decidedAt, done: true, bad: true }
      : { key: "approved", label: "معتمد", at: p.status === "approved" ? p.decidedAt : null, done: p.status === "approved" },
    { key: "activated", label: "تم التفعيل وشحن الرصيد", at: p.activatedAt, done: !!p.activatedAt },
  ].filter((s) => !(s.key === "activated" && p.status === "rejected"));
  return (
    <ol className="mt-2 space-y-1.5 border-r border-white/10 pe-3">
      {steps.map((s: any) => (
        <li key={s.key} className="flex items-center gap-2 text-xs">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.done ? (s.bad ? "bg-rose-400" : "bg-emerald-400") : "bg-white/20"}`} />
          <span className={s.done ? (s.bad ? "text-rose-300" : "text-slate-200") : "text-slate-500"}>{s.label}</span>
          {s.at && <span className="text-slate-500">— {fmt(s.at)}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function BillingClient({ plans, initialPlan, payableMethods, proofs: initialProofs }: { plans: any[]; initialPlan?: string; payableMethods: Method[]; proofs: any[] }) {
  const [plan, setPlan] = useState(
    initialPlan && plans.some((p) => p.slug === initialPlan) ? initialPlan : (plans[0]?.slug || ""),
  );
  const [methodKey, setMethodKey] = useState(payableMethods[0]?.key || "");
  const [accountId, setAccountId] = useState(payableMethods[0]?.accounts?.[0]?.id || "");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [proofs, setProofs] = useState<any[]>(initialProofs || []);
  const [retryFor, setRetryFor] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const { success, error } = useToast();

  const selectedPlan = plans.find((p) => p.slug === plan);
  const method = useMemo(() => payableMethods.find((m) => m.key === methodKey) || null, [payableMethods, methodKey]);
  const accounts = method?.accounts || [];
  const noPayments = payableMethods.length === 0;

  function pickMethod(k: string) {
    setMethodKey(k);
    const m = payableMethods.find((x) => x.key === k);
    setAccountId(m?.accounts?.[0]?.id || "");
  }

  async function submit() {
    if (!file) { error("ارفع صورة إيصال الدفع أولاً."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("methodKey", methodKey); fd.set("planSlug", plan); fd.set("amountUsd", String(selectedPlan?.price || 0));
      fd.set("accountId", accountId); fd.set("reference", reference); fd.set("image", file);
      const res = await fetch("/api/payments/proof", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (j?.ok) { success("🎉 تم إرسال طلب الدفع — يراجعه فريق المالية خلال ٢٤ ساعة."); setProofs((ps) => [j.proof, ...ps]); setReference(""); setFile(null); setFormKey((k) => k + 1); }
      else error(j?.message || j?.error || "تعذّر الإرسال.");
    } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/payments/proof/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    const j = await res.json().catch(() => null);
    if (j?.ok) { setProofs((ps) => ps.map((p) => (p.id === id ? { ...p, status: "canceled" } : p))); success("تم إلغاء الطلب."); }
  }

  async function resubmit(id: string) {
    if (!retryFile) { error("اختر صورة إيصال جديدة لإعادة الإرسال."); return; }
    const fd = new FormData(); fd.set("action", "resubmit"); fd.set("image", retryFile);
    const res = await fetch(`/api/payments/proof/${id}`, { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    if (j?.ok) { setProofs((ps) => ps.map((p) => (p.id === id ? { ...p, status: "pending", rejectionReason: "", reviewStartedAt: null, decidedAt: null } : p))); setRetryFor(null); setRetryFile(null); success("تمت إعادة الإرسال — طلبك قيد المراجعة من جديد."); }
    else error(j?.message || "تعذّرت إعادة الإرسال.");
  }

  if (noPayments) {
    return (
      <div className="max-w-2xl">
        <EmptyState
          size="lg"
          icon={<span>💳</span>}
          title="الدفع غير متاح مؤقتًا"
          description="لا توجد طريقة دفع مفعّلة حاليًا. يرجى المحاولة لاحقًا أو التواصل مع الدعم لإتمام اشتراكك."
          action={<Link href="/support" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-400">التواصل مع الدعم</Link>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* ---- Pay form ---- */}
      <div className="card p-5 space-y-3">
        <label className="block text-sm">الباقة
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-1 w-full bg-white/5 rounded px-2 py-1.5">
            {plans.map((p) => <option key={p.slug} value={p.slug}>{p.name} — ${p.price}/mo</option>)}
          </select>
        </label>

        <label className="block text-sm">طريقة الدفع
          <select value={methodKey} onChange={(e) => pickMethod(e.target.value)} className="mt-1 w-full bg-white/5 rounded px-2 py-1.5">
            {payableMethods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>

        {/* ---- A1: real receiving account(s) the customer pays to ---- */}
        {accounts.length > 0 && (
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2">
            <div className="text-xs font-semibold text-emerald-200">ادفع إلى الحساب التالي ثم ارفع الإيصال:</div>
            {accounts.map((a) => (
              <label key={a.id} className={`block rounded-lg p-2.5 cursor-pointer border ${accountId === a.id ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-start gap-2">
                  <input type="radio" name="acct" checked={accountId === a.id} onChange={() => setAccountId(a.id)} className="mt-1 accent-emerald-500" />
                  <div className="flex-1 text-xs space-y-0.5">
                    {a.accountHolder && <div><span className="text-slate-400">اسم صاحب الحساب:</span> <b className="text-slate-100">{a.accountHolder}</b></div>}
                    <div className="flex items-center"><span className="text-slate-400">المعرّف:</span> <b className="text-slate-100 font-mono ms-1" dir="ltr">{a.accountId || "—"}</b><CopyBtn value={a.accountId} /></div>
                    {(a.instructions || method?.instructions) && <div className="text-slate-400 whitespace-pre-wrap mt-1">{a.instructions || method?.instructions}</div>}
                    {a.note && <div className="text-slate-500 mt-0.5">{a.note}</div>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <input placeholder="رقم العملية / المرجع (اختياري)" value={reference} onChange={(e) => setReference(e.target.value)} className="w-full bg-white/5 rounded px-2 py-1.5 text-sm" />

        {/* ---- A2: premium drag-&-drop receipt upload ---- */}
        <div>
          <label className="block text-sm mb-1">صورة إيصال الدفع <span className="text-rose-300">*</span></label>
          <ImageDropzone key={formKey} onFile={setFile} />
        </div>

        <button disabled={busy || !plan || !methodKey || !file} onClick={submit} className="rounded bg-brand-500/15 text-brand-300 px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "جاري الإرسال..." : "إرسال طلب الدفع"}
        </button>
      </div>

      {/* ---- Trust block ---- */}
      <div className="card p-4 text-sm text-slate-400 space-y-1">
        <div className="font-semibold text-white mb-1">ماذا يحدث بعد الإرسال؟</div>
        <p>• يراجع طلبك <b className="text-slate-200">فريق المالية</b> يدويًا — المدة المتوقعة <b className="text-slate-200">خلال ٢٤ ساعة</b>.</p>
        <p>• تتبّع الحالة لحظة بلحظة في الجدول الزمني أدناه. يمكنك الإلغاء ما دام قيد المراجعة.</p>
        <p>• لو رُفض الطلب سترى السبب ويمكنك <b className="text-slate-200">إعادة رفع إيصال صحيح</b> فورًا. تحتاج مساعدة؟ <Link href="/support" className="text-brand-300 underline">مركز المساعدة</Link></p>
      </div>

      {/* ---- A3/A4: proofs with timeline + recovery ---- */}
      {proofs.length > 0 && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold">طلباتك وحالتها</h2>
          {proofs.map((p) => (
            <div key={p.id} className="rounded-lg border border-white/10 p-3">
              <div className="flex items-center justify-between text-sm">
                <div><b>${p.amountUsd}</b> · <span className="font-mono text-xs">{p.methodKey}</span> {p.planSlug ? `· ${p.planSlug}` : ""}</div>
                <span className={`rounded px-2 py-0.5 text-xs ${p.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : p.status === "rejected" ? "bg-rose-500/15 text-rose-300" : p.status === "canceled" ? "bg-white/5 text-slate-400" : "bg-amber-500/15 text-amber-300"}`}>{STATUS_AR[p.status] || p.status}</span>
              </div>
              {p.proofImagePath && <a href={`/api/payments/proof/${p.id}/image`} target="_blank" rel="noreferrer" className="text-xs text-brand-300 underline">عرض الإيصال المرفوع</a>}
              <Timeline p={p} />
              {p.reviewerName && (p.status === "approved" || p.status === "rejected") && <p className="mt-1 text-[11px] text-slate-500">المراجع: {p.reviewerName}</p>}

              {p.status === "rejected" && (
                <div className="mt-2 rounded-lg bg-rose-500/5 border border-rose-500/20 p-2.5 text-xs space-y-2">
                  <div><span className="text-rose-300 font-semibold">سبب الرفض:</span> {p.rejectionReason || "غير محدد — تواصل مع الدعم."}</div>
                  {retryFor === p.id ? (
                    <div className="space-y-1.5">
                      <ImageDropzone onFile={setRetryFile} compact hint="اسحب إيصالاً جديداً أو اضغط للاختيار" />
                      <div className="flex gap-2">
                        <button onClick={() => resubmit(p.id)} className="rounded bg-brand-500/15 text-brand-300 px-3 py-1">إعادة الإرسال</button>
                        <button onClick={() => { setRetryFor(null); setRetryFile(null); }} className="rounded bg-white/5 px-3 py-1">إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setRetryFor(p.id)} className="rounded bg-brand-500/15 text-brand-300 px-3 py-1">رفع إيصال جديد وإعادة المحاولة</button>
                  )}
                  <Link href="/support" className="block text-brand-300 underline">أو تواصل مع الدعم</Link>
                </div>
              )}

              {(p.status === "pending" || p.status === "under_review") && (
                <button onClick={() => cancel(p.id)} className="mt-2 text-xs text-rose-300 underline">إلغاء الطلب</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
