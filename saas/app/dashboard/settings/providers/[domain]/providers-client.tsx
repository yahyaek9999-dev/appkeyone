"use client";

// Universal Providers — generic, registry-driven settings UI (one component,
// all 5 domains). Drives API-key management, connection testing, health status,
// usage stats, failover priority ordering, and error logs. RTL Arabic to match
// the rest of the dashboard; field labels come from the registry (bilingual).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, FlaskConical, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff,
  ChevronUp, ChevronDown, Activity, ShieldCheck, ShieldAlert, ShieldQuestion,
  Power, PowerOff, ClipboardList, KeyRound,
} from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

type FieldSpec = {
  key: string;
  store: any;
  label: { ar: string; en: string };
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
  type?: "text" | "password" | "number" | "url";
  help?: { ar: string; en: string };
};
type Descriptor = {
  id: string;
  label: string;
  needsEndpoint?: boolean;
  defaultModel?: string;
  capabilities?: string[];
  fields: FieldSpec[];
  docsUrl?: string;
};
type FieldState = { key: string; secret: boolean; hasValue: boolean; value: string; mask: string };
type Credential = {
  id: string; provider: string; label: string; enabled: boolean; priority: number;
  status: "unknown" | "healthy" | "degraded" | "down"; lastCheckAt: string | null;
  lastError: string; updatedAt: string; fields: Record<string, FieldState>;
};
type UsageRow = { calls: number; failures: number; inputTokens: number; outputTokens: number; avgLatencyMs: number };
type LogRow = { id: string; provider: string; operation: string; ok: boolean; status: number; latencyMs: number; error: string; failedOver: boolean; createdAt: string };

type Payload = {
  domain: string; label: { ar: string; en: string }; serviceReady: boolean;
  providers: Descriptor[]; items: Credential[]; usage: Record<string, UsageRow>; logs: LogRow[];
};

const STATUS_META: Record<string, { ar: string; cls: string; Icon: any }> = {
  healthy: { ar: "سليم", cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", Icon: ShieldCheck },
  degraded: { ar: "متذبذب", cls: "text-amber-300 border-amber-500/30 bg-amber-500/10", Icon: ShieldAlert },
  down: { ar: "متوقف", cls: "text-rose-300 border-rose-500/30 bg-rose-500/10", Icon: ShieldAlert },
  unknown: { ar: "غير مفحوص", cls: "text-slate-400 border-slate-600/40 bg-slate-700/20", Icon: ShieldQuestion },
};

export function ProvidersClient({ slug }: { slug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // provider id being added/edited
  const [showLogs, setShowLogs] = useState(false);

  const showError = useCallback((m: string) => { setError(m); window.setTimeout(() => setError(null), 6000); }, []);
  const showSuccess = useCallback((m: string) => { setSuccess(m); window.setTimeout(() => setSuccess(null), 4000); }, []);

  const load = useCallback(async (spin = true) => {
    if (spin) setLoading(true);
    try {
      const r = await fetch(`/api/settings/providers/${slug}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { showError(j.error || "تعذّر تحميل المزوّدين"); return; }
      setData(j);
    } catch (e: any) {
      showError(e?.message || "خطأ في الشبكة");
    } finally {
      setLoading(false);
    }
  }, [slug, showError]);

  useEffect(() => { load(); }, [load]);

  const configured = useMemo(() => new Set((data?.items || []).map((i) => i.provider)), [data]);
  const available = useMemo(() => (data?.providers || []).filter((p) => !configured.has(p.id)), [data, configured]);

  if (loading && !data) {
    return (
      <div className="card p-10 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin me-2" /> جارٍ التحميل…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div dir="rtl" className="space-y-5">
      {!data.serviceReady && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>هذه الخدمة قيد التفعيل. يمكنك حفظ المفاتيح الآن، وسيبدأ التشغيل والاختبار فور تفعيل المزوّد.</span>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}

      {/* Configured providers (failover order = top→bottom) */}
      {data.items.length === 0 ? (
        <div className="card p-8 text-center">
          <KeyRound className="w-8 h-8 mx-auto mb-3 text-slate-500" />
          <div className="text-slate-200 font-semibold mb-1">لا يوجد مزوّد مُعدّ بعد</div>
          <p className="text-sm text-slate-400 mb-4">أضف مزوّدك الأول لتفعيل هذه الخدمة لحسابك. مفاتيحك تُخزَّن مشفّرة بالكامل.</p>
        </div>
      ) : (
        <div className="card divide-y divide-white/[0.06]">
          <div className="p-4 flex items-center justify-between">
            <div className="section-title">المزوّدون ({data.items.length})</div>
            <div className="text-xs text-slate-500">الترتيب = أولوية التبديل التلقائي (الأعلى أولاً)</div>
          </div>
          {data.items.map((c, idx) => (
            <ProviderRow
              key={c.id}
              cred={c}
              descriptor={data.providers.find((p) => p.id === c.provider)}
              usage={data.usage[c.provider]}
              slug={slug}
              isFirst={idx === 0}
              isLast={idx === data.items.length - 1}
              onChanged={() => load(false)}
              onError={showError}
              onSuccess={showSuccess}
            />
          ))}
        </div>
      )}

      {/* Add a provider */}
      {available.length > 0 && (
        <div className="card p-4">
          <div className="section-title mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> إضافة مزوّد</div>
          <div className="flex flex-wrap gap-2">
            {available.map((p) => (
              <button key={p.id} onClick={() => setEditing(p.id)}
                className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 hover:border-brand-400 hover:text-brand-200 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
          {editing && available.some((p) => p.id === editing) && (
            <div className="mt-4">
              <ProviderForm
                descriptor={available.find((p) => p.id === editing)!}
                slug={slug}
                onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); showSuccess("تم الحفظ ✅"); load(false); }}
                onError={showError}
              />
            </div>
          )}
        </div>
      )}

      {/* Recent activity / error logs */}
      <div className="card p-4">
        <button onClick={() => setShowLogs((s) => !s)} className="w-full flex items-center justify-between text-slate-200">
          <span className="section-title flex items-center gap-2"><ClipboardList className="w-4 h-4" /> سجلّ النشاط والأخطاء</span>
          {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showLogs && (
          data.logs.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">لا يوجد نشاط بعد.</p>
          ) : (
            <div className="mt-3 space-y-1.5 max-h-72 overflow-auto">
              {data.logs.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-xs rounded-lg bg-slate-800/40 px-3 py-2">
                  {l.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  <span className="font-mono text-slate-300">{l.provider}</span>
                  <span className="text-slate-500">{l.operation}</span>
                  {l.failedOver && <span className="text-amber-400">↪ تبديل</span>}
                  {l.status > 0 && <span className="text-slate-500">{l.status}</span>}
                  <span className="text-slate-600">{l.latencyMs}ms</span>
                  {!l.ok && l.error && <span className="text-rose-300/80 truncate">{l.error}</span>}
                  <span className="ms-auto text-slate-600 shrink-0">{new Date(l.createdAt).toLocaleString("ar")}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── One configured provider row ──────────────────────────────────────────────
function ProviderRow({
  cred, descriptor, usage, slug, isFirst, isLast, onChanged, onError, onSuccess,
}: {
  cred: Credential; descriptor?: Descriptor; usage?: UsageRow; slug: string;
  isFirst: boolean; isLast: boolean; onChanged: () => void;
  onError: (m: string) => void; onSuccess: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[cred.status] || STATUS_META.unknown;
  const confirm = useConfirm();

  async function test() {
    setBusy("test");
    try {
      const r = await fetch(`/api/settings/providers/${slug}/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: cred.provider }),
      });
      const j = await r.json();
      if (j.reason === "no_service") onError("الخدمة غير مُفعّلة بعد لهذا النوع.");
      else if (j.ok) onSuccess(`اتصال ناجح: ${descriptor?.label || cred.provider} ✅`);
      else onError(`فشل الاختبار: ${j.error || j.status || "غير معروف"}`);
      onChanged();
    } catch (e: any) { onError(e?.message || "خطأ في الشبكة"); }
    finally { setBusy(null); }
  }

  async function toggle() {
    await fetch(`/api/settings/providers/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: cred.provider, enabled: !cred.enabled, values: {} }),
    }).catch(() => {});
    onChanged();
  }

  async function move(dir: -1 | 1) {
    // Reorder by swapping priority with neighbor — server normalizes spacing.
    const delta = dir === -1 ? -15 : 15;
    await fetch(`/api/settings/providers/${slug}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: cred.provider, priority: Math.max(0, cred.priority + delta), values: {} }),
    }).catch(() => {});
    onChanged();
  }

  async function remove() {
    const ok = await confirm({ title: `حذف ${descriptor?.label || cred.provider}؟`, confirmLabel: "حذف", danger: true });
    if (!ok) return;
    setBusy("delete");
    try {
      await fetch(`/api/settings/providers/${slug}?provider=${encodeURIComponent(cred.provider)}`, { method: "DELETE" });
      onSuccess("تم الحذف");
      onChanged();
    } finally { setBusy(null); }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col">
          <button onClick={() => move(-1)} disabled={isFirst} className="text-slate-500 hover:text-slate-200 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={() => move(1)} disabled={isLast} className="text-slate-500 hover:text-slate-200 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100">{descriptor?.label || cred.provider}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${meta.cls}`}>
              <meta.Icon className="w-3 h-3" /> {meta.ar}
            </span>
            {!cred.enabled && <span className="text-[11px] text-slate-500 rounded-full border border-slate-600/40 px-2 py-0.5">معطّل</span>}
          </div>
          {usage && usage.calls > 0 && (
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><Activity className="w-3 h-3" /> {usage.calls} طلب</span>
              {usage.failures > 0 && <span className="text-rose-400/80">{usage.failures} فشل</span>}
              {usage.avgLatencyMs > 0 && <span>{usage.avgLatencyMs}ms</span>}
              {(usage.inputTokens + usage.outputTokens) > 0 && <span>{(usage.inputTokens + usage.outputTokens).toLocaleString()} توكن</span>}
            </div>
          )}
          {cred.status !== "healthy" && cred.lastError && (
            <div className="text-[11px] text-rose-300/70 mt-1 truncate max-w-md">{cred.lastError}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={test} disabled={!!busy} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5">
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />} اختبار
          </button>
          <button onClick={toggle} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5">
            {cred.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />} {cred.enabled ? "إيقاف" : "تفعيل"}
          </button>
          <button onClick={() => setOpen((s) => !s)} className="btn-ghost text-xs px-2.5 py-1.5">تعديل</button>
          <button onClick={remove} disabled={!!busy} className="btn-ghost text-xs text-rose-300 hover:text-rose-200 px-2 py-1.5">
            {busy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {open && descriptor && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <ProviderForm
            descriptor={descriptor}
            slug={slug}
            existing={cred}
            onClose={() => setOpen(false)}
            onSaved={() => { setOpen(false); onSuccess("تم الحفظ ✅"); onChanged(); }}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}

// ── Add/Edit form (registry-driven) ──────────────────────────────────────────
function ProviderForm({
  descriptor, slug, existing, onClose, onSaved, onError,
}: {
  descriptor: Descriptor; slug: string; existing?: Credential;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of descriptor.fields) {
      const fs = existing?.fields?.[f.key];
      init[f.key] = fs && !fs.secret ? fs.value : "";
    }
    return init;
  });
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err" | "info"; msg?: string }>({ kind: "idle" });

  function set(k: string, v: string) { setValues((p) => ({ ...p, [k]: v })); setStatus({ kind: "idle" }); }

  async function save() {
    setSaving(true);
    setStatus({ kind: "info", msg: "جارٍ الحفظ…" });
    try {
      const r = await fetch(`/api/settings/providers/${slug}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: descriptor.id, enabled: true, values }),
      });
      const j = await r.json();
      if (!r.ok) {
        const field = j.field ? ` (${j.field})` : "";
        const map: Record<string, string> = { missing_required: "حقل مطلوب ناقص", endpoint_blocked: "الرابط غير مسموح (داخلي/غير آمن)", encrypt_failed: "فشل التشفير" };
        onError((map[j.error] || j.error || "فشل الحفظ") + field);
        setStatus({ kind: "err", msg: map[j.error] || j.error });
        return;
      }
      onSaved();
    } catch (e: any) { onError(e?.message || "خطأ في الشبكة"); }
    finally { setSaving(false); }
  }

  async function test() {
    setTesting(true);
    setStatus({ kind: "info", msg: "جارٍ اختبار الاتصال…" });
    try {
      const r = await fetch(`/api/settings/providers/${slug}/test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: descriptor.id, values }),
      });
      const j = await r.json();
      if (j.reason === "no_service") setStatus({ kind: "err", msg: "الخدمة غير مُفعّلة بعد لهذا النوع." });
      else if (j.ok) setStatus({ kind: "ok", msg: "اتصال ناجح ✅" });
      else setStatus({ kind: "err", msg: `فشل: ${j.error || j.status || "غير معروف"}` });
    } catch (e: any) { setStatus({ kind: "err", msg: e?.message || "خطأ في الشبكة" }); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-4">
      {descriptor.capabilities && descriptor.capabilities.length > 0 && (
        <div className="flex gap-1.5">
          {descriptor.capabilities.map((c) => (
            <span key={c} className="text-[11px] rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-200 px-2 py-0.5">
              {c === "generate" ? "توليد" : c === "analyze" ? "تحليل" : c}
            </span>
          ))}
        </div>
      )}
      {descriptor.fields.map((f) => {
        const fs = existing?.fields?.[f.key];
        const isSecret = !!f.secret;
        const ph = isSecret && fs?.hasValue ? fs.mask : f.placeholder || "";
        return (
          <div key={f.key}>
            <label className="text-sm font-semibold mb-1.5 block text-slate-200">
              {f.label.ar}{f.required && <span className="text-rose-400"> *</span>}
            </label>
            <div className="relative">
              <input
                type={isSecret && !showSecret[f.key] ? "password" : f.type === "number" ? "number" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={ph}
                autoComplete="off"
                spellCheck={false}
                className={`input w-full ${isSecret ? "pe-10 font-mono text-sm" : ""}`}
              />
              {isSecret && (
                <button type="button" onClick={() => setShowSecret((s) => ({ ...s, [f.key]: !s[f.key] }))}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200" aria-label="إظهار/إخفاء">
                  {showSecret[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            {f.help && <p className="text-xs text-slate-500 mt-1">{f.help.ar}</p>}
            {isSecret && fs?.hasValue && <p className="text-xs text-slate-500 mt-1">اتركه فاضي للإبقاء على المفتاح المحفوظ.</p>}
          </div>
        );
      })}

      {status.kind !== "idle" && status.msg && (
        <div className={`rounded-lg px-3 py-2 text-sm flex items-start gap-2 ${
          status.kind === "ok" ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
          : status.kind === "err" ? "bg-rose-500/10 text-rose-300 border border-rose-500/30"
          : "bg-slate-500/10 text-slate-300 border border-slate-500/30"}`}>
          {status.kind === "ok" && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          {status.kind === "err" && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {status.kind === "info" && <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />}
          <span>{status.msg}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2 text-sm">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} حفظ
        </button>
        <button onClick={test} disabled={testing || saving} className="btn-ghost inline-flex items-center gap-2 text-sm">
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} اختبار الاتصال
        </button>
        <button onClick={onClose} className="btn-ghost text-sm">إلغاء</button>
      </div>
    </div>
  );
}
