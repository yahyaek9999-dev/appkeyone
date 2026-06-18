"use client";

/**
 * Developer Center — interactive client.
 * Sections: (a) API Keys table + create/rotate/revoke, (b) Usage dashboard,
 * (c) Rate-limit display, (d) API documentation, (e) Webhook documentation.
 * All data comes from /api/developer/* (owner + plan gated).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyRound, Plus, RotateCw, Trash2, Loader2, Copy, Check, AlertTriangle,
  Activity, AlertCircle, Gauge, BookOpen, Webhook, ShieldCheck, X,
} from "lucide-react";

type ApiKey = {
  id: string; name: string; keyPrefix: string; scopes: string; scopesList: string[];
  status: string; rateLimitPerMin: number; lastUsedAt: string | null; expiresAt: string | null; createdAt: string;
};
type PerKey = { apiKeyId: string; requests: number; errors: number; errorRatePct: number };
type Series = { day: string; requests: number; errors: number };
type Usage = { days: number; totalRequests: number; totalErrors: number; errorRatePct: number; perKey: PerKey[]; series: Series[] };
type RecentReq = { id: string; method: string; path: string; status: number; latencyMs: number; createdAt: string };

const SCOPE_OPTIONS: Array<{ v: string; l: string }> = [
  { v: "read", l: "قراءة عامة (read)" },
  { v: "customers:read", l: "قراءة العملاء (customers:read)" },
  { v: "customers:write", l: "كتابة العملاء (customers:write)" },
  { v: "broadcasts:read", l: "قراءة الحملات (broadcasts:read)" },
];

const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none";

export default function DeveloperClient() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [recent, setRecent] = useState<RecentReq[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const r = await fetch("/api/developer/keys");
      const j = await r.json();
      if (j.ok) setKeys(j.keys || []);
    } catch {} finally { setLoadingKeys(false); }
  }, []);

  const loadUsage = useCallback(async () => {
    try {
      const r = await fetch("/api/developer/usage?days=30");
      const j = await r.json();
      if (j.ok) { setUsage(j.usage || null); setRecent(j.recent || []); }
    } catch {}
  }, []);

  useEffect(() => { loadKeys(); loadUsage(); }, [loadKeys, loadUsage]);

  const usageByKey = useMemo(() => {
    const m = new Map<string, PerKey>();
    (usage?.perKey || []).forEach((p) => m.set(p.apiKeyId, p));
    return m;
  }, [usage]);

  return (
    <div className="space-y-6">
      <UsageDashboard usage={usage} />
      <ApiKeysSection
        keys={keys} loading={loadingKeys} usageByKey={usageByKey}
        onCreate={() => setShowCreate(true)} reload={() => { loadKeys(); loadUsage(); }}
      />
      <RecentRequests recent={recent} />
      <ApiDocs />
      <WebhookDocs />

      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadKeys(); }} />
      )}
    </div>
  );
}

/* ── (b) Usage dashboard + (c) rate-limit summary tiles ─────────────────────── */
function UsageDashboard({ usage }: { usage: Usage | null }) {
  const maxReq = Math.max(1, ...(usage?.series || []).map((s) => s.requests));
  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-brand-300" /> لوحة الاستخدام — آخر {usage?.days ?? 30} يوم
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile icon={<Activity className="h-5 w-5 text-brand-300" />} label="إجمالي الطلبات" value={(usage?.totalRequests ?? 0).toLocaleString()} />
        <Tile icon={<AlertCircle className="h-5 w-5 text-rose-300" />} label="عدد الأخطاء" value={(usage?.totalErrors ?? 0).toLocaleString()} />
        <Tile icon={<Gauge className="h-5 w-5 text-amber-300" />} label="نسبة الأخطاء" value={`${usage?.errorRatePct ?? 0}%`} />
      </div>

      <div className="mt-5">
        <div className="text-xs text-slate-400 mb-2">الطلبات اليومية</div>
        {(!usage || usage.series.length === 0) ? (
          <div className="text-slate-500 text-sm py-6 text-center">لا توجد بيانات استخدام بعد. أنشئ مفتاحًا وابدأ باستدعاء الواجهة.</div>
        ) : (
          <div className="space-y-1.5">
            {usage.series.map((s) => (
              <div key={s.day} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-slate-500 font-mono">{s.day.slice(5)}</span>
                <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
                  <div className="h-full bg-brand-500/60" style={{ width: `${Math.round((s.requests / maxReq) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-left text-slate-400">
                  {s.requests.toLocaleString()}{s.errors > 0 && <span className="text-rose-300"> · {s.errors} خطأ</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── (a) API Keys table + (c) per-key rate limit ────────────────────────────── */
function ApiKeysSection({
  keys, loading, usageByKey, onCreate, reload,
}: {
  keys: ApiKey[]; loading: boolean; usageByKey: Map<string, PerKey>; onCreate: () => void; reload: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rotated, setRotated] = useState<{ name: string; plaintext: string } | null>(null);

  async function rotate(k: ApiKey) {
    if (!confirm(`تدوير المفتاح "${k.name}"؟ سيتوقف المفتاح الحالي فورًا ويصدر مفتاح جديد.`)) return;
    setBusyId(k.id);
    try {
      const r = await fetch(`/api/developer/keys/${k.id}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const j = await r.json();
      if (j.ok && j.plaintext) { setRotated({ name: k.name, plaintext: j.plaintext }); reload(); }
    } catch {} finally { setBusyId(null); }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`إلغاء المفتاح "${k.name}"؟ لا يمكن التراجع — أي تكامل يستخدمه سيتوقف.`)) return;
    setBusyId(k.id);
    try {
      const r = await fetch(`/api/developer/keys/${k.id}`, { method: "DELETE" });
      const j = await r.json();
      if (j.ok) reload();
    } catch {} finally { setBusyId(null); }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-bold text-lg flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-300" /> مفاتيح API</h2>
        <button onClick={onCreate} className="btn-primary px-3 py-1.5 text-sm"><Plus className="h-4 w-4" /> مفتاح جديد</button>
      </div>

      {rotated && (
        <PlaintextBox title={`مفتاح جديد بعد التدوير — "${rotated.name}"`} plaintext={rotated.plaintext} onClose={() => setRotated(null)} />
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : keys.length === 0 ? (
        <div className="text-slate-500 text-sm py-8 text-center">لا توجد مفاتيح بعد. أنشئ مفتاحك الأول للبدء.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">الاسم</th>
                <th className="text-right p-2">البادئة</th>
                <th className="text-right p-2">الصلاحيات</th>
                <th className="text-right p-2">حد المعدّل</th>
                <th className="text-right p-2">الطلبات (30ي)</th>
                <th className="text-right p-2">الحالة</th>
                <th className="text-right p-2">آخر استخدام</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const u = usageByKey.get(k.id);
                return (
                  <tr key={k.id} className="border-t border-white/5">
                    <td className="p-2 font-semibold">{k.name}</td>
                    <td className="p-2 font-mono text-xs text-slate-400">{k.keyPrefix}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {k.scopesList.map((s) => (
                          <span key={s} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">{k.rateLimitPerMin}/د</td>
                    <td className="p-2 text-slate-300">{(u?.requests ?? 0).toLocaleString()}{u && u.errors > 0 && <span className="text-rose-300 text-xs"> ({u.errorRatePct}%)</span>}</td>
                    <td className="p-2">
                      <span className={k.status === "active" ? "text-emerald-300" : "text-rose-300"}>
                        {k.status === "active" ? "نشط" : "ملغي"}
                      </span>
                    </td>
                    <td className="p-2 text-slate-500 whitespace-nowrap text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                    <td className="p-2">
                      {k.status === "active" && (
                        <div className="flex gap-1.5">
                          <button disabled={busyId === k.id} onClick={() => rotate(k)} className="btn-outline px-2 py-1 text-xs disabled:opacity-40" title="تدوير">
                            {busyId === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                          </button>
                          <button disabled={busyId === k.id} onClick={() => revoke(k)} className="btn-danger px-2 py-1 text-xs disabled:opacity-40" title="إلغاء">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
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

function RecentRequests({ recent }: { recent: RecentReq[] }) {
  if (!recent.length) return null;
  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><Activity className="h-4 w-4 text-slate-300" /> آخر الطلبات</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-white/5">
              <th className="text-right p-2">الوقت</th>
              <th className="text-right p-2">الطريقة</th>
              <th className="text-right p-2">المسار</th>
              <th className="text-right p-2">الحالة</th>
              <th className="text-right p-2">زمن (ms)</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="p-2 text-slate-400 whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="p-2 font-mono text-xs">{r.method}</td>
                <td className="p-2 font-mono text-xs text-slate-300 truncate max-w-[220px]">{r.path}</td>
                <td className={"p-2 font-semibold " + (r.status >= 400 ? "text-rose-300" : "text-emerald-300")}>{r.status}</td>
                <td className="p-2 text-slate-400">{r.latencyMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Create-key modal — shows plaintext ONCE ────────────────────────────────── */
function CreateKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [rateLimit, setRateLimit] = useState("60");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ plaintext: string; name: string } | null>(null);

  function toggleScope(v: string) {
    setScopes((prev) => prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (scopes.length === 0) { setErr("اختر صلاحية واحدة على الأقل"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/developer/keys", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name || undefined, scopes, rateLimitPerMin: parseInt(rateLimit, 10) || 60 }),
      });
      const j = await r.json();
      if (j.ok && j.plaintext) { setCreated({ plaintext: j.plaintext, name: j.key?.name || name || "مفتاح API" }); }
      else setErr(j.detail || j.error || "تعذر إنشاء المفتاح");
    } catch { setErr("خطأ في الشبكة"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-300" /> {created ? "تم إنشاء المفتاح" : "مفتاح API جديد"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {created ? (
          <div className="space-y-4">
            <PlaintextBox title={`مفتاحك السري — "${created.name}"`} plaintext={created.plaintext} />
            <button onClick={onCreated} className="btn-primary w-full justify-center">تم — حفظت المفتاح</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">اسم المفتاح (اختياري)</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="تكامل المتجر / تطبيق الجوال" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">الصلاحيات (Scopes)</label>
              <div className="space-y-2">
                {SCOPE_OPTIONS.map((s) => (
                  <label key={s.v} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={scopes.includes(s.v)} onChange={() => toggleScope(s.v)} className="h-4 w-4 accent-brand-500" />
                    <span>{s.l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">حد المعدّل (طلب / دقيقة)</label>
              <input className={inputCls} inputMode="numeric" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder="60" />
              <p className="text-[11px] text-slate-500 mt-1">من 1 إلى 6000 طلب لكل دقيقة لكل مفتاح.</p>
            </div>
            {err && <div className="text-sm text-rose-300 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {err}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} إنشاء المفتاح
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* The plaintext secret — shown ONCE, copyable, with a strong warning. */
function PlaintextBox({ title, plaintext, onClose }: { title: string; plaintext: string; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(plaintext); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-bold text-amber-200 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> {title}</div>
        {onClose && <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-black/40 p-2.5">
        <code className="flex-1 font-mono text-xs text-emerald-300 break-all">{plaintext}</code>
        <button onClick={copy} className="btn-outline px-2.5 py-1 text-xs shrink-0">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "نُسخ" : "نسخ"}
        </button>
      </div>
      <p className="text-[11px] text-amber-200/80 mt-2 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3 shrink-0" /> هذا هو العرض الوحيد للمفتاح. احفظه الآن في مكان آمن — لن نعرضه مرة أخرى.
      </p>
    </div>
  );
}

/* ── (d) API documentation ──────────────────────────────────────────────────── */
function ApiDocs() {
  return (
    <div className="card p-5">
      <h2 className="font-bold text-lg flex items-center gap-2 mb-4"><BookOpen className="h-4 w-4 text-brand-300" /> توثيق الواجهة البرمجية (REST API)</h2>

      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-semibold text-white mb-1">المصادقة</h3>
          <p className="text-slate-400">أرسل مفتاحك في ترويسة <code className="font-mono bg-white/5 px-1 rounded">Authorization</code>:</p>
          <Code>Authorization: Bearer ko_live_xxxxxxxxxxxxxxxxxxxx</Code>
          <p className="text-slate-500 text-xs mt-1">بديلًا، يمكنك استخدام ترويسة <code className="font-mono">x-api-key</code>. كل الطلبات يجب أن تكون عبر HTTPS.</p>
        </section>

        <Endpoint
          method="GET" path="/api/v1/me" scope="read"
          desc="يعيد هوية الحساب (userId) والباقة الحالية."
          response={`{
  "userId": "clx...",
  "plan": { "slug": "k_scale", "name": "...", "tier": "max" },
  "scopes": ["read"],
  "rateLimitPerMin": 60
}`}
        />

        <Endpoint
          method="GET" path="/api/v1/customers?limit=50&cursor=<id>" scope="customers:read"
          desc="قائمة عملائك مع ترقيم بالمؤشر (cursor). الحد الأقصى limit = 100 (الافتراضي 50)."
          response={`{
  "data": [
    { "id": "...", "name": "...", "phone": "+20...", "createdAt": "...", "leadScore": 0 }
  ],
  "pagination": { "limit": 50, "nextCursor": "...", "hasMore": true }
}`}
        />

        <section>
          <h3 className="font-semibold text-white mb-1">حدود المعدّل (Rate Limits)</h3>
          <p className="text-slate-400">لكل مفتاح حدّ خاص به (طلبات/دقيقة)، يظهر في الجدول أعلاه. عند تجاوز الحد تُعاد الحالة <code className="font-mono">429</code> مع ترويسة <code className="font-mono">Retry-After</code>. كل استجابة تتضمن <code className="font-mono">X-RateLimit-Limit</code>.</p>
        </section>

        <section>
          <h3 className="font-semibold text-white mb-1">رموز الأخطاء</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-1">
              <tbody>
                <ErrRow code="401" label="مفتاح مفقود أو غير صالح" />
                <ErrRow code="402" label="باقتك لا تتضمن وصول API — قم بالترقية" />
                <ErrRow code="403" label="المفتاح لا يملك الصلاحية (Scope) المطلوبة" />
                <ErrRow code="429" label="تجاوزت حد المعدّل — انتظر ثم أعد المحاولة" />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── (e) Webhook documentation (spec only) ──────────────────────────────────── */
function WebhookDocs() {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-bold text-lg flex items-center gap-2"><Webhook className="h-4 w-4 text-brand-300" /> توثيق الويب هوك (Webhooks)</h2>
        <span className="rounded-full bg-sky-500/15 text-sky-300 text-[10px] px-2 py-0.5">توثيق / مواصفات</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">هذا القسم مرجعي يوثّق صيغ الويب هوك. الويب هوك الوارد من Meta مُفعّل بالفعل على المنصة؛ أما الويب هوك الصادر العام فهو مواصفة مرجعية للتكامل.</p>

      <div className="space-y-5 text-sm">
        <section>
          <h3 className="font-semibold text-white mb-1">الويب هوك الوارد من Meta (WhatsApp Cloud)</h3>
          <p className="text-slate-400">تستقبل المنصة أحداث واتساب من Meta على المسار التالي، ويتم التحقق منها عبر <code className="font-mono bg-white/5 px-1 rounded">X-Hub-Signature-256</code> ورمز التحقق (verify token):</p>
          <Code>POST /api/webhooks/meta</Code>
          <Code>{`{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "phone_number_id": "..." },
        "messages": [{ "from": "20...", "type": "text", "text": { "body": "..." } }]
      }
    }]
  }]
}`}</Code>
        </section>

        <section>
          <h3 className="font-semibold text-white mb-1">الويب هوك الصادر العام (مواصفة)</h3>
          <p className="text-slate-400">صيغة الحمولة (payload) التي ترسلها KEYONE إلى نقطة الاستقبال (endpoint) عند وقوع حدث في حسابك:</p>
          <Code>{`POST https://your-server.example/webhook
Content-Type: application/json
X-KEYONE-Signature: sha256=<hmac>

{
  "id": "evt_...",
  "type": "customer.created",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "data": {
    "id": "...",
    "name": "...",
    "phone": "+20...",
    "leadScore": 0
  }
}`}</Code>
          <p className="text-slate-500 text-xs mt-1">تحقّق من التوقيع بحساب HMAC-SHA256 للجسم الخام باستخدام السر المشترك، وقارنه بترويسة <code className="font-mono">X-KEYONE-Signature</code>. أعِد <code className="font-mono">2xx</code> خلال ثوانٍ لتأكيد الاستلام.</p>
        </section>
      </div>
    </div>
  );
}

/* ── small presentational helpers ───────────────────────────────────────────── */
function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs font-mono text-slate-200 whitespace-pre" dir="ltr">{children}</pre>;
}

function Endpoint({ method, path, scope, desc, response }: { method: string; path: string; scope: string; desc: string; response: string }) {
  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded bg-emerald-500/15 text-emerald-300 text-xs font-bold px-2 py-0.5 font-mono">{method}</span>
        <code className="font-mono text-xs text-white break-all" dir="ltr">{path}</code>
        <span className="rounded bg-white/5 text-slate-400 text-[10px] px-1.5 py-0.5 font-mono">scope: {scope}</span>
      </div>
      <p className="text-slate-400 text-xs mt-2">{desc}</p>
      <div className="text-[11px] text-slate-500 mt-2">مثال الاستجابة:</div>
      <Code>{response}</Code>
    </section>
  );
}

function ErrRow({ code, label }: { code: string; label: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="p-1.5 font-mono font-bold text-rose-300 w-12">{code}</td>
      <td className="p-1.5 text-slate-400">{label}</td>
    </tr>
  );
}
