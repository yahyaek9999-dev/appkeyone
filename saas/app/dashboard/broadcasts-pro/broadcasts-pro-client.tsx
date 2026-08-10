"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Coins, Plus, Send, ListOrdered, History, BarChart3, Loader2,
  CheckCircle2, XCircle, RefreshCw, Megaphone, Users, AlertTriangle,
} from "lucide-react";

// ── Shared types ──────────────────────────────────────────────────────────────
type WalletSummary = { balance: number; totalPurchased: number; totalSpent: number };
type LedgerRow = { id: string; direction: string; kind: string; amount: number; balanceAfter: number; reason: string; createdAt: string };
type PurchaseReq = { id: string; credits: number; amountUsd: number; method: string; status: string; createdAt: string; note?: string | null };
type CampaignRow = {
  id: string; title: string; audience: string; status: string; total: number; sent: number; failed: number;
  creditsReserved: number; createdAt: string;
  job: { id: string; status: string; position: number; attempts: number; error: string | null } | null;
};
type QueueRow = { id: string; type: string; refId: string; status: string; position: number; attempts: number; error: string | null; queuedAt: string };
type Analytics = { campaigns: number; recipients: number; sent: number; failed: number; creditsSpent: number; creditsRefunded: number };

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

const METHODS: Array<{ v: string; l: string }> = [
  { v: "instapay", l: "إنستاباي" },
  { v: "vodafone_cash", l: "فودافون كاش" },
  { v: "bank", l: "تحويل بنكي" },
  { v: "card", l: "بطاقة" },
  { v: "manual", l: "أخرى" },
];

// Audience options mirror the existing broadcasts UI exactly.
const AUDIENCES: Array<{ v: string; l: string }> = [
  { v: "all", l: "كل العملاء" },
  { v: "hot", l: "العملاء الساخنون (70+)" },
  { v: "warm", l: "العملاء الدافئون (40-69)" },
  { v: "buyers", l: "عملاء اشتروا من قبل" },
  { v: "no_purchase", l: "عملاء بدون شراء" },
  { v: "inactive", l: "عملاء غير نشطين" },
  { v: "abandoned", l: "عربات متروكة (تردد عالي)" },
  { v: "date_range", l: "حسب تاريخ التسجيل" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة", approved: "تمت الموافقة", rejected: "مرفوض", canceled: "ملغي",
};
const KIND_LABEL: Record<string, string> = {
  purchase: "شراء رصيد", campaign: "حملة", refund: "استرداد", adjustment: "تعديل إداري", reversal: "عكس عملية",
};
const CAMPAIGN_STATUS: Record<string, { l: string; c: string }> = {
  credit_queued: { l: "بانتظار الطابور", c: "text-amber-300" },
  queued: { l: "في الطابور", c: "text-sky-300" },
  sending: { l: "جاري الإرسال", c: "text-brand-300" },
  done: { l: "اكتملت", c: "text-emerald-300" },
  canceled: { l: "ملغاة", c: "text-slate-400" },
};
const JOB_STATUS: Record<string, { l: string; c: string }> = {
  queued: { l: "في الطابور", c: "text-sky-300" },
  scheduled: { l: "مجدولة", c: "text-amber-300" },
  running: { l: "قيد التشغيل", c: "text-brand-300" },
  done: { l: "اكتملت", c: "text-emerald-300" },
  failed: { l: "فشلت", c: "text-rose-300" },
  canceled: { l: "ملغاة", c: "text-slate-400" },
};

export default function BroadcastsProClient() {
  const [wallet, setWallet] = useState<WalletSummary>({ balance: 0, totalPurchased: 0, totalSpent: 0 });
  const [walletLoadFailed, setWalletLoadFailed] = useState(false);
  const [perRecipient, setPerRecipient] = useState(1);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const loadWallet = useCallback(async () => {
    try {
      const r = await fetch("/api/broadcast-credits");
      const j = await r.json();
      if (j.ok) {
        setWallet(j.wallet);
        setPerRecipient(j.perRecipient || 1);
        setLedger(j.ledger || []);
        setWalletLoadFailed(false);
      } else {
        setWalletLoadFailed(true);
      }
    } catch {
      setWalletLoadFailed(true);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    try {
      const r = await fetch("/api/broadcast-credits/analytics");
      const j = await r.json();
      if (j.ok) setAnalytics(j.totals);
    } catch {}
  }, []);

  useEffect(() => { loadWallet(); loadAnalytics(); }, [loadWallet, loadAnalytics]);

  const refreshAll = useCallback(() => { loadWallet(); loadAnalytics(); }, [loadWallet, loadAnalytics]);

  return (
    <div className="space-y-6">
      {/* Balance hero + analytics tiles */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="card p-6 lg:col-span-2 border border-brand-500/30 bg-brand-500/[0.06]">
          <div className="flex items-center gap-2 text-slate-300 text-sm mb-2"><Coins className="h-4 w-4" /> رصيد الحملات الحالي</div>
          {walletLoadFailed ? (
            <div className="flex items-center gap-2 text-rose-300 text-sm">
              <AlertTriangle className="h-4 w-4" /> تعذّر تحميل الرصيد
              <button onClick={loadWallet} className="text-xs underline text-slate-300 hover:text-white">إعادة المحاولة</button>
            </div>
          ) : (
            <div className="text-4xl font-extrabold text-white">{wallet.balance.toLocaleString()}<span className="text-lg text-slate-400 font-normal mr-2">رصيد</span></div>
          )}
          <div className="mt-2 text-xs text-slate-400">التكلفة: {perRecipient} رصيد لكل مستلِم</div>
        </div>
        <Tile icon={<Plus className="h-5 w-5 text-emerald-300" />} label="إجمالي المشترى" value={wallet.totalPurchased.toLocaleString()} />
        <Tile icon={<Send className="h-5 w-5 text-rose-300" />} label="إجمالي المنفق" value={wallet.totalSpent.toLocaleString()} />
      </div>

      {analytics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile small icon={<BarChart3 className="h-4 w-4 text-brand-300" />} label="الحملات" value={analytics.campaigns.toLocaleString()} />
          <Tile small icon={<Users className="h-4 w-4 text-sky-300" />} label="المستلمون" value={analytics.recipients.toLocaleString()} />
          <Tile small icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} label="أُرسلت" value={analytics.sent.toLocaleString()} />
          <Tile small icon={<XCircle className="h-4 w-4 text-rose-300" />} label="فشلت" value={analytics.failed.toLocaleString()} />
          <Tile small icon={<Coins className="h-4 w-4 text-amber-300" />} label="رصيد مُنفق" value={analytics.creditsSpent.toLocaleString()} />
          <Tile small icon={<RefreshCw className="h-4 w-4 text-slate-300" />} label="رصيد مُسترد" value={analytics.creditsRefunded.toLocaleString()} />
        </div>
      )}

      {/* Buy credits + Campaign creator */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BuyCreditsCard onChanged={refreshAll} />
        <CampaignCreatorCard balance={wallet.balance} perRecipient={perRecipient} onCreated={refreshAll} />
      </div>

      {/* Queue + History */}
      <QueueCard />
      <HistoryCard />

      {/* Ledger */}
      <LedgerCard rows={ledger} />
    </div>
  );
}

function Tile({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span className={small ? "text-xs" : ""}>{label}</span></div>
      <div className={small ? "text-xl font-extrabold" : "text-2xl font-extrabold"}>{value}</div>
    </div>
  );
}

// ── Buy credits (purchase request) ─────────────────────────────────────────────
function BuyCreditsCard({ onChanged }: { onChanged: () => void }) {
  const [credits, setCredits] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [method, setMethod] = useState("instapay");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [requests, setRequests] = useState<PurchaseReq[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/broadcast-credits/purchase");
      const j = await r.json();
      if (j.ok) setRequests(j.items || []);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const c = parseInt(credits, 10);
    if (!Number.isFinite(c) || c <= 0) { setMsg({ ok: false, text: "أدخل عدد رصيد صحيحًا" }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/broadcast-credits/purchase", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ credits: c, amountUsd: parseFloat(amountUsd) || 0, method, note }),
      });
      const j = await r.json();
      if (j.ok) { setMsg({ ok: true, text: "تم إرسال طلب الشراء. ستتم مراجعته من الإدارة." }); setCredits(""); setAmountUsd(""); setNote(""); load(); onChanged(); }
      else setMsg({ ok: false, text: j.detail || j.error || "تعذر إرسال الطلب" });
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><Plus className="h-4 w-4 text-emerald-300" /> شراء رصيد</h2>
      <p className="text-xs text-slate-500 mb-4">أرسل طلب شراء رصيد، وبعد تأكيد التحويل يُضاف الرصيد إلى محفظتك.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">عدد الرصيد</label>
            <input className={inputCls} inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="1000" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">المبلغ (USD) — اختياري</label>
            <input className={inputCls} inputMode="decimal" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="10" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">طريقة الدفع</label>
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m.v} value={m.v} className="bg-slate-900">{m.l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">ملاحظة / مرجع التحويل (اختياري)</label>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="رقم العملية أو ملاحظة" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إرسال طلب الشراء
        </button>
        {msg && (
          <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}
          </div>
        )}
      </form>

      {requests.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <div className="text-xs text-slate-400 mb-2">طلباتك الأخيرة</div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {requests.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold">{r.credits.toLocaleString()} رصيد</span>
                <span className="text-slate-500">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</span>
                <span className={r.status === "approved" ? "text-emerald-300" : r.status === "rejected" ? "text-rose-300" : "text-amber-300"}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Campaign creator ───────────────────────────────────────────────────────────
function CampaignCreatorCard({ balance, perRecipient, onCreated }: { balance: number; perRecipient: number; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("");
  const [audience, setAudience] = useState("all");
  const [inactiveDays, setInactiveDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!template.trim()) { setMsg({ ok: false, text: "نص الرسالة مطلوب" }); return; }
    setBusy(true);
    try {
      const payload: any = { title, template, audience };
      if (audience === "inactive") payload.inactiveDays = Number(inactiveDays) || 30;
      const r = await fetch("/api/broadcast-credits/campaigns", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg({ ok: true, text: `تم إنشاء الحملة. حُجز ${j.reserved} رصيد · ترتيبك في الطابور: ${j.queuePosition || "—"}` });
        setTitle(""); setTemplate("");
        onCreated();
      } else if (j.error === "insufficient_credits") {
        setMsg({ ok: false, text: `رصيد غير كافٍ — تحتاج ${j.required || 0} رصيد (نقص ${j.shortfall || 0}). اشترِ رصيدًا أولًا.` });
      } else {
        setMsg({ ok: false, text: j.detail || j.error || "تعذر إنشاء الحملة" });
      }
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(false); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><Megaphone className="h-4 w-4 text-brand-300" /> إنشاء حملة</h2>
      <p className="text-xs text-slate-500 mb-4">تدخل الحملة طابور جلسات QR. يُخصم {perRecipient} رصيد لكل مستلِم عند الإنشاء.</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">عنوان الحملة</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: عرض اليوم الوطني" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">الجمهور المستهدف</label>
          <select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => <option key={a.v} value={a.v} className="bg-slate-900">{a.l}</option>)}
          </select>
          {audience === "inactive" && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              غير نشط منذ
              <input type="number" min={1} value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm" />
              يوم
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">نص الرسالة</label>
          <textarea className={inputCls + " min-h-[96px] resize-y"} value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="اكتب نص الرسالة… يمكنك استخدام {name} لاسم العميل" />
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400 flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-amber-300" /> رصيدك الحالي: <b className="text-white mx-1">{balance.toLocaleString()}</b> · التكلفة {perRecipient} رصيد لكل مستلِم
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} إنشاء وإدخال الطابور
        </button>
        {msg && (
          <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}
          </div>
        )}
      </form>
    </div>
  );
}

// ── Queue status ────────────────────────────────────────────────────────────────
function QueueCard() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/broadcast-credits/queue");
      const j = await r.json();
      if (j.ok) setRows(j.items || []);
    } catch {} finally { setLoading(false); setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = rows.filter((r) => ["queued", "scheduled", "running"].includes(r.status));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg flex items-center gap-2"><ListOrdered className="h-4 w-4 text-sky-300" /> حالة الطابور</h2>
        <button onClick={load} disabled={loading} className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} تحديث
        </button>
      </div>
      {loaded && active.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد مهام نشطة في الطابور.</div>
      ) : (
        <div className="space-y-2">
          {active.map((r) => {
            const st = JOB_STATUS[r.status] || { l: r.status, c: "text-slate-300" };
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-3">
                  {r.status === "queued" && r.position > 0 && (
                    <span className="inline-flex h-7 min-w-7 px-2 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 text-xs font-bold">#{r.position}</span>
                  )}
                  <div>
                    <div className={`text-sm font-semibold ${st.c}`}>{st.l}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">{r.type} · {r.refId.slice(0, 10)}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">{new Date(r.queuedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Campaign history ──────────────────────────────────────────────────────────
function HistoryCard() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/broadcast-credits/campaigns");
      const j = await r.json();
      if (j.ok) setRows(j.items || []);
    } catch {} finally { setLoading(false); setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg flex items-center gap-2"><History className="h-4 w-4 text-slate-300" /> سجل الحملات</h2>
        <button onClick={load} disabled={loading} className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} تحديث
        </button>
      </div>
      {loaded && rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد حملات بعد. أنشئ حملتك الأولى.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">العنوان</th>
                <th className="text-right p-2">الحالة</th>
                <th className="text-right p-2">المستلمون</th>
                <th className="text-right p-2">أُرسلت</th>
                <th className="text-right p-2">فشلت</th>
                <th className="text-right p-2">رصيد محجوز</th>
                <th className="text-right p-2">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = CAMPAIGN_STATUS[r.status] || { l: r.status, c: "text-slate-300" };
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-2 font-semibold truncate max-w-[200px]">{r.title}</td>
                    <td className="p-2">
                      <span className={st.c}>{st.l}</span>
                      {r.job && r.job.status === "queued" && r.job.position > 0 && <span className="text-[10px] text-slate-500 mr-1">#{r.job.position}</span>}
                    </td>
                    <td className="p-2">{r.total.toLocaleString()}</td>
                    <td className="p-2 text-emerald-300">{r.sent.toLocaleString()}</td>
                    <td className="p-2 text-rose-300">{r.failed.toLocaleString()}</td>
                    <td className="p-2 text-amber-300">{r.creditsReserved.toLocaleString()}</td>
                    <td className="p-2 text-slate-400 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Credit ledger ───────────────────────────────────────────────────────────────
function LedgerCard({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><Coins className="h-4 w-4 text-slate-300" /> سجل الرصيد</h2>
      {rows.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد حركات رصيد بعد.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">النوع</th>
                <th className="text-right p-2">المقدار</th>
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
                    {r.direction === "credit" ? "+" : "−"}{r.amount.toLocaleString()}
                  </td>
                  <td className="p-2 text-slate-300 whitespace-nowrap">{r.balanceAfter.toLocaleString()}</td>
                  <td className="p-2 text-slate-500 text-xs truncate max-w-[200px]">{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
