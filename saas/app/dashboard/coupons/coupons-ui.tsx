"use client";

// Growth Suite — Coupon / Discount engine (premium, mobile responsive).

import { useEffect, useState } from "react";
import { Ticket, Plus, Loader2, Trash2, X, Sparkles, Percent, BadgeDollarSign, CalendarClock } from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";

type Coupon = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  expiresAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  offeredCount: number;
  oneTime: boolean;
  autoOffer: boolean;
  active: boolean;
  note: string | null;
  revenue: number;
  conversionPct: number;
};

const EMPTY: any = { code: "", type: "percent", value: 10, active: true, autoOffer: false, oneTime: false };


export default function CouponsUi() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const { error: toastError } = useToast();
  const confirm = useConfirm();

  async function load() {
    try {
      const r = await fetch("/api/coupons", { cache: "no-store" });
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
    if (!creating?.code?.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setCreating(null);
        load();
      } else {
        toastError(j.error || "تعذّر الحفظ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function patch(c: Coupon, data: any) {
    await fetch(`/api/coupons/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    load();
  }
  async function remove(c: Coupon) {
    if (!(await confirm({ title: "حذف كوبون", body: `حذف الكوبون ${c.code}؟`, confirmLabel: "حذف", cancelLabel: "إلغاء", danger: true }))) return;
    await fetch(`/api/coupons/${c.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Ticket className="h-6 w-6 text-gold-400" />
            الكوبونات والخصومات
          </h1>
          <p className="page-desc mt-1">أنشئ كوبونات يقدّمها النظام تلقائيًا للعملاء المترددين وفي حملات الاستعادة</p>
        </div>
        <button onClick={() => setCreating({ ...EMPTY })} className="ai-btn ai-btn-primary px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> كوبون جديد
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Ticket className="h-full w-full" />}
            title="لا توجد كوبونات بعد"
            description="أنشئ كوبونًا ليقدّمه النظام تلقائيًا للعملاء المترددين."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
            const exhausted = c.usageLimit != null && c.usedCount >= c.usageLimit;
            return (
              <div key={c.id} className={`card-hover p-4 ${!c.active || expired || exhausted ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-gold-500/30 bg-gold-500/10 px-2.5 py-1 font-mono text-sm font-bold text-gold-200">{c.code}</span>
                    <span className="text-lg font-black text-white">
                      {c.type === "percent" ? `${c.value}%` : fmtMoney(c.value)}
                    </span>
                  </div>
                  <button onClick={() => remove(c)} className="rounded-lg border border-white/10 p-1 text-slate-400 transition hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.autoOffer && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-300">
                      <Sparkles className="h-3 w-3" /> عرض تلقائي AI
                    </span>
                  )}
                  {c.oneTime && <span className="chip px-2 py-0.5 text-[10px]">مرة واحدة/عميل</span>}
                  <span className="chip px-2 py-0.5 text-[10px]">
                    <CalendarClock className="h-3 w-3" /> {fmtDate(c.expiresAt)}
                  </span>
                  {expired && <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-300">منتهي</span>}
                  {exhausted && <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">مستنفد</span>}
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center">
                  <Mini label="عُرض" value={String(c.offeredCount)} />
                  <Mini label="استُخدم" value={`${c.usedCount}${c.usageLimit != null ? "/" + c.usageLimit : ""}`} />
                  <Mini label="تحويل" value={`${c.conversionPct}%`} />
                  <Mini label="إيراد" value={fmtMoney(c.revenue)} />
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => patch(c, { autoOffer: !c.autoOffer })}
                    className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-semibold ${c.autoOffer ? "border-brand-500/30 bg-brand-500/10 text-brand-300" : "border-white/10 bg-white/5 text-slate-400"}`}
                  >
                    {c.autoOffer ? "عرض تلقائي: مفعّل" : "عرض تلقائي: متوقف"}
                  </button>
                  <button
                    onClick={() => patch(c, { active: !c.active })}
                    className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-semibold ${c.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400"}`}
                  >
                    {c.active ? "مفعّل" : "متوقف"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setCreating(null)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-title flex items-center gap-2">
                <Ticket className="h-4 w-4 text-gold-400" /> كوبون جديد
              </h3>
              <button onClick={() => setCreating(null)} className="rounded-lg border border-white/10 p-1 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">الكود</label>
                <input value={creating.code} onChange={(e) => setCreating({ ...creating, code: e.target.value.toUpperCase() })} dir="ltr" className="input px-3 py-2 text-sm font-mono" placeholder="SAVE20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">النوع</label>
                  <div className="flex gap-1.5">
                    <button onClick={() => setCreating({ ...creating, type: "percent" })} className={`flex-1 rounded-xl border px-2 py-2 text-xs ${creating.type === "percent" ? "border-gold-500/40 bg-gold-500/15 text-gold-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                      <Percent className="mx-auto h-3.5 w-3.5" /> نسبة
                    </button>
                    <button onClick={() => setCreating({ ...creating, type: "fixed" })} className={`flex-1 rounded-xl border px-2 py-2 text-xs ${creating.type === "fixed" ? "border-gold-500/40 bg-gold-500/15 text-gold-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                      <BadgeDollarSign className="mx-auto h-3.5 w-3.5" /> مبلغ
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">القيمة {creating.type === "percent" ? "(%)" : "(ج.م)"}</label>
                  <input type="number" min={0} value={creating.value} onChange={(e) => setCreating({ ...creating, value: Number(e.target.value) })} className="input px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">تاريخ الانتهاء</label>
                  <input type="date" value={creating.expiresAt || ""} onChange={(e) => setCreating({ ...creating, expiresAt: e.target.value })} className="input px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">حد الاستخدام</label>
                  <input type="number" min={1} value={creating.usageLimit || ""} onChange={(e) => setCreating({ ...creating, usageLimit: e.target.value })} className="input px-3 py-2 text-sm" placeholder="غير محدود" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={creating.autoOffer} onChange={(e) => setCreating({ ...creating, autoOffer: e.target.checked })} className="accent-brand-500" />
                  <Sparkles className="h-3.5 w-3.5 text-brand-400" /> اسمح للذكاء الاصطناعي بعرضه تلقائيًا (للمترددين / الباحثين عن خصم)
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={creating.oneTime} onChange={(e) => setCreating({ ...creating, oneTime: e.target.checked })} className="accent-brand-500" />
                  استخدام مرة واحدة لكل عميل
                </label>
              </div>
              <button onClick={save} disabled={saving || !creating.code?.trim()} className="ai-btn ai-btn-primary w-full px-4 py-2.5 text-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                إنشاء الكوبون
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-1.5">
      <div className="truncate text-xs font-bold text-white" title={value}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
