"use client";

import { useEffect, useState } from "react";
import { Palette, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface WL {
  enabled: boolean;
  brandName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  customDomain: string | null;
  hideKeyone: boolean;
}

export default function WhiteLabelUi() {
  const { success, error, info } = useToast();
  const [cfg, setCfg] = useState<WL | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);

  async function load() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const r = await fetch("/api/white-label", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "load_failed");
      setCfg(j.config);
      setPending(Boolean(j.pending));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const r = await fetch("/api/white-label", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const j = await r.json();
      if (r.ok) {
        success("تم الحفظ");
        if (j.config) setCfg(j.config);
      } else if (j.pending || r.status === 503) {
        info("الوحدة جاهزة بالكود — تحتاج تفعيل قاعدة البيانات على الخادم.");
      } else {
        error(j.error || "تعذّر الحفظ");
      }
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<WL>) => setCfg((c) => (c ? { ...c, ...patch } : c));
  const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

  if (loading) {
    return <div className="card m-1 p-8 text-center text-slate-400">جارٍ التحميل...</div>;
  }
  if (loadFailed || !cfg) {
    return (
      <div className="card m-1 p-8 text-center text-slate-400">
        <p className="mb-3">تعذّر تحميل الإعدادات.</p>
        <button onClick={load} className="btn-primary">إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Palette className="h-6 w-6 text-brand-400" />
          العلامة البيضاء
        </h1>
        <p className="page-desc mt-1">اعرض المنصة بهوية علامتك التجارية لعملائك.</p>
      </div>

      {pending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          الوحدة منشورة بالكود. لتفعيل الحفظ، شغّل ترحيل قاعدة البيانات على الخادم (جدول جديد فقط — لا يمسّ بياناتك).
        </div>
      )}

      <div className="card space-y-4 p-5">
        <label className="flex items-center justify-between">
          <div>
            <div className="label">تفعيل العلامة البيضاء</div>
            <div className="text-xs text-slate-500">إظهار علامتك بدل KEYONE في الواجهة.</div>
          </div>
          <button
            onClick={() => set({ enabled: !cfg.enabled })}
            className={`relative h-6 w-11 rounded-full transition-colors ${cfg.enabled ? "bg-brand-500" : "bg-white/10"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${cfg.enabled ? "start-0.5 translate-x-0" : "end-0.5"}`} />
          </button>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="label mb-1">اسم العلامة</div>
            <input value={cfg.brandName} onChange={(e) => set({ brandName: e.target.value })} placeholder="اسم علامتك" className={inp} />
          </div>
          <div>
            <div className="label mb-1">رابط الشعار</div>
            <input value={cfg.logoUrl || ""} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="https://..." className={inp} />
          </div>
          <div>
            <div className="label mb-1">رابط الأيقونة (Favicon)</div>
            <input value={cfg.faviconUrl || ""} onChange={(e) => set({ faviconUrl: e.target.value })} placeholder="https://.../favicon.ico" className={inp} />
          </div>
          <div>
            <div className="label mb-1">اللون الأساسي</div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className="h-9 w-12 rounded border border-white/10 bg-transparent" />
              <input value={cfg.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className={inp} />
            </div>
          </div>
          <div>
            <div className="label mb-1">اللون الثانوي</div>
            <div className="flex items-center gap-2">
              <input type="color" value={cfg.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="h-9 w-12 rounded border border-white/10 bg-transparent" />
              <input value={cfg.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className={inp} />
            </div>
          </div>
          <div>
            <div className="label mb-1">بريد الدعم</div>
            <input value={cfg.supportEmail || ""} onChange={(e) => set({ supportEmail: e.target.value })} placeholder="support@yourbrand.com" className={inp} />
          </div>
          <div>
            <div className="label mb-1">هاتف الدعم</div>
            <input value={cfg.supportPhone || ""} onChange={(e) => set({ supportPhone: e.target.value })} placeholder="+20..." className={inp} />
          </div>
          <div className="sm:col-span-2">
            <div className="label mb-1">النطاق المخصّص</div>
            <input value={cfg.customDomain || ""} onChange={(e) => set({ customDomain: e.target.value })} placeholder="app.yourbrand.com" className={inp} />
            <div className="mt-1 text-xs text-slate-500">يتطلب إعداد DNS — يتواصل معك فريقنا للتفعيل.</div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={cfg.hideKeyone} onChange={(e) => set({ hideKeyone: e.target.checked })} className="accent-brand-500" />
          إخفاء اسم KEYONE من واجهة عملائي
        </label>

        <div className="pt-2">
          <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}
