"use client";

// Growth Suite — Product Catalog management (premium, mobile responsive).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Package, Plus, Loader2, Pencil, Trash2, X, ImageIcon, Boxes, Tag as TagIcon, Link as LinkIcon } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { useMutate } from "@/components/ui/use-mutate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, HeaderFact } from "@/components/patterns/page-header";

type Product = {
  id: string;
  name: string;
  imageUrl: string | null;
  imagesJson?: string | null;
  images?: string[];
  price: number;
  compareAtPrice: number | null;
  stock: number;
  description: string | null;
  category: string | null;
  productLink: string | null;
  active: boolean;
};

/** Parse a product's stored gallery (imagesJson) into an array, falling back to imageUrl. */
function galleryOf(p: Partial<Product>): string[] {
  if (Array.isArray(p.images)) return p.images;
  try {
    const arr = JSON.parse(p.imagesJson || "[]");
    if (Array.isArray(arr) && arr.length) return arr;
  } catch { /* ignore */ }
  return p.imageUrl ? [p.imageUrl] : [];
}

const EMPTY: Partial<Product> = { name: "", price: 0, stock: 0, active: true };

export default function ProductsUi() {
  const mutate = useMutate();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [q, setQ] = useState("");
  const { error: toastError } = useToast();
  const confirm = useConfirm();

  // Device upload (drag&drop or pick) — multiple images → gated internal paths. No URL input.
  async function addImages(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setImgBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of list.slice(0, 8)) {
        const fd = new FormData();
        fd.set("image", file);
        const r = await fetch("/api/products/image", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.path) uploaded.push(j.path);
        else toastError(j.message || j.error || "تعذّر رفع الصورة");
      }
      if (uploaded.length) {
        setEditing((e) => {
          if (!e) return e;
          const next = [...galleryOf(e), ...uploaded].slice(0, 8);
          return { ...e, images: next, imageUrl: next[0] || null };
        });
      }
    } finally {
      setImgBusy(false);
    }
  }

  function removeImage(idx: number) {
    setEditing((e) => {
      if (!e) return e;
      const next = galleryOf(e).filter((_, i) => i !== idx);
      return { ...e, images: next, imageUrl: next[0] || null };
    });
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
    if (!(await mutate(`/api/products/${p.id}`, { method: "DELETE" }))) return;
    load();
  }

  async function toggleActive(p: Product) {
    if (!(await mutate(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    }))) return;
    load();
  }

  const lowStock = items.filter((p) => p.active && p.stock <= 3).length;
  const filtered = q.trim()
    ? items.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.category || "").toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <div className="space-y-6">
      <PageHeader
        divider
        eyebrow="المبيعات"
        title="كتالوج المنتجات"
        description="ما يعرفه المساعد عن ما تبيعه — الأسعار والمخزون والصور التي يرسلها للعملاء."
        meta={
          items.length > 0
            ? [
                <HeaderFact key="n" value={items.length} label="منتج" />,
                items.filter((p) => p.active).length !== items.length ? (
                  <HeaderFact key="a" value={items.filter((p) => p.active).length} label="ظاهر للعملاء" />
                ) : null,
                lowStock > 0 ? (
                  <HeaderFact key="l" value={lowStock} label="مخزون منخفض" tone="warning" />
                ) : null,
              ]
            : undefined
        }
        secondary={
          items.length > 0 ? (
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث في المنتجات..."
              aria-label="بحث في المنتجات"
              className="input h-9 w-48 px-3 text-sm"
              dir="rtl"
            />
          ) : undefined
        }
        actions={
          <button onClick={() => setEditing({ ...EMPTY })} className="btn-primary px-4 py-2 text-sm">
            <Plus className="h-4 w-4" /> منتج جديد
          </button>
        }
      />

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          variant="page"
          icon={<Package className="h-full w-full" />}
          title="كتالوجك فاضي — والمساعد ما عندوش حاجة يبيعها"
          description="المساعد يجاوب على أسئلة الأسعار والتوافر من الكتالوج ده. من غير منتجات، أي سؤال عن سعر أو مقاس بيوصل لك أنت بدل ما يترد عليه فوراً."
          hint="المتاجر اللي بتضيف أول ٥ منتجات بيرد المساعد على أغلب أسئلة العملاء من غير تدخل."
          action={
            <button onClick={() => setEditing({ ...EMPTY })} className="btn-primary px-4 py-2 text-sm">
              <Plus className="h-4 w-4" /> أضف أول منتج
            </button>
          }
          secondaryAction={
            <a href="/dashboard/settings/providers" className="btn-ghost px-4 py-2 text-sm">
              <LinkIcon className="h-4 w-4" /> استيراد من متجرك
            </a>
          }
          steps={[
            { title: "أضف المنتج", body: "الاسم والسعر والمخزون — الصورة اختيارية لكنها ترفع الرد." },
            { title: "خلّيه ظاهر", body: "المنتجات المخفية لا يعرضها المساعد على العملاء." },
            { title: "اتركه يبيع", body: "المساعد يرد بالسعر والتوافر والصورة تلقائياً." },
          ]}
        />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package className="h-full w-full" />}
            title="لا توجد نتائج مطابقة"
            description={`لا يوجد منتج يطابق "${q}". جرّب كلمة أخرى.`}
            size="md"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
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
                  <button onClick={() => setEditing(p)} className="btn-ghost flex-1 px-2 py-1.5 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${p.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400"}`}
                  >
                    {p.active ? "ظاهر" : "مخفي"}
                  </button>
                  <button onClick={() => remove(p)} aria-label={`حذف ${p.name}`} className="rounded-xl border border-white/10 px-2 py-1.5 text-slate-400 transition hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editing?.id ? "تعديل منتج" : "منتج جديد"} onClick={() => setEditing(null)}>
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-title flex items-center gap-2">
                <Package className="h-4 w-4 text-brand-400" /> {editing.id ? "تعديل منتج" : "منتج جديد"}
              </h3>
              <button onClick={() => setEditing(null)} aria-label="إغلاق" className="rounded-lg border border-white/10 p-1 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="الاسم *">
                <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input px-3 py-2 text-sm" placeholder="اسم المنتج" />
              </Field>
              <Field label={`صور المنتج (${galleryOf(editing).length}/8)`} icon={<ImageIcon className="h-3.5 w-3.5" />}>
                {galleryOf(editing).length > 0 && (
                  <div className="mb-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {galleryOf(editing).map((src, i) => (
                      <div key={src + i} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`صورة ${i + 1}`} className="h-full w-full object-cover" />
                        {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-brand-500/80 text-center text-[9px] text-white">الرئيسية</span>}
                        <button type="button" onClick={() => removeImage(i)} aria-label="حذف الصورة" className="absolute top-0.5 left-0.5 rounded bg-rose-600/90 px-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {galleryOf(editing).length < 8 && (
                  <label className="block cursor-pointer rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03] px-4 py-4 text-center text-sm text-slate-300 transition-colors hover:border-brand-400/50 hover:bg-white/[0.05]">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImages(e.target.files); e.currentTarget.value = ""; }} />
                    {imgBusy ? "جارٍ الرفع…" : "⬆️ اسحب صورًا هنا أو اضغط للاختيار من جهازك (تدعم عدة صور)"}
                  </label>
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
              <button onClick={save} disabled={saving || !editing.name?.trim()} className="btn-primary w-full px-4 py-2.5 text-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {editing.id ? "حفظ التعديلات" : "إضافة المنتج"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
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
