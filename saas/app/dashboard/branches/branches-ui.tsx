"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, Loader2, Trash2, Star, MapPin } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

interface Branch {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  city: string | null;
  managerName: string | null;
  isDefault: boolean;
  enabled: boolean;
}

export default function BranchesUi() {
  const { success, error, info } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", phone: "", managerName: "" });

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/branches", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
      setPending(Boolean(j.pending));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form.name.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (r.ok) {
        setForm({ name: "", city: "", phone: "", managerName: "" });
        success("تمت إضافة الفرع");
        load();
      } else if (j.pending || r.status === 503) {
        info("الوحدة جاهزة بالكود — تحتاج تفعيل قاعدة البيانات على الخادم.");
      } else {
        error(j.error || "تعذّرت الإضافة");
      }
    } finally {
      setAdding(false);
    }
  }

  async function makeDefault(b: Branch) {
    await fetch(`/api/branches/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    load();
  }

  async function remove(b: Branch) {
    if (!(await confirm({ title: "حذف الفرع", body: `حذف فرع "${b.name}"؟`, confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    await fetch(`/api/branches/${b.id}`, { method: "DELETE" });
    load();
  }

  const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Building2 className="h-6 w-6 text-brand-400" />
          الفروع
        </h1>
        <p className="page-desc mt-1">أدِر فروعك المتعدّدة — كل فرع برقمه ومديره وتقاريره.</p>
      </div>

      {pending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          الوحدة منشورة بالكود. لتفعيل الحفظ، شغّل ترحيل قاعدة البيانات على الخادم (جدول جديد فقط — لا يمسّ بياناتك).
        </div>
      )}

      <div className="card p-5">
        <h3 className="section-title mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> فرع جديد
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم الفرع *" className={inp} />
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="المدينة" className={inp} />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="رقم الفرع" className={inp} />
          <input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} placeholder="اسم المدير" className={inp} />
        </div>
        <div className="mt-3">
          <button onClick={create} disabled={adding || !form.name.trim()} className="btn-primary inline-flex items-center gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إضافة الفرع
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {loading && <div className="card p-8 text-center text-slate-400">جارٍ التحميل...</div>}
        {!loading && items.length === 0 && (
          <EmptyState icon={<Building2 className="h-full w-full" />} title="لا توجد فروع بعد" description="أضِف أول فرع لتبدأ إدارة مواقعك." />
        )}
        {items.map((b) => (
          <div key={b.id} className="card flex items-center justify-between p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{b.name}</span>
                {b.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] text-brand-300">
                    <Star className="h-3 w-3" /> الافتراضي
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                {b.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{b.city}</span>}
                {b.phone && <span>{b.phone}</span>}
                {b.managerName && <span>المدير: {b.managerName}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!b.isDefault && (
                <button onClick={() => makeDefault(b)} className="btn-ghost text-xs">تعيين افتراضي</button>
              )}
              <button onClick={() => remove(b)} className="btn-danger inline-flex items-center gap-1 text-xs">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
