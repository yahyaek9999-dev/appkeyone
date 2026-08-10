"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Plus, Trash2, FileText, Save, X, Globe, Upload, Loader2,
  Link as LinkIcon, HelpCircle, Package, CheckCircle2, Clock,
  Database, BookOpen,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Doc {
  id: string;
  title: string;
  content: string;
  source: string;
  sourceUrl?: string | null;
  hitCount?: number;
  lastMatchedAt?: string | null;
  createdAt: string;
}

// ── Source helpers ─────────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; icon: string; color: string }> = {
  manual:   { label: "يدوي",     icon: "✎",  color: "bg-slate-500/15 text-slate-300" },
  url:      { label: "رابط",     icon: "🌐", color: "bg-blue-500/15 text-blue-300" },
  pdf:      { label: "PDF",      icon: "📄", color: "bg-rose-500/15 text-rose-300" },
  docx:     { label: "Word",     icon: "📝", color: "bg-brand-500/15 text-brand-300" },
  txt:      { label: "TXT",      icon: "📃", color: "bg-slate-500/15 text-slate-300" },
  faq:      { label: "FAQ",      icon: "❓", color: "bg-amber-500/15 text-amber-300" },
  products: { label: "منتجات",   icon: "🛍️", color: "bg-gold-500/15 text-gold-300" },
  suggestion:{ label: "مقترح",   icon: "💡", color: "bg-emerald-500/15 text-emerald-300" },
};

function SourceBadge({ source }: { source: string }) {
  const m = SOURCE_META[source] ?? SOURCE_META.manual;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return "";
  const diff = Date.now() - new Date(dt).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `منذ ${d} يوم`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function KnowledgeUI({ docs }: { docs: Doc[] }) {
  const r = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Partial<Doc> | null>(null);
  const [busy, setBusy] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function save() {
    if (!editing) return;
    setBusy(true);
    const method = editing.id ? "PUT" : "POST";
    const url = editing.id ? `/api/knowledge/${editing.id}` : "/api/knowledge";
    const body: Record<string, string> = { title: editing.title ?? "", content: editing.content ?? "" };
    if (!editing.id && editing.source) body.source = editing.source;
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { setEditing(null); r.refresh(); }
  }

  async function del(id: string) {
    if (!(await confirm({ title: "حذف المستند", body: "هل أنت متأكد من الحذف؟", confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    r.refresh();
  }

  // ── URL import ────────────────────────────────────────────────────────────

  async function importUrl() {
    if (!urlInput.trim()) return;
    setImportingUrl(true); setImportMsg(null);
    try {
      const res = await fetch("/api/knowledge/import-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: urlInput.trim() }) });
      const j = await res.json();
      if (res.ok) { setUrlInput(""); setImportMsg({ ok: true, text: `تم استيراد "${j.doc.title}"` }); r.refresh(); }
      else setImportMsg({ ok: false, text: j.error || "فشل الاستيراد" });
    } catch (e: any) { setImportMsg({ ok: false, text: e.message }); }
    finally { setImportingUrl(false); }
  }

  // ── File import ───────────────────────────────────────────────────────────

  async function importFile(file: File) {
    setImportingFile(true); setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/knowledge/import-file", { method: "POST", body: fd });
      const j = await res.json();
      if (res.ok) { setImportMsg({ ok: true, text: `تم استيراد "${j.doc.title}"` }); r.refresh(); }
      else setImportMsg({ ok: false, text: j.error || "فشل الرفع" });
    } catch (e: any) { setImportMsg({ ok: false, text: e.message }); }
    finally { setImportingFile(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const bySource = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.source] = (acc[d.source] || 0) + 1;
    return acc;
  }, {});

  const totalChars = docs.reduce((n, d) => n + (d.content?.length ?? 0), 0);
  const totalHits  = docs.reduce((n, d) => n + (d.hitCount ?? 0), 0);
  const lastUpdated = docs.length > 0
    ? docs.reduce((best, d) => d.createdAt > best ? d.createdAt : best, docs[0].createdAt)
    : null;

  return (
    <div className="space-y-5">

      {/* ── Training Status Panel ── */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-brand-400" />
          <h3 className="section-title">حالة التدريب</h3>
          {docs.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-300">
              <CheckCircle2 className="h-3 w-3" />
              نشط
            </span>
          )}
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-500">لم يُضَف أي محتوى بعد — أضف مستنداً لتدريب المساعد.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox label="مصادر المعرفة"  value={String(docs.length)} icon={<BookOpen className="h-4 w-4" />} />
            <StatBox label="إجمالي الأحرف"  value={totalChars.toLocaleString("ar-EG")} icon={<FileText className="h-4 w-4" />} />
            <StatBox label="مرات الاستخدام" value={totalHits.toLocaleString("ar-EG")} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatBox
              label="آخر تحديث"
              value={lastUpdated ? timeAgo(lastUpdated) : "—"}
              icon={<Clock className="h-4 w-4" />}
            />
          </div>
        )}
        {docs.length > 0 && Object.keys(bySource).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.05] pt-3">
            {Object.entries(bySource).map(([src, n]) => (
              <span key={src} className="flex items-center gap-1 text-xs text-slate-400">
                <SourceBadge source={src} />
                <span>{n}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Import Bar ── */}
      <div className="card p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="h-4 w-4 text-emerald-400" />
          استيراد — اجلب المحتوى تلقائياً
        </h3>

        {/* URL + File row */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && importUrl()}
                placeholder="https://example.com/about"
                dir="ltr"
                className="input w-full pr-10"
              />
            </div>
            <button onClick={importUrl} disabled={importingUrl || !urlInput.trim()} className="btn-primary shrink-0">
              {importingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              رابط
            </button>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }}
              className="hidden"
            />
            <button onClick={() => fileRef.current?.click()} disabled={importingFile} className="btn-primary w-full">
              {importingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              رفع PDF / Word / TXT
            </button>
          </div>
        </div>

        {/* FAQ + Products row */}
        <div className="grid gap-3 md:grid-cols-2">
          <button onClick={() => setShowFaq(true)} className="btn-ghost justify-center gap-2 w-full">
            <HelpCircle className="h-4 w-4 text-amber-400" />
            أضف أسئلة وأجوبة (FAQ)
          </button>
          <button onClick={() => setShowProducts(true)} className="btn-ghost justify-center gap-2 w-full">
            <Package className="h-4 w-4 text-gold-400" />
            استيراد قائمة منتجات
          </button>
        </div>

        {importMsg && (
          <div className={`rounded-md p-2 text-xs ${importMsg.ok ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>
            {importMsg.text}
          </div>
        )}
      </div>

      {/* ── Manual add ── */}
      <button onClick={() => setEditing({ title: "", content: "" })} className="btn-primary">
        <Plus className="h-4 w-4" />
        إضافة مستند يدوياً
      </button>

      {/* ── Empty state ── */}
      {docs.length === 0 && !editing && (
        <div className="card p-12 text-center">
          <FileText className="mx-auto mb-3 h-12 w-12 text-slate-600" />
          <h3 className="mb-1 font-bold">لسه ما رفعتش حاجة</h3>
          <p className="text-sm text-slate-400">أضف منتجاتك، أسعارك، أو أسئلة شائعة لتحسين دقة الردود التلقائية.</p>
        </div>
      )}

      {/* ── Document cards ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {docs.map((d) => (
          <div key={d.id} className="card p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 font-semibold">
                <FileText className="h-4 w-4 shrink-0 text-brand-400" />
                <span className="truncate">{d.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <SourceBadge source={d.source} />
                <button onClick={() => setEditing(d)} className="rounded p-1.5 text-slate-400 transition hover:text-white" title="تعديل">✎</button>
                <button onClick={() => del(d.id)} className="rounded p-1.5 text-slate-400 transition hover:text-rose-400" title="حذف"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-400">{d.content}</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
              <span>{d.content.length.toLocaleString("ar-EG")} حرف</span>
              <span className="flex items-center gap-2">
                {(d.hitCount ?? 0) > 0 && (
                  <span className="text-brand-400/70">استُخدم {d.hitCount} مرة</span>
                )}
                {d.lastMatchedAt && (
                  <span>· {timeAgo(d.lastMatchedAt)}</span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Edit/create modal ── */}
      {editing && (
        <DocModal editing={editing} setEditing={setEditing} busy={busy} onSave={save} />
      )}

      {/* ── FAQ Builder modal ── */}
      {showFaq && <FaqModal onClose={() => setShowFaq(false)} onSaved={() => { setShowFaq(false); r.refresh(); }} />}

      {/* ── Product import modal ── */}
      {showProducts && <ProductImportModal onClose={() => setShowProducts(false)} onSaved={() => { setShowProducts(false); r.refresh(); }} />}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatBox({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-slate-500">{icon}<span className="text-[11px]">{label}</span></div>
      <div className="text-base font-bold text-white">{value}</div>
    </div>
  );
}

function DocModal({ editing, setEditing, busy, onSave }: {
  editing: Partial<Doc>;
  setEditing: (d: Partial<Doc> | null) => void;
  busy: boolean;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{editing.id ? "تعديل المستند" : "مستند جديد"}</h2>
          <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">العنوان</label>
            <input className="input" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="مثلاً: قائمة أسعار المنتجات" />
          </div>
          <div>
            <label className="label">المحتوى</label>
            <textarea className="input min-h-[300px] font-mono text-sm leading-relaxed" value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} placeholder="انسخ ولصق المعلومات هنا..." />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-ghost">إلغاء</button>
            <button onClick={onSave} disabled={busy || !editing.title || !editing.content} className="btn-primary">
              <Save className="h-4 w-4" />
              {busy ? "..." : "حفظ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// FAQ Builder – collects Q/A pairs and saves as one Document with source:"faq"
function FaqModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [pairs, setPairs] = useState([{ q: "", a: "" }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addPair() { setPairs((p) => [...p, { q: "", a: "" }]); }
  function removePair(i: number) { setPairs((p) => p.filter((_, j) => j !== i)); }
  function update(i: number, field: "q" | "a", val: string) {
    setPairs((p) => p.map((pair, j) => j === i ? { ...pair, [field]: val } : pair));
  }

  async function save() {
    const valid = pairs.filter((p) => p.q.trim() && p.a.trim());
    if (!valid.length) { setErr("أضف سؤالاً وجواباً واحداً على الأقل."); return; }
    setSaving(true); setErr(null);
    const content = valid.map((p) => `س: ${p.q.trim()}\nج: ${p.a.trim()}`).join("\n\n");
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "أسئلة وأجوبة شائعة", content, source: "faq" }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else { const j = await res.json(); setErr(j.error || "فشل الحفظ"); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <HelpCircle className="h-5 w-5 text-amber-400" />
            أضف أسئلة وأجوبة (FAQ)
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-400">كل سؤال وجواب يُضاف كمصدر معرفة يُستخدم تلقائياً عند الإجابة.</p>
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <div key={i} className="card bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-400 font-semibold">سؤال {i + 1}</span>
                {pairs.length > 1 && (
                  <button onClick={() => removePair(i)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <input className="input text-sm" placeholder="ما هو وقت الشحن؟" value={p.q} onChange={(e) => update(i, "q", e.target.value)} />
              <textarea className="input min-h-[80px] resize-none text-sm" placeholder="الشحن يستغرق 2-3 أيام عمل داخل القاهرة..." value={p.a} onChange={(e) => update(i, "a", e.target.value)} />
            </div>
          ))}
        </div>
        {err && <div className="mt-3 text-xs text-rose-400">{err}</div>}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={addPair} className="btn-ghost text-sm">
            <Plus className="h-4 w-4" />
            سؤال آخر
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">إلغاء</button>
            <button onClick={save} disabled={saving} className="btn-primary">
              <Save className="h-4 w-4" />
              {saving ? "..." : "حفظ الأسئلة"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Product import – parses "name — price" lines, creates Product rows + Document
function ProductImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ productsCreated: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function doImport() {
    if (!text.trim()) return;
    setSaving(true); setErr(null); setResult(null);
    const res = await fetch("/api/knowledge/import-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const j = await res.json();
    setSaving(false);
    if (res.ok) { setResult(j); onSaved(); }
    else setErr(j.error || "فشل الاستيراد");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Package className="h-5 w-5 text-gold-400" />
            استيراد قائمة منتجات
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-1 text-sm text-slate-400">الصق قائمة منتجاتك — كل منتج في سطر على شكل:</p>
        <pre className="mb-4 rounded-xl bg-white/[0.04] p-3 text-xs text-slate-300 font-mono leading-relaxed">
{`قميص قطن — 350
بنطلون جينز — 480
حذاء رياضي — 650`}
        </pre>
        <textarea
          className="input min-h-[200px] resize-none font-mono text-sm"
          placeholder="اسم المنتج — السعر بالجنيه"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {err && <div className="mt-2 text-xs text-rose-400">{err}</div>}
        {result && (
          <div className="mt-2 flex items-center gap-2 text-xs text-brand-300">
            <CheckCircle2 className="h-4 w-4" />
            تم إضافة {result.productsCreated} منتج بنجاح
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">إلغاء</button>
          <button onClick={doImport} disabled={saving || !text.trim()} className="btn-primary">
            <Package className="h-4 w-4" />
            {saving ? "..." : "استيراد"}
          </button>
        </div>
      </div>
    </div>
  );
}
