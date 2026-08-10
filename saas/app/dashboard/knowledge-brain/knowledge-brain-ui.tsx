"use client";

// AI Knowledge Brain — merchant experience (client).
//
// Sits ON TOP of the existing Document model + kb-cache retrieval. It does NOT
// re-implement uploads: the Upload Center posts to the existing
// POST /api/knowledge/import-file route. Everything else (health, coverage,
// missing-info, search, ask) is read-only against the brain endpoints.
//
// Mirrors the system-health UI contract: no-store fetches, 401(auth)/403/!ok/
// network error states, skeleton, retry. RTL Arabic, dark theme, brand tokens.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain, Loader2, RefreshCw, Wifi, Shield, AlertTriangle, Lock,
  Upload, FileText, Search, BarChart3, CheckCircle2, XCircle,
  Gauge, ShieldCheck, HelpCircle, Package, Tag, Database, Crown,
} from "lucide-react";

// ---- shapes mirroring the brain API ----
type Pillar = { key: string; label: string; present: boolean };
type Health = {
  docCount: number;
  totalChars: number;
  coverageScore: number;
  healthScore: number;
  missing: string[];
  pillars: Pillar[];
  lastUpdatedAt: string | null;
};
type Doc = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  chars: number;
  hitCount: number;
  lastMatchedAt: string | null;
  createdAt: string;
};
type BrainData = { health: Health; docs: Doc[] };
type SearchResult = { docTitle: string; text: string; score: number };

type LoadError =
  | { kind: "auth" }
  | { kind: "disabled" }
  | { kind: "network"; detail?: string }
  | { kind: "server"; detail?: string };

function pillarIcon(key: string) {
  switch (key) {
    case "pricing": return <Tag className="h-4 w-4" />;
    case "policy": return <ShieldCheck className="h-4 w-4" />;
    case "faq": return <HelpCircle className="h-4 w-4" />;
    case "product": return <Package className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
}

function scoreTone(v: number) {
  if (v >= 75) return { text: "text-emerald-300", ring: "text-emerald-400", border: "border-emerald-500/30" };
  if (v >= 40) return { text: "text-amber-300", ring: "text-amber-400", border: "border-amber-500/30" };
  return { text: "text-rose-300", ring: "text-rose-400", border: "border-rose-500/30" };
}

export default function KnowledgeBrainUi({ enabled }: { enabled: boolean }) {
  // Locked / upsell state — feature is a paid add-on, OFF by default.
  if (!enabled) return <LockedState />;
  return <BrainConsole />;
}

// =========================================================================
//  Locked / upsell view
// =========================================================================
function LockedState() {
  return (
    <div className="space-y-6">
      <Header />
      <div className="card p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10">
          <Lock className="h-7 w-7 text-brand-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">العقل المعرفي للذكاء الاصطناعي</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          ميزة إضافية مدفوعة تحوّل مستنداتك (أسعار، سياسات، أسئلة شائعة، منتجات)
          إلى مصدر معرفة موحّد — مع تقييم جودة المعرفة، كشف النواقص، وبحث ذكي
          بمصادر موثّقة. الميزة غير مفعّلة في حسابك حالياً.
        </p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-right text-sm text-slate-300">
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> مؤشر صحة المعرفة وتغطيتها</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> كاشف المعلومات الناقصة</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> بحث واستعلام ذكي مع مصادر موثّقة ودرجة ثقة</li>
        </ul>
        <div className="mt-6 flex items-center justify-center gap-2">
          <a href="/dashboard/usage" className="btn-primary text-sm">
            <Crown className="h-4 w-4" />
            ترقية الباقة
          </a>
          <a href="/dashboard/knowledge" className="btn-ghost px-3 py-2 text-sm">
            مركز التدريب الحالي
          </a>
        </div>
        <p className="mt-4 text-[11px] text-slate-600">
          لتفعيل الميزة لحسابك تواصل مع الدعم — يتم التفعيل من لوحة الإدارة.
        </p>
      </div>
    </div>
  );
}

// =========================================================================
//  Enabled console
// =========================================================================
function BrainConsole() {
  const [data, setData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/knowledge/brain", { cache: "no-store" });
      if (r.status === 401) { setError({ kind: "auth" }); setData(null); return; }
      if (r.status === 403) { setError({ kind: "disabled" }); setData(null); return; }
      if (!r.ok) { setError({ kind: "server", detail: `HTTP ${r.status}` }); setData(null); return; }
      const j = await r.json();
      if (j?.error) { setError({ kind: "server", detail: String(j.error) }); setData(null); return; }
      setData(j);
      setError(null);
    } catch (e) {
      setError({ kind: "network", detail: e instanceof Error ? e.message : undefined });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header />
        <button onClick={fetchData} disabled={loading} className="btn-ghost px-3 py-1.5 text-sm shrink-0">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {loading && !data ? (
        <BrainSkeleton />
      ) : !data ? (
        <ErrorState error={error} onRetry={fetchData} retrying={loading} />
      ) : (
        <>
          <ScoreCards health={data.health} />
          <MissingInfo health={data.health} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <UploadCenter onUploaded={fetchData} />
            <AskBox />
          </div>
          <RecentDocs docs={data.docs} />
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <Brain className="h-6 w-6 text-brand-400" />
      <div>
        <h1 className="page-title">العقل المعرفي</h1>
        <p className="page-desc mt-1">ارفع معرفتك، قِس جودتها، واسأل بحثاً ذكياً بمصادر موثّقة</p>
      </div>
    </div>
  );
}

// ---- Score cards: health + coverage as radial gauges ----
function ScoreCards({ health }: { health: Health }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <GaugeCard icon={<Gauge className="h-4 w-4" />} label="صحة المعرفة" value={health.healthScore} hint="حجم + عمق + حداثة المستندات" />
      <GaugeCard icon={<BarChart3 className="h-4 w-4" />} label="تغطية المواضيع" value={health.coverageScore} hint="أسعار · سياسات · أسئلة · منتجات" />
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Database className="h-4 w-4" /> ملخص المعرفة
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">عدد المستندات</span>
            <span className="font-bold text-white">{health.docCount.toLocaleString("ar-EG")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">إجمالي المحتوى</span>
            <span className="font-bold text-white">{health.totalChars.toLocaleString("ar-EG")} حرف</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">آخر تحديث</span>
            <span className="font-medium text-slate-300">
              {health.lastUpdatedAt ? new Date(health.lastUpdatedAt).toLocaleDateString("ar-EG") : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GaugeCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number; hint: string }) {
  const tone = scoreTone(value);
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className={`card p-5 ${tone.border}`}>
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-slate-500">{icon}{label}</div>
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
            <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-white/[0.06]" />
            <circle
              cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="6"
              strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
              className={tone.ring}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${tone.text}`}>{value}</span>
        </div>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

// ---- Missing-info detector ----
function MissingInfo({ health }: { health: Health }) {
  const allPresent = health.missing.length === 0;
  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" /> كاشف المعلومات الناقصة
      </h3>
      {health.docCount === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مستندات بعد — ابدأ برفع أسعارك وسياساتك وأسئلتك الشائعة ومنتجاتك.</p>
      ) : allPresent ? (
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> ممتاز — جميع المواضيع الأساسية مغطّاة.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-400">المواضيع التالية غير مكتشفة في معرفتك — أضِفها لتحسين دقة البوت:</p>
          <div className="flex flex-wrap gap-2">
            {health.missing.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-2.5 py-1 text-xs text-rose-300">
                <XCircle className="h-3.5 w-3.5" /> {m}
              </span>
            ))}
          </div>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {health.pillars.map((p) => (
          <div key={p.key} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${p.present ? "border-emerald-500/25 bg-emerald-500/[0.04] text-emerald-300" : "border-white/10 bg-white/[0.02] text-slate-500"}`}>
            {pillarIcon(p.key)}
            <span className="truncate">{p.label}</span>
            {p.present ? <CheckCircle2 className="ms-auto h-3.5 w-3.5" /> : <XCircle className="ms-auto h-3.5 w-3.5 text-slate-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Upload Center: reuses existing POST /api/knowledge/import-file ----
function UploadCenter({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/knowledge/import-file", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setMsg({ kind: "err", text: j?.error || `تعذّر الرفع (HTTP ${r.status})` });
        return;
      }
      setMsg({ kind: "ok", text: `تمت إضافة "${j?.doc?.title ?? file.name}" إلى معرفتك` });
      onUploaded();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "فشل الاتصال أثناء الرفع" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [onUploaded]);

  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <Upload className="h-4 w-4 text-brand-400" /> مركز الرفع
      </h3>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center transition hover:border-brand-500/40 hover:bg-brand-500/[0.03]">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        {busy ? (
          <Loader2 className="mb-2 h-7 w-7 animate-spin text-brand-400" />
        ) : (
          <FileText className="mb-2 h-7 w-7 text-slate-500" />
        )}
        <span className="text-sm font-medium text-slate-200">{busy ? "جارٍ الرفع والمعالجة…" : "اسحب ملفاً أو اضغط للاختيار"}</span>
        <span className="mt-1 text-[11px] text-slate-500">PDF · Word · TXT — حتى 10MB</span>
      </label>
      {msg && (
        <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${msg.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300" : "border-rose-500/30 bg-rose-500/[0.06] text-rose-300"}`}>
          {msg.kind === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-600">
        تُضاف المستندات لنفس مصدر معرفة البوت — يمكنك إدارتها من
        <a href="/dashboard/knowledge" className="text-brand-400 hover:underline"> مركز التدريب</a>.
      </p>
    </div>
  );
}

// ---- Ask / Search box ----
function AskBox() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [cited, setCited] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/knowledge/brain/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (r.status === 401) { setErr("انتهت الجلسة — سجّل الدخول مرة أخرى."); setResults(null); return; }
      if (r.status === 403) { setErr("الميزة غير مفعّلة لحسابك."); setResults(null); return; }
      if (!r.ok) { setErr(`تعذّر البحث (HTTP ${r.status})`); setResults(null); return; }
      const j = await r.json();
      setResults(Array.isArray(j?.results) ? j.results : []);
      setCited(!!j?.cited);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "فشل الاتصال أثناء البحث");
      setResults(null);
    } finally {
      setBusy(false);
    }
  }, [q]);

  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <Search className="h-4 w-4 text-amber-400" /> اسأل معرفتك
      </h3>
      <form onSubmit={ask} className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="مثال: كم سعر التوصيل؟ ما سياسة الاسترجاع؟"
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-500/40 focus:outline-none"
        />
        <button type="submit" disabled={busy || !q.trim()} className="btn-primary px-4 py-2.5 text-sm">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </form>

      {err && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-300">
          <XCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}

      {results && !err && (
        <div className="mt-4 space-y-3">
          {results.length === 0 ? (
            <p className="text-sm text-slate-400">لم نعثر على معلومات ذات صلة في معرفتك — جرّب صياغة أخرى أو أضِف مستنداً يغطّي السؤال.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[11px]">
                {cited ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> إجابة مدعومة بمصادر موثّقة</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> نتائج عامة — لا يوجد مصدر موثّق قوي</span>
                )}
              </div>
              {results.map((rs, i) => {
                const pct = Math.round(Math.min(1, rs.score) * 100);
                const tone = scoreTone(pct);
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-300">
                        <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        {rs.docTitle || "مصدر غير معنون"}
                      </span>
                      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tone.border} ${tone.text}`}>
                        {pct >= 75 ? "تطابق قوي" : pct >= 50 ? "تطابق متوسط" : "تطابق جزئي"}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{rs.text}</p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Recent documents list ----
function RecentDocs({ docs }: { docs: Doc[] }) {
  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-sky-400" /> أحدث المستندات
      </h3>
      {docs.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مستندات بعد. ابدأ بالرفع من مركز الرفع بالأعلى.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-200">{d.title}</div>
                <div className="text-[11px] text-slate-500">
                  {d.source} · {d.chars.toLocaleString("ar-EG")} حرف
                  {d.hitCount > 0 && ` · استُخدم ${d.hitCount.toLocaleString("ar-EG")} مرة`}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-slate-600">{new Date(d.createdAt).toLocaleDateString("ar-EG")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- skeleton + error (mirrors system-health) ----
function BrainSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="جارٍ تحميل العقل المعرفي">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="card h-28 p-5" />)}
      </div>
      <div className="card h-32 p-5" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card h-56 p-5" />
        <div className="card h-56 p-5" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry, retrying }: { error: LoadError | null; onRetry: () => void; retrying: boolean }) {
  const kind = error?.kind ?? "server";
  const copy = {
    auth: { title: "انتهت الجلسة", desc: "سجّل الدخول مرة أخرى لعرض العقل المعرفي.", cta: "تسجيل الدخول", href: "/login" },
    disabled: { title: "الميزة غير مفعّلة", desc: "العقل المعرفي ميزة إضافية مدفوعة غير مفعّلة لحسابك.", cta: "ترقية الباقة", href: "/dashboard/usage" },
    network: { title: "تعذّر الاتصال", desc: "تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.", cta: null, href: null },
    server: { title: "تعذّر تحميل البيانات", desc: "حدث خطأ مؤقت. عادةً ما يُحل بإعادة المحاولة.", cta: null, href: null },
  }[kind];

  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10">
        {kind === "network" ? <Wifi className="h-6 w-6 text-rose-400" /> : kind === "auth" ? <Shield className="h-6 w-6 text-amber-400" /> : kind === "disabled" ? <Lock className="h-6 w-6 text-brand-400" /> : <AlertTriangle className="h-6 w-6 text-rose-400" />}
      </div>
      <h3 className="text-base font-semibold text-white">{copy.title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">{copy.desc}</p>
      {error && "detail" in error && error.detail && <p className="mt-2 font-mono text-[11px] text-slate-600">{error.detail}</p>}
      <div className="mt-5 flex items-center justify-center gap-2">
        {copy.cta && copy.href ? (
          <a href={copy.href} className="btn-primary text-sm">{copy.cta}</a>
        ) : (
          <button onClick={onRetry} disabled={retrying} className="btn-primary text-sm">
            <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}
