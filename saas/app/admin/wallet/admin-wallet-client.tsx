"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatUsd, formatUsdPrecise } from "@/lib/wallet/money";
import { Loader2, Search, Check, X, Settings2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

type TenantRow = {
  userId: string; email: string; name: string | null;
  balanceUsd: number; status: string; totalToppedUpUsd: number; totalSpentUsd: number;
  conversations: number; messages: number; metaCharged: number; metaCost: number; profit: number;
};

// ── Per-tenant wallet table + management ──────────────────────────────────────
export function TenantTable({ rows }: { rows: TenantRow[] }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const filtered = q
    ? rows.filter((r) => (r.email + " " + (r.name || "")).toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-bold text-lg">المحافظ حسب التاجر</h2>
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input className={inputCls + " pr-8 w-56"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالبريد أو الاسم" />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد محافظ مطابقة.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">التاجر</th>
                <th className="text-right p-2">الرصيد</th>
                <th className="text-right p-2">الحالة</th>
                <th className="text-right p-2">شحن</th>
                <th className="text-right p-2">إنفاق</th>
                <th className="text-right p-2">محادثات Meta</th>
                <th className="text-right p-2">محتسب</th>
                <th className="text-right p-2">الربح</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <FragmentRow key={r.userId} r={r} open={openId === r.userId} onToggle={() => setOpenId(openId === r.userId ? null : r.userId)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ r, open, onToggle }: { r: TenantRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-white/5">
        <td className="p-2">
          <div className="font-semibold truncate max-w-[180px]">{r.name || "—"}</div>
          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{r.email}</div>
        </td>
        <td className="p-2 font-bold">{formatUsd(r.balanceUsd)}</td>
        <td className="p-2"><span className={r.status === "active" ? "text-emerald-300" : r.status === "suspended" ? "text-rose-300" : "text-slate-500"}>{r.status === "active" ? "نشطة" : r.status === "suspended" ? "موقوفة" : "—"}</span></td>
        <td className="p-2 text-slate-300">{formatUsd(r.totalToppedUpUsd)}</td>
        <td className="p-2 text-slate-300">{formatUsd(r.totalSpentUsd)}</td>
        <td className="p-2">{r.conversations.toLocaleString()}</td>
        <td className="p-2 text-amber-300">{formatUsdPrecise(r.metaCharged)}</td>
        <td className={"p-2 " + (r.profit >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatUsdPrecise(r.profit)}</td>
        <td className="p-2">
          <button onClick={onToggle} className="btn-outline px-2 py-1 text-xs"><Settings2 className="h-3.5 w-3.5" /> إدارة</button>
        </td>
      </tr>
      {open && (
        <tr className="bg-white/[0.02]">
          <td colSpan={9} className="p-4"><ManagePanel r={r} /></td>
        </tr>
      )}
    </>
  );
}

function ManagePanel({ r }: { r: TenantRow }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null);
    try {
      const r2 = await fetch(`/api/admin/wallet/${r.userId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason, ...extra }),
      });
      const j = await r2.json();
      if (j.ok) { setMsg({ ok: true, text: "تم التنفيذ" }); setAmount(""); router.refresh(); }
      else setMsg({ ok: false, text: j.error === "insufficient_funds" ? `رصيد غير كافٍ (نقص ${formatUsd(j.shortfall || 0)})` : (j.detail || j.error || "فشل") });
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(null); }
  }

  const amt = () => parseFloat(amount) || 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">المبلغ (USD)</label>
          <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">السبب (يُسجَّل في سجل التدقيق)</label>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تسوية / شحن يدوي / استرداد" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy || amt() <= 0} onClick={() => act("credit", { amountUsd: amt() })} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">
          {busy === "credit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} إضافة رصيد
        </button>
        <button disabled={!!busy || amt() <= 0} onClick={() => act("debit", { amountUsd: amt() })} className="btn-danger px-3 py-1.5 text-xs disabled:opacity-40">
          {busy === "debit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} خصم رصيد
        </button>
        {r.status === "active" ? (
          <button disabled={!!busy} onClick={() => act("set_status", { status: "suspended" })} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40">إيقاف المحفظة</button>
        ) : (
          <button disabled={!!busy} onClick={() => act("set_status", { status: "active" })} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40">تفعيل المحفظة</button>
        )}
        <button disabled={!!busy} onClick={() => act("retry_billing")} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">
          <RefreshCw className="h-3.5 w-3.5" /> إعادة محاولة التحصيل
        </button>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 max-w-[200px]">
          <label className="block text-xs text-slate-400 mb-1">حد التنبيه للرصيد المنخفض (USD)</label>
          <input className={inputCls} inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="5" />
        </div>
        <button disabled={!!busy || !threshold} onClick={() => act("set_threshold", { thresholdUsd: parseFloat(threshold) || 0 })} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40">حفظ الحد</button>
      </div>
      {msg && <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}</div>}
    </div>
  );
}

// ── Top-up review queue ───────────────────────────────────────────────────────
type TopupItem = { id: string; amountUsd: number; method: string; status: string; createdAt: string; note?: string | null; paymentRef?: string | null; user?: { email: string; name: string | null } | null };

export function TopupQueue({ pending }: { pending: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [items, setItems] = useState<TopupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/wallet/topups?status=${status}`);
      const j = await r.json();
      if (j.ok) setItems(j.items || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(tab); }, [tab, load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/wallet/topups/${id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (j.ok) { load(tab); router.refresh(); }
    } catch {} finally { setBusy(null); }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-bold text-lg">طلبات شحن المحفظة {pending > 0 && <span className="ml-1 rounded-full bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5">{pending} جديد</span>}</h2>
        <div className="flex gap-1">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button key={s} onClick={() => setTab(s)} className={"px-2.5 py-1 rounded-lg text-xs border " + (tab === s ? "bg-brand-500/20 border-brand-400/40 text-white" : "border-white/10 text-slate-400")}>
              {s === "pending" ? "قيد المراجعة" : s === "approved" ? "مقبول" : s === "rejected" ? "مرفوض" : "الكل"}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : items.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد طلبات.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold">{formatUsd(it.amountUsd)} <span className="text-xs text-slate-500">· {it.method}</span></div>
                <div className="text-[11px] text-slate-500 font-mono truncate">{it.user?.email || "—"}</div>
                {it.note && <div className="text-[11px] text-slate-400">📝 {it.note}</div>}
              </div>
              <div className="text-[11px] text-slate-500">{new Date(it.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</div>
              {it.status === "pending" ? (
                <div className="flex gap-2">
                  <button disabled={busy === it.id} onClick={() => decide(it.id, "approve")} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">{busy === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} قبول وشحن</button>
                  <button disabled={busy === it.id} onClick={() => decide(it.id, "reject")} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40"><X className="h-3.5 w-3.5" /> رفض</button>
                </div>
              ) : (
                <span className={"text-xs " + (it.status === "approved" ? "text-emerald-300" : "text-rose-300")}>{it.status === "approved" ? "مقبول" : "مرفوض"}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Meta rate-card editor ─────────────────────────────────────────────────────
type RateRow = { id: string; country: string; category: string; rateUsd: number; metaCostUsd: number; active: boolean };
const CAT_LABEL: Record<string, string> = { marketing: "تسويقية", utility: "خدمية", authentication: "مصادقة", service: "محادثة" };

export function RateCardEditor() {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/meta-rates");
      const j = await r.json();
      if (j.ok) setRows(j.items || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function setField(id: string, field: keyof RateRow, value: any) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function save(row: RateRow) {
    setSavingKey(row.id);
    try {
      await fetch("/api/admin/meta-rates", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ country: row.country, category: row.category, rateUsd: Number(row.rateUsd), metaCostUsd: Number(row.metaCostUsd), active: row.active }),
      });
    } catch {} finally { setSavingKey(null); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg mb-1">قائمة أسعار Meta</h2>
      <p className="text-xs text-slate-500 mb-4">السعر = ما يُحتسب على التاجر لكل محادثة · التكلفة = ما تدفعه KEYONE لـ Meta. الدولة <code className="font-mono">*</code> هي الافتراضي.</p>
      {loading ? (
        <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">الدولة</th>
                <th className="text-right p-2">الفئة</th>
                <th className="text-right p-2">السعر (USD)</th>
                <th className="text-right p-2">تكلفة Meta (USD)</th>
                <th className="text-right p-2">مفعّل</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-2 font-mono">{r.country}</td>
                  <td className="p-2">{CAT_LABEL[r.category] || r.category}</td>
                  <td className="p-2"><input className={inputCls + " w-24"} inputMode="decimal" value={r.rateUsd} onChange={(e) => setField(r.id, "rateUsd", e.target.value)} /></td>
                  <td className="p-2"><input className={inputCls + " w-24"} inputMode="decimal" value={r.metaCostUsd} onChange={(e) => setField(r.id, "metaCostUsd", e.target.value)} /></td>
                  <td className="p-2"><input type="checkbox" checked={r.active} onChange={(e) => setField(r.id, "active", e.target.checked)} className="h-4 w-4 accent-brand-500" /></td>
                  <td className="p-2"><button onClick={() => save(r)} disabled={savingKey === r.id} className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40">{savingKey === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "حفظ"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
