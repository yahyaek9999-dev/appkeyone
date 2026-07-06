"use client";

import { useEffect, useState, useCallback } from "react";
import { formatUsd, formatUsdPrecise } from "@/lib/wallet/money";
import { Plus, Calculator, ReceiptText, Loader2, CheckCircle2, XCircle, CreditCard } from "lucide-react";

type TopupRequest = { id: string; amountUsd: number; method: string; status: string; createdAt: string; note?: string | null };
type PaymentProviderInfo = { id: "manual" | "paymob" | "stripe"; label: string; configured: boolean };
type LedgerRow = { id: string; direction: string; kind: string; amountUsd: number; balanceAfterUsd: number; reason: string; createdAt: string };
type CalcLine = { country: string; category: string; conversations: number; rateUsd: number; chargedUsd: number };

const METHODS: Array<{ v: string; l: string }> = [
  { v: "instapay", l: "إنستاباي" },
  { v: "vodafone_cash", l: "فودافون كاش" },
  { v: "bank", l: "تحويل بنكي" },
  { v: "card", l: "بطاقة" },
  { v: "manual", l: "أخرى" },
];

const CATEGORIES: Array<{ v: string; l: string }> = [
  { v: "marketing", l: "تسويقية" },
  { v: "utility", l: "خدمية" },
  { v: "authentication", l: "مصادقة" },
  { v: "service", l: "محادثة" },
];

const STATUS_LABEL: Record<string, string> = { pending: "قيد المراجعة", approved: "تمت الموافقة", rejected: "مرفوض", canceled: "ملغي" };
const KIND_LABEL: Record<string, string> = { topup: "شحن رصيد", meta_usage: "استهلاك Meta", broadcast: "بث جماعي", adjustment: "تعديل إداري", refund: "استرداد", reversal: "عكس عملية" };

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

type TAccount = { id: string; label: string; accountHolder: string; accountId: string; instructions: string; note: string };
type TMethod = { key: string; label: string; instructions: string; accounts: TAccount[] };

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className="ms-2 rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-white/20">{done ? "✓ تم النسخ" : "نسخ"}</button>
  );
}

export default function WalletClient({ initialThreshold, payableMethods = [] }: { initialThreshold: number; payableMethods?: TMethod[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TopupCard payableMethods={payableMethods} />
      <CalculatorCard />
      <div className="lg:col-span-2"><LedgerCard /></div>
    </div>
  );
}

function TopupCard({ payableMethods }: { payableMethods: TMethod[] }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(payableMethods[0]?.key || "");
  const [accountId, setAccountId] = useState(payableMethods[0]?.accounts?.[0]?.id || "");
  const [note, setNote] = useState("");
  const selMethod = payableMethods.find((m) => m.key === method) || null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [gateways, setGateways] = useState<PaymentProviderInfo[]>([]);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/wallet/topup");
      const j = await r.json();
      if (j.ok) setRequests(j.items || []);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/payments/providers");
        const j = await r.json();
        if (alive && j.ok && Array.isArray(j.providers)) setGateways(j.providers);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // Online payment via a configured gateway (Paymob / Stripe). Redirects to the
  // hosted checkout when the engine returns a URL; otherwise shows instructions.
  async function payNow(provider: "manual" | "paymob" | "stripe") {
    setMsg(null);
    setInstructions(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setMsg({ ok: false, text: "أدخل مبلغًا صحيحًا" }); return; }
    setPayBusy(provider);
    try {
      const r = await fetch("/api/wallet/topup/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: amt, provider }),
      });
      const j = await r.json();
      if (j.ok && j.checkoutUrl) { window.location.href = j.checkoutUrl; return; }
      if (j.ok && j.manualInstructions) { setInstructions(j.manualInstructions); load(); return; }
      if (j.ok) { setMsg({ ok: true, text: "تم إنشاء طلب الدفع." }); load(); return; }
      setMsg({ ok: false, text: j.error || "تعذر بدء الدفع" });
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setPayBusy(null); }
  }

  const payGateways = gateways.filter((g) => (g.id === "paymob" || g.id === "stripe") && g.configured);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setMsg({ ok: false, text: "أدخل مبلغًا صحيحًا" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/wallet/topup", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: amt, method, accountId, note }),
      });
      const j = await r.json();
      if (j.ok) { setMsg({ ok: true, text: "تم إرسال طلب الشحن. ستتم مراجعته من الإدارة." }); setAmount(""); setNote(""); load(); }
      else setMsg({ ok: false, text: j.detail || j.error || "تعذر إرسال الطلب" });
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><Plus className="h-4 w-4 text-emerald-300" /> شحن المحفظة</h2>
      <p className="text-xs text-slate-500 mb-4">أرسل طلب شحن، وبعد تأكيد التحويل تُضاف القيمة إلى رصيدك.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">المبلغ (USD)</label>
            <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">طريقة الدفع</label>
            <select className={inputCls} value={method} onChange={(e) => { setMethod(e.target.value); const m = payableMethods.find((x) => x.key === e.target.value); setAccountId(m?.accounts?.[0]?.id || ""); }}>
              {payableMethods.map((m) => <option key={m.key} value={m.key} className="bg-slate-900">{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Receiving account for the selected method — so the customer knows WHERE to send the money */}
        {payableMethods.length === 0 ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3 text-xs text-amber-200">
            لا توجد طريقة تحويل يدوي مفعّلة حاليًا. استخدم الدفع الإلكتروني بالأسفل (إن وُجد) أو تواصل مع الدعم.
          </div>
        ) : selMethod && selMethod.accounts.length > 0 ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3 space-y-2">
            <div className="text-xs text-slate-400">حوّل المبلغ إلى الحساب التالي ثم أرسل طلب الشحن:</div>
            {selMethod.accounts.map((a) => (
              <label key={a.id} className={`block rounded-lg p-2.5 cursor-pointer border text-xs ${accountId === a.id ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-start gap-2">
                  <input type="radio" name="wallet-acct" checked={accountId === a.id} onChange={() => setAccountId(a.id)} className="mt-1 accent-emerald-500" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {a.accountHolder && <div><span className="text-slate-400">اسم صاحب الحساب:</span> <b className="text-slate-100">{a.accountHolder}</b></div>}
                    <div className="flex items-center"><span className="text-slate-400">المعرّف:</span> <b className="text-slate-100 font-mono ms-1" dir="ltr">{a.accountId || "—"}</b><CopyBtn value={a.accountId} /></div>
                    {(a.instructions || selMethod.instructions) && <div className="text-slate-400 whitespace-pre-wrap mt-1">{a.instructions || selMethod.instructions}</div>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        ) : null}

        <div>
          <label className="block text-xs text-slate-400 mb-1">ملاحظة / مرجع التحويل (اختياري)</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="رقم العملية أو ملاحظة" />
        </div>
        <button type="submit" disabled={busy || payableMethods.length === 0} className="btn-primary w-full justify-center disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إرسال طلب الشحن
        </button>
        {msg && (
          <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}
          </div>
        )}
      </form>

      {payGateways.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <div className="text-xs text-slate-400 mb-2">أو ادفع الآن وأضف الرصيد فورًا</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {payGateways.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => payNow(g.id)}
                disabled={!!payBusy}
                className="btn-outline justify-center disabled:opacity-50"
              >
                {payBusy === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} ادفع الآن عبر {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {instructions && (
        <div className="mt-3 rounded-xl border border-brand-400/30 bg-brand-500/[0.06] p-3 text-sm text-slate-200 whitespace-pre-line">
          {instructions}
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <div className="text-xs text-slate-400 mb-2">طلباتك الأخيرة</div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {requests.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold">{formatUsd(r.amountUsd)}</span>
                <span className="text-slate-500">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</span>
                <span className={
                  r.status === "approved" ? "text-emerald-300" : r.status === "rejected" ? "text-rose-300" : "text-amber-300"
                }>{STATUS_LABEL[r.status] || r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalculatorCard() {
  const [country, setCountry] = useState("EG");
  const [category, setCategory] = useState("marketing");
  const [count, setCount] = useState("1000");
  const [result, setResult] = useState<{ lines: CalcLine[]; totalChargedUsd: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function calc(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/wallet/calculator", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: [{ country, category, conversations: parseInt(count, 10) || 0 }] }),
      });
      const j = await r.json();
      if (j.ok) setResult({ lines: j.lines, totalChargedUsd: j.totalChargedUsd });
    } catch {}
    finally { setBusy(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><Calculator className="h-4 w-4 text-brand-300" /> حاسبة التكلفة</h2>
      <p className="text-xs text-slate-500 mb-4">احسب التكلفة المتوقعة لعدد من محادثات Meta قبل الإرسال.</p>
      <form onSubmit={calc} className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">الدولة</label>
          <input className={inputCls} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder="EG" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">الفئة</label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.v} value={c.v} className="bg-slate-900">{c.l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">عدد المحادثات</label>
          <input className={inputCls} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder="1000" />
        </div>
        <button type="submit" disabled={busy} className="btn-outline col-span-3 justify-center disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} احسب
        </button>
      </form>
      {result && (
        <div className="mt-4 rounded-xl bg-white/5 p-4 text-center">
          <div className="text-xs text-slate-400">التكلفة التقديرية</div>
          <div className="text-3xl font-extrabold text-amber-300">{formatUsd(result.totalChargedUsd)}</div>
          {result.lines[0] && (
            <div className="text-xs text-slate-500 mt-1">
              {formatUsdPrecise(result.lines[0].rateUsd)} لكل محادثة × {result.lines[0].conversations.toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LedgerCard() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (next?: string) => {
    setLoading(true);
    try {
      const url = new URL("/api/wallet/ledger", window.location.origin);
      url.searchParams.set("take", "25");
      if (next) url.searchParams.set("cursor", next);
      const r = await fetch(url.toString());
      const j = await r.json();
      if (j.ok) {
        setRows((prev) => next ? [...prev, ...j.items] : j.items);
        setCursor(j.nextCursor);
      }
    } catch {}
    finally { setLoading(false); setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><ReceiptText className="h-4 w-4 text-slate-300" /> سجل المعاملات</h2>
      {loaded && rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد معاملات بعد. اشحن المحفظة للبدء.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">النوع</th>
                <th className="text-right p-2">المبلغ</th>
                <th className="text-right p-2">الرصيد بعدها</th>
                <th className="text-right p-2">السبب</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-2 text-slate-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-2">{KIND_LABEL[r.kind] || r.kind}</td>
                  <td className={`p-2 font-semibold whitespace-nowrap ${r.direction === "credit" ? "text-emerald-300" : "text-rose-300"}`}>
                    {r.direction === "credit" ? "+" : "−"}{formatUsdPrecise(r.amountUsd)}
                  </td>
                  <td className="p-2 text-slate-300 whitespace-nowrap">{formatUsd(r.balanceAfterUsd)}</td>
                  <td className="p-2 text-slate-500 text-xs truncate max-w-[200px]">{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button onClick={() => load(cursor)} disabled={loading} className="btn-outline mt-4 w-full justify-center disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} تحميل المزيد
        </button>
      )}
    </div>
  );
}
