"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, RefreshCw, Users, MessageSquare, DatabaseZap, Brain, Inbox,
  ScrollText, X, RotateCcw, ChevronDown, Search,
} from "lucide-react";

type ImportSession = {
  id: string; userId: string; status: string; qrJobId: string | null;
  contactsFound: number; contactsImported: number; conversationsImported: number;
  messagesImported: number; customersCreated: number; memoriesBuilt: number;
  error: string | null; requestedAt: string; completedAt: string | null;
  user: { id: string; email: string; name: string | null } | null;
};
type ImportLog = { id: string; level: string; message: string; createdAt: string };
type Totals = {
  sessions: number; completed: number; customersCreated: number;
  conversationsImported: number; messagesImported: number; contactsImported: number; memoriesBuilt: number;
};

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

const STATUS_LABEL: Record<string, string> = {
  requested: "مطلوب", queued: "في الطابور", scheduled: "مجدول", scanning: "مسح",
  importing: "استيراد", completed: "مكتمل", closed: "مغلق", failed: "فشل",
};
function statusTone(s: string): string {
  if (s === "completed" || s === "closed") return "text-emerald-300";
  if (s === "failed") return "text-rose-300";
  if (s === "scanning" || s === "importing") return "text-brand-200";
  return "text-amber-300";
}

export default function AdminImportClient() {
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [queue, setQueue] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/import", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) { setSessions(j.sessions || []); setQueue(j.queue || {}); setTotals(j.totals || null); }
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = q
    ? sessions.filter((s) => (`${s.user?.email || ""} ${s.user?.name || ""} ${s.userId}`).toLowerCase().includes(q.toLowerCase()))
    : sessions;

  const queueOrder = ["queued", "scheduled", "running", "done", "failed", "canceled"];
  const QUEUE_LABEL: Record<string, string> = {
    queued: "في الطابور", scheduled: "مجدول", running: "قيد التشغيل", done: "تم", failed: "فشل", canceled: "ملغي",
  };

  return (
    <div className="space-y-6">
      {/* ── Statistics ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile icon={<DatabaseZap className="h-5 w-5 text-brand-300" />} label="إجمالي العمليات" value={totals?.sessions ?? 0} />
        <Tile icon={<RefreshCw className="h-5 w-5 text-emerald-300" />} label="مكتملة" value={totals?.completed ?? 0} />
        <Tile icon={<Users className="h-5 w-5 text-sky-300" />} label="عملاء أُنشئوا" value={totals?.customersCreated ?? 0} />
        <Tile icon={<MessageSquare className="h-5 w-5 text-brand-300" />} label="محادثات" value={totals?.conversationsImported ?? 0} />
        <Tile icon={<Inbox className="h-5 w-5 text-slate-300" />} label="رسائل" value={totals?.messagesImported ?? 0} />
        <Tile icon={<Brain className="h-5 w-5 text-violet-300" />} label="ذاكرة مبنية" value={totals?.memoriesBuilt ?? 0} />
      </div>

      {/* ── Monitoring: QR import queue counts ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h2 className="font-bold text-lg">مراقبة طابور الاستيراد (QR)</h2>
          <button onClick={load} disabled={loading} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} تحديث
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {queueOrder.map((k) => (
            <div key={k} className="rounded-xl bg-white/[0.03] p-3 text-center">
              <div className="text-2xl font-extrabold text-white">{(queue[k] || 0).toLocaleString("ar-EG")}</div>
              <div className="text-[11px] text-slate-400 mt-1">{QUEUE_LABEL[k] || k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Import Queue: sessions table ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-bold text-lg">عمليات الاستيراد</h2>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input className={inputCls + " pr-8 w-56"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالبريد أو المعرّف" />
          </div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">لا توجد عمليات استيراد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-right p-2">التاجر</th>
                  <th className="text-right p-2">الحالة</th>
                  <th className="text-right p-2">جهات</th>
                  <th className="text-right p-2">محادثات</th>
                  <th className="text-right p-2">عملاء</th>
                  <th className="text-right p-2">ذاكرة</th>
                  <th className="text-right p-2">طُلب في</th>
                  <th className="text-right p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SessionRow key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ s, open, onToggle, onChanged }: { s: ImportSession; open: boolean; onToggle: () => void; onChanged: () => void }) {
  return (
    <>
      <tr className="border-t border-white/5">
        <td className="p-2">
          <div className="font-semibold truncate max-w-[180px]">{s.user?.name || "—"}</div>
          <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{s.user?.email || s.userId}</div>
        </td>
        <td className="p-2"><span className={statusTone(s.status)}>{STATUS_LABEL[s.status] || s.status}</span></td>
        <td className="p-2">{s.contactsImported.toLocaleString("ar-EG")}</td>
        <td className="p-2">{s.conversationsImported.toLocaleString("ar-EG")}</td>
        <td className="p-2 text-emerald-300">{s.customersCreated.toLocaleString("ar-EG")}</td>
        <td className="p-2 text-violet-300">{s.memoriesBuilt.toLocaleString("ar-EG")}</td>
        <td className="p-2 text-slate-500 whitespace-nowrap">{new Date(s.requestedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td>
        <td className="p-2">
          <button onClick={onToggle} className="btn-outline px-2 py-1 text-xs">
            <ScrollText className="h-3.5 w-3.5" /> السجل <ChevronDown className={"h-3 w-3 transition-transform " + (open ? "rotate-180" : "")} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-white/[0.02]">
          <td colSpan={8} className="p-4"><SessionDetail session={s} onChanged={onChanged} /></td>
        </tr>
      )}
    </>
  );
}

function SessionDetail({ session, onChanged }: { session: ImportSession; onChanged: () => void }) {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/import/${session.id}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setLogs(j.logs || []);
    } catch {} finally { setLoading(false); }
  }, [session.id]);
  useEffect(() => { load(); }, [load]);

  async function act(action: "retry" | "cancel") {
    setBusy(action); setMsg(null);
    try {
      const r = await fetch(`/api/admin/import/${session.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (j.ok) { setMsg({ ok: true, text: action === "retry" ? "تمت إعادة إدخال العملية في الطابور." : "تم إلغاء العملية." }); load(); onChanged(); }
      else setMsg({ ok: false, text: j.detail || j.error || "فشل التنفيذ" });
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(null); }
  }

  const canCancel = ["requested", "queued", "scheduled", "scanning", "importing"].includes(session.status);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => act("retry")} className="btn-outline px-3 py-1.5 text-xs disabled:opacity-40">
          {busy === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} إعادة المحاولة
        </button>
        <button disabled={!!busy || !canCancel} onClick={() => act("cancel")} className="btn-danger px-3 py-1.5 text-xs disabled:opacity-40">
          {busy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} إلغاء
        </button>
        {session.error && <span className="text-xs text-rose-300 self-center">خطأ: {session.error}</span>}
      </div>
      {msg && <div className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</div>}

      <div className="border-t border-white/5 pt-3">
        <div className="text-xs text-slate-400 mb-2">سجل العملية</div>
        {loading ? (
          <div className="py-4 text-center text-slate-500"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : logs.length === 0 ? (
          <div className="text-slate-500 text-xs py-4 text-center">لا توجد سجلات.</div>
        ) : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-2 text-xs">
                <span className={l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : "text-slate-500"}>•</span>
                <span className="text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="text-slate-300">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold">{(value || 0).toLocaleString("ar-EG")}</div>
    </div>
  );
}
