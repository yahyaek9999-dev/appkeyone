"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Coins, Wallet, Plus, Send, ListOrdered, Loader2, Check, X, RefreshCw,
  CheckCircle2, XCircle, Play, Square, Activity,
} from "lucide-react";

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

type Totals = {
  walletCount: number; totalBalance: number; totalPurchased: number; totalSpent: number;
  campaigns: number; sent: number; failed: number; pendingPurchases: number;
};
type QueueRow = {
  id: string; userId: string; user: { email: string; name: string | null } | null;
  type: string; refId: string; status: string; priority: number; attempts: number; error: string | null;
  position: number; queuedAt: string; startedAt: string | null; finishedAt: string | null;
};
type PurchaseItem = {
  id: string; credits: number; amountUsd: number; method: string; status: string; createdAt: string;
  note?: string | null; paymentRef?: string | null; user?: { email: string; name: string | null } | null;
};

const QUEUE_STATUS: Record<string, { l: string; c: string }> = {
  queued: { l: "في الطابور", c: "text-sky-300" },
  scheduled: { l: "مجدولة", c: "text-amber-300" },
  running: { l: "قيد التشغيل", c: "text-brand-300" },
  done: { l: "اكتملت", c: "text-emerald-300" },
  failed: { l: "فشلت", c: "text-rose-300" },
  canceled: { l: "ملغاة", c: "text-slate-400" },
};

export function AdminBroadcastCreditsClient() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});

  const loadOverview = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/broadcast-credits");
      const j = await r.json();
      if (j.ok) { setTotals(j.totals); setQueueCounts(j.queue || {}); }
    } catch {}
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  return (
    <div className="space-y-6">
      {/* Money / volume tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Wallet className="h-5 w-5 text-brand-300" />} label="إجمالي الأرصدة" value={(totals?.totalBalance ?? 0).toLocaleString()} sub={`${totals?.walletCount ?? 0} محفظة`} />
        <Tile icon={<Plus className="h-5 w-5 text-emerald-300" />} label="إجمالي المشترى" value={(totals?.totalPurchased ?? 0).toLocaleString()} />
        <Tile icon={<Send className="h-5 w-5 text-rose-300" />} label="إجمالي المنفق" value={(totals?.totalSpent ?? 0).toLocaleString()} />
        <Tile icon={<Coins className="h-5 w-5 text-amber-300" />} label="طلبات شراء معلّقة" value={(totals?.pendingPurchases ?? 0).toLocaleString()} tone={totals && totals.pendingPurchases > 0 ? "warn" : undefined} />
        <Tile icon={<Activity className="h-5 w-5 text-sky-300" />} label="حملات الرصيد" value={(totals?.campaigns ?? 0).toLocaleString()} />
        <Tile icon={<CheckCircle2 className="h-5 w-5 text-emerald-300" />} label="رسائل أُرسلت" value={(totals?.sent ?? 0).toLocaleString()} />
        <Tile icon={<XCircle className="h-5 w-5 text-rose-300" />} label="رسائل فشلت" value={(totals?.failed ?? 0).toLocaleString()} />
        <Tile icon={<ListOrdered className="h-5 w-5 text-sky-300" />} label="في الطابور الآن" value={((queueCounts.queued || 0) + (queueCounts.running || 0)).toLocaleString()} />
      </div>

      {/* Monitoring — counts by status */}
      <MonitoringCard counts={queueCounts} />

      {/* Queue control */}
      <QueueControlCard onMutated={loadOverview} />

      {/* Credit control */}
      <CreditControlCard onMutated={loadOverview} />

      {/* Purchase approvals */}
      <PurchaseQueueCard pending={totals?.pendingPurchases ?? 0} onMutated={loadOverview} />
    </div>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "warn" }) {
  const border = tone === "warn" ? "border-amber-500/30" : "border-white/5";
  return (
    <div className={`card p-4 border ${border}`}>
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Monitoring (counts by status) ───────────────────────────────────────────────
function MonitoringCard({ counts }: { counts: Record<string, number> }) {
  const order = ["queued", "scheduled", "running", "done", "failed", "canceled"];
  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-brand-300" /> مراقبة الطابور</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {order.map((s) => {
          const st = QUEUE_STATUS[s];
          return (
            <div key={s} className="rounded-xl bg-white/[0.03] p-3 text-center">
              <div className={`text-2xl font-extrabold ${st.c}`}>{(counts[s] || 0).toLocaleString()}</div>
              <div className="text-[11px] text-slate-500 mt-1">{st.l}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Queue control (force stop/start) ────────────────────────────────────────────
function QueueControlCard({ onMutated }: { onMutated: () => void }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/broadcast-credits/queue");
      const j = await r.json();
      if (j.ok) setRows(j.items || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(jobId: string, action: "force_stop" | "force_start") {
    setBusy(jobId + action);
    try {
      const r = await fetch("/api/admin/broadcast-credits/queue", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, jobId }),
      });
      const j = await r.json();
      if (j.ok) { load(); onMutated(); }
    } catch {} finally { setBusy(null); }
  }

  const active = rows.filter((r) => ["queued", "scheduled", "running"].includes(r.status));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg flex items-center gap-2"><ListOrdered className="h-4 w-4 text-sky-300" /> التحكم في الطابور</h2>
        <button onClick={load} disabled={loading} className="btn-outline px-2.5 py-1 text-xs disabled:opacity-40">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} تحديث
        </button>
      </div>
      {active.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد مهام نشطة في الطابور.</div>
      ) : (
        <div className="space-y-2">
          {active.map((r) => {
            const st = QUEUE_STATUS[r.status] || { l: r.status, c: "text-slate-300" };
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] p-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-3">
                  {r.status === "queued" && r.position > 0 && (
                    <span className="inline-flex h-7 min-w-7 px-2 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300 text-xs font-bold">#{r.position}</span>
                  )}
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${st.c}`}>{st.l} <span className="text-[10px] text-slate-500">· {r.type}</span></div>
                    <div className="text-[11px] text-slate-500 font-mono truncate max-w-[220px]">{r.user?.email || r.userId}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.status === "queued" && (
                    <button disabled={busy === r.id + "force_start"} onClick={() => act(r.id, "force_start")} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40">
                      {busy === r.id + "force_start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} تشغيل فوري
                    </button>
                  )}
                  <button disabled={busy === r.id + "force_stop"} onClick={() => act(r.id, "force_stop")} className="btn-danger px-3 py-1.5 text-xs disabled:opacity-40">
                    {busy === r.id + "force_stop" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} إيقاف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Credit control (per-tenant grant/deduct) ─────────────────────────────────────
function CreditControlCard({ onMutated }: { onMutated: () => void }) {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(action: "grant" | "deduct") {
    setMsg(null);
    const uid = userId.trim();
    const amt = parseInt(amount, 10);
    if (!uid) { setMsg({ ok: false, text: "أدخل مُعرّف المستخدم (userId)" }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setMsg({ ok: false, text: "أدخل مقدار رصيد صحيحًا" }); return; }
    setBusy(action);
    try {
      const r = await fetch(`/api/admin/broadcast-credits/${encodeURIComponent(uid)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, amount: amt, reason }),
      });
      const j = await r.json();
      if (j.ok) { setMsg({ ok: true, text: `تم — الرصيد بعدها: ${(j.balanceAfter ?? 0).toLocaleString()}` }); setAmount(""); onMutated(); }
      else setMsg({ ok: false, text: j.error === "insufficient_credits" ? `رصيد غير كافٍ (نقص ${j.shortfall || 0})` : (j.detail || j.error || "فشل") });
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(null); }
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><Coins className="h-4 w-4 text-amber-300" /> التحكم في الرصيد</h2>
      <p className="text-xs text-slate-500 mb-4">منح أو خصم رصيد حملات لتاجر بعينه. يُسجَّل في سجل التدقيق.</p>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">مُعرّف المستخدم (userId)</label>
            <input className={inputCls + " font-mono"} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="cuid…" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">المقدار (رصيد)</label>
            <input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">السبب (يُسجَّل)</label>
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تسوية / هدية / استرداد" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy} onClick={() => act("grant")} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">
            {busy === "grant" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} منح رصيد
          </button>
          <button disabled={!!busy} onClick={() => act("deduct")} className="btn-danger px-3 py-1.5 text-xs disabled:opacity-40">
            {busy === "deduct" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} خصم رصيد
          </button>
        </div>
        {msg && <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}</div>}
      </div>
    </div>
  );
}

// ── Purchase approvals ────────────────────────────────────────────────────────
function PurchaseQueueCard({ pending, onMutated }: { pending: number; onMutated: () => void }) {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/broadcast-credits/purchases?status=${status}`);
      const j = await r.json();
      if (j.ok) setItems(j.items || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(tab); }, [tab, load]);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/broadcast-credits/purchases/${id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (j.ok) { load(tab); onMutated(); }
    } catch {} finally { setBusy(null); }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-bold text-lg">طلبات شراء الرصيد {pending > 0 && <span className="ml-1 rounded-full bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5">{pending} جديد</span>}</h2>
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
                <div className="font-semibold">{it.credits.toLocaleString()} رصيد {it.amountUsd > 0 && <span className="text-xs text-slate-500">· {it.amountUsd}$</span>} <span className="text-xs text-slate-500">· {it.method}</span></div>
                <div className="text-[11px] text-slate-500 font-mono truncate">{it.user?.email || it.user?.name || "—"}</div>
                {it.note && <div className="text-[11px] text-slate-400">📝 {it.note}</div>}
              </div>
              <div className="text-[11px] text-slate-500">{new Date(it.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</div>
              {it.status === "pending" ? (
                <div className="flex gap-2">
                  <button disabled={busy === it.id} onClick={() => decide(it.id, "approve")} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">{busy === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} قبول ومنح</button>
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
