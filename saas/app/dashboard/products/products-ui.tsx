"use client";

// Growth Suite — Product Catalog management (premium, mobile responsive).

import { useEffect, useState } from "react";
import { Package, Plus, Loader2, Pencil, Trash2, X, ImageIcon, Boxes, Tag as TagIcon, Link as LinkIcon } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import ImageDropzone from "@/components/ui/image-dropzone";

type Product = {
  id: string;
  name: string;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  description: string | null;
  category: string | null;
  productLink: string | null;
  active: boolean;
};

const EMPTY: Partial<Product> = { name: "", price: 0, stock: 0, active: true };

export default function ProductsUi() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const { error: toastError } = useToast();
  const confirm = useConfirm();

  // Device upload (drag&drop or pick) → store the gated internal path. No URL input.
  async function uploadImage(file: File | null) {
    if (!file) { setEditing((e) => (e ? { ...e, imageUrl: null } : e)); return; }
    setImgBusy(true);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const r = await fetch("/api/products/image", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.path) {
        setEditing((e) => (e ? { ...e, imageUrl: j.path } : e));
      } else {
        toastError(j.message || j.error || "تعذّر رفع الصورة");
      }
    } finally {
      setImgBusy(false);
    }
  }

  async function load() {
    try {
      const r = await fetch("/api/products", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing?.name?.trim()) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const r = await fetch(isNew ? "/api/products" : `/api/products/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (r.ok) {
        setEditing(null);
        load();
      } else {
        const j = await r.json().catch(() => ({}));
        toastError(j.error || "تعذّر الحفظ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Product) {
    if (!(await confirm({ title: "حذف منتج", body: `حذف "${p.name}"؟`, confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    load();
  }

  async function toggleActive(p: Product) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  }

  const lowStock = items.filter((p) => p.active && p.stock <= 3).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package className="h-6 w-6 text-brand-400" />
            كتالوج المنتجات
          </h1>
          <p className="page-desc mt-1">
            أضف منتجاتك ليعرضها المساعد للعملاء كبطاقات داخل واتساب — {items.length} منتج
            {lowStock > 0 && <span className="text-amber-300"> · {lowStock} مخزون منخفض</span>}
          </p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="ai-btn ai-btn-primary px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> منتج جديد
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package className="h-full w-full" />}
            title="لا توجد منتجات بعد"
            description="أضف أول منتج ليبدأ المساعد بعرضه للعملاء."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className={`card-hover overflow-hidden ${!p.active ? "opacity-60" : ""}`}>
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-white/[0.03]">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-600">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                {p.stock <= 3 && (
                  <span className="absolute right-2 top-2 rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                    مخزون {p.stock}
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate text-sm font-semibold text-white">{p.name}</div>
                  {p.category && <span className="chip shrink-0 px-2 py-0.5 text-[10px]">{p.category}</span>}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base font-bold text-brand-300">{fmtMoney(p.price)}</span>
                  {p.compareAtPrice ? <span className="text-xs text-slate-500 line-through">{fmtMoney(p.compareAtPrice)}</span> : null}
                </div>
                {p.description && <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{p.description}</p>}
                <div className="mt-3 flex items-center gap-1.5">
                  <button onClick={() => setEditing(p)} className="ai-btn ai-btn-ghost flex-1 px-2 py-1.5 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${p.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400"}`}
                  >
                    {p.active ? "ظاهر" : "مخفي"}
                  </button>
                  <button onClick={() => remove(p)} className="rounded-xl border border-white/10 px-2 py-1.5 text-slate-400 transition hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-title flex items-center gap-2">
                <Package className="h-4 w-4 text-brand-400" /> {editing.id ? "تعديل منتج" : "منتج جديد"}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-lg border border-white/10 p-1 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="الاسم *">
                <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input px-3 py-2 text-sm" placeholder="اسم المنتج" />
              </Field>
              <Field label="صورة المنتج" icon={<ImageIcon className="h-3.5 w-3.5" />}>
                {editing.imageUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editing.imageUrl} alt="معاينة" className="h-16 w-16 rounded-lg border border-white/10 object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-emerald-300">✓ تم اختيار الصورة</div>
                      <button type="button" onClick={() => setEditing({ ...editing, imageUrl: null })} className="mt-1.5 rounded bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20">حذف / تغيير</button>
                    </div>
                  </div>
                ) : (
                  <ImageDropzone onFile={uploadImage} compact hint={imgBusy ? "جارٍ الرفع…" : "اسحب صورة المنتج هنا أو اضغط للاختيار من جهازك"} />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="السعر (ج.م)">
                  <input type="number" min={0} value={editing.price ?? 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} className="input px-3 py-2 text-sm" />
                </Field>
                <Field label="السعر قبل الخصم">
                  <input type="number" min={0} value={editing.compareAtPrice ?? ""} onChange={(e) => setEditing({ ...editing, compareAtPrice: e.target.value === "" ? null : Number(e.target.value) })} className="input px-3 py-2 text-sm" placeholder="اختياري" />
                </Field>
                <Field label="المخزون" icon={<Boxes className="h-3.5 w-3.5" />}>
                  <input type="number" min={0} value={editing.stock ?? 0} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} className="input px-3 py-2 text-sm" />
                </Field>
                <Field label="الفئة" icon={<TagIcon className="h-3.5 w-3.5" />}>
                  <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="input px-3 py-2 text-sm" placeholder="اختياري" />
                </Field>
              </div>
              <Field label="وصف قصير">
                <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} className="input resize-none px-3 py-2 text-sm" placeholder="وصف يظهر في بطاقة المنتج" />
              </Field>
              <Field label="رابط المنتج" icon={<LinkIcon className="h-3.5 w-3.5" />}>
                <input value={editing.productLink || ""} onChange={(e) => setEditing({ ...editing, productLink: e.target.value })} dir="ltr" className="input px-3 py-2 text-sm" placeholder="https://..." />
              </Field>
              <button onClick={save} disabled={saving || !editing.name?.trim()} className="ai-btn ai-btn-primary w-full px-4 py-2.5 text-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editing.id ? "حفظ التعديلات" : "إضافة المنتج"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs text-slate-400">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
