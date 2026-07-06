"use client";

/**
 * Admin API-keys client — table of ALL keys across tenants + abuse-detection
 * panel + per-key revoke. Data from /api/admin/api-keys; revoke POSTs to
 * /api/admin/api-keys/:id { action: "revoke" }.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Ban, ShieldAlert, KeyRound, AlertTriangle } from "lucide-react";

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

type AbuseInline = { requests: number; errors: number; errorRatePct: number; reasons: string[] };
type KeyRow = {
  id: string; name: string; keyPrefix: string; scopes: string; scopesList: string[];
  status: string; rateLimitPerMin: number; lastUsedAt: string | null; createdAt: string;
  userId: string; userEmail: string | null; userName: string | null; abuse: AbuseInline | null;
};
type AbuseRow = { apiKeyId: string; userId: string; requests: number; errors: number; errorRatePct: number; reasons: string[] };

const REASON_LABEL: Record<string, string> = { high_volume: "حجم مرتفع", high_error_rate: "نسبة أخطاء مرتفعة" };

export default function AdminApiKeysClient() {
  const [items, setItems] = useState<KeyRow[]>([]);
  const [abuse, setAbuse] = useState<AbuseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/api-keys");
      const j = await r.json();
      if (j.ok) { setItems(j.items || []); setAbuse(j.abuse || []); }
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function revoke(k: KeyRow) {
    if (!confirm(`إلغاء مفتاح "${k.name}" للتاجر ${k.userEmail || k.userId}؟ لا يمكن التراجع.`)) return;
    setBusyId(k.id);
    try {
      const r = await fetch(`/api/admin/api-keys/${k.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const j = await r.json();
      if (j.ok) load();
    } catch {} finally { setBusyId(null); }
  }

  const filtered = q
    ? items.filter((r) => (`${r.userEmail || ""} ${r.userName || ""} ${r.name} ${r.keyPrefix}`).toLowerCase().includes(q.toLowerCase()))
    : items;

  const emailByKey = new Map(items.map((i) => [i.id, i.userEmail || i.userId]));

  return (
    <div className="space-y-6">
      {/* Abuse detection panel */}
      <div className="card p-5">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-1"><ShieldAlert className="h-4 w-4 text-rose-300" /> كشف إساءة الاستخدام — آخر 24 ساعة</h2>
        <p className="text-xs text-slate-500 mb-4">مفاتيح ذات حجم طلبات مرتفع أو نسبة أخطاء مرتفعة. راجعها وألغِ المشبوه منها.</p>
        {loading ? (
          <div className="py-6 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : abuse.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">لا توجد مفاتيح مشبوهة حاليًا.</div>
        ) : (
          <div className="space-y-2">
            {abuse.map((a) => (
              <div key={a.apiKeyId} className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-slate-300 truncate">{emailByKey.get(a.apiKeyId) || a.userId}</div>
                  <div className="text-[11px] text-slate-500">key: {a.apiKeyId.slice(0, 10)}…</div>
                </div>
                <div className="text-xs text-slate-400">{a.requests.toLocaleString()} طلب · {a.errors} خطأ · {a.errorRatePct}%</div>
                <div className="flex gap-1 flex-wrap">
                  {a.reasons.map((rs) => (
                    <span key={rs} className="rounded-full bg-rose-500/15 text-rose-300 text-[10px] px-2 py-0.5 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {REASON_LABEL[rs] || rs}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All keys table */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-bold text-lg flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-300" /> كل المفاتيح</h2>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input className={inputCls + " pr-8 w-64"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالبريد أو الاسم أو البادئة" />
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">لا توجد مفاتيح مطابقة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-right p-2">التاجر</th>
                  <th className="text-right p-2">الاسم</th>
                  <th className="text-right p-2">البادئة</th>
                  <th className="text-right p-2">الحالة</th>
                  <th className="text-right p-2">حد المعدّل</th>
                  <th className="text-right p-2">آخر استخدام</th>
                  <th className="text-right p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((k) => (
                  <tr key={k.id} className={"border-t border-white/5 " + (k.abuse ? "bg-rose-500/[0.04]" : "")}>
                    <td className="p-2">
                      <div className="font-semibold truncate max-w-[160px]">{k.userName || "—"}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[160px]">{k.userEmail || k.userId}</div>
                    </td>
                    <td className="p-2">
                      {k.name}
                      {k.abuse && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] px-1.5 py-0.5"><AlertTriangle className="h-2.5 w-2.5" /> مشبوه</span>}
                    </td>
                    <td className="p-2 font-mono text-xs text-slate-400">{k.keyPrefix}</td>
                    <td className="p-2"><span className={k.status === "active" ? "text-emerald-300" : "text-rose-300"}>{k.status === "active" ? "نشط" : "ملغي"}</span></td>
                    <td className="p-2 whitespace-nowrap">{k.rateLimitPerMin}/د</td>
                    <td className="p-2 text-slate-500 whitespace-nowrap text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    <td className="p-2">
                      {k.status === "active" && (
                        <button disabled={busyId === k.id} onClick={() => revoke(k)} className="btn-danger px-2.5 py-1 text-xs disabled:opacity-40">
                          {busyId === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
