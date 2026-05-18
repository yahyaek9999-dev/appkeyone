"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileText, Save, X, Globe, Upload, Loader2, Link as LinkIcon } from "lucide-react";

export default function KnowledgeUI({ docs }: { docs: any[] }) {
  const r = useRouter();
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true);
    const method = editing.id ? "PUT" : "POST";
    const url = editing.id ? `/api/knowledge/${editing.id}` : "/api/knowledge";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editing.title, content: editing.content }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(null);
      r.refresh();
    }
  }
  async function del(id: string) {
    if (!confirm("متأكد من الحذف؟")) return;
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    r.refresh();
  }

  async function importUrl() {
    if (!urlInput.trim()) return;
    setImportingUrl(true); setImportMsg(null);
    try {
      const res = await fetch("/api/knowledge/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const j = await res.json();
      if (res.ok) {
        setUrlInput("");
        setImportMsg({ ok: true, text: `تم استيراد "${j.doc.title}" بنجاح` });
        r.refresh();
      } else {
        setImportMsg({ ok: false, text: j.error || "فشل الاستيراد" });
      }
    } catch (e: any) {
      setImportMsg({ ok: false, text: e.message || "خطأ في الاتصال" });
    } finally {
      setImportingUrl(false);
    }
  }

  async function importFile(file: File) {
    setImportingFile(true); setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/knowledge/import-file", {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (res.ok) {
        setImportMsg({ ok: true, text: `تم استيراد "${j.doc.title}" بنجاح` });
        r.refresh();
      } else {
        setImportMsg({ ok: false, text: j.error || "فشل الاستيراد" });
      }
    } catch (e: any) {
      setImportMsg({ ok: false, text: e.message || "خطأ في الرفع" });
    } finally {
      setImportingFile(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {/* Import bar */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <Globe className="w-4 h-4 text-emerald-400" />
          استيراد سريع — وفّر وقت إدخال البيانات
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && importUrl()}
                placeholder="https://example.com/about"
                dir="ltr"
                className="input pr-10 w-full"
              />
            </div>
            <button
              onClick={importUrl}
              disabled={importingUrl || !urlInput.trim()}
              className="btn-primary shrink-0"
            >
              {importingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              من رابط
            </button>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
              }}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importingFile}
              className="btn-primary w-full"
            >
              {importingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              رفع ملف PDF أو Word
            </button>
          </div>
        </div>
        {importMsg && (
          <div className={`text-xs p-2 rounded-md ${importMsg.ok ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/10 text-rose-300 border border-rose-500/30"}`}>
            {importMsg.text}
          </div>
        )}
      </div>

      <button
        onClick={() => setEditing({ title: "", content: "" })}
        className="btn-primary"
      >
        <Plus className="w-4 h-4" />
        إضافة مستند يدوياً
      </button>

      {docs.length === 0 && !editing && (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h3 className="font-bold mb-1">لسه ما رفعتش حاجة</h3>
          <p className="text-sm text-slate-400">
            أضف معلومات عن منتجاتك, خدماتك, أسعارك, أو أسئلة شائعة.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {docs.map((d) => (
          <div key={d.id} className="card p-5">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 font-semibold flex-1 min-w-0">
                <FileText className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="truncate">{d.title}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(d)}
                  className="p-1.5 text-slate-400 hover:text-white rounded"
                  title="تعديل"
                >
                  ✎
                </button>
                <button
                  onClick={() => del(d.id)}
                  className="p-1.5 text-slate-400 hover:text-red-400 rounded"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-400 line-clamp-3 whitespace-pre-wrap">
              {d.content}
            </p>
            <div className="text-xs text-slate-600 mt-2">
              {d.content.length} حرف
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="card max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editing.id ? "تعديل المستند" : "مستند جديد"}
              </h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">العنوان</label>
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="مثلاً: قائمة أسعار المنتجات"
                />
              </div>
              <div>
                <label className="label">المحتوى</label>
                <textarea
                  className="input min-h-[300px] font-mono text-sm leading-relaxed"
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  placeholder="انسخ ولصق المعلومات هنا..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="btn-ghost">
                  إلغاء
                </button>
                <button onClick={save} disabled={busy || !editing.title || !editing.content} className="btn-primary">
                  <Save className="w-4 h-4" />
                  {busy ? "..." : "حفظ"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
