"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Plus, Loader2, Check, X, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";

interface Approval {
  id: string;
  targetType: string;
  title: string;
  details: string;
  amount: number | null;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
}

const TYPES = [
  { value: "broadcast", label: "حملة بثّ" },
  { value: "coupon", label: "كوبون/خصم" },
  { value: "refund", label: "استرداد" },
  { value: "order", label: "طلب" },
  { value: "custom", label: "أخرى" },
];

const STATUS = {
  pending: { label: "بانتظار الموافقة", cls: "bg-amber-500/15 text-amber-300", icon: Clock },
  approved: { label: "موافَق", cls: "bg-emerald-500/15 text-emerald-300", icon: Check },
  rejected: { label: "مرفوض", cls: "bg-rose-500/15 text-rose-300", icon: X },
};

export default function ApprovalsUi() {
  const { success, error, info } = useToast();
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [form, setForm] = useState({ title: "", targetType: "custom", details: "", amount: "" });

  async function load() {
    setLoading(true);
    try {
      const q = tab === "pending" ? "?status=pending" : "";
      const r = await fetch(`/api/approvals${q}`, { cache: "no-store" });
      const j = await r.json();
      setItems(j.items || []);
      setPending(Boolean(j.pending));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  async function create() {
    if (!form.title.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          targetType: form.targetType,
          details: form.details,
          amount: form.amount ? Number(form.amount) : undefined,
        }),
      });
      const j = await r.json();
      if (r.ok) {
        setForm({ title: "", targetType: "custom", details: "", amount: "" });
        success("تم إرسال الطلب للموافقة");
        load();
      } else if (j.pending || r.status === 503) {
        info("الوحدة جاهزة بالكود — تحتاج تفعيل قاعدة البيانات على الخادم.");
      } else {
        error(j.error || "تعذّر الإرسال");
      }
    } finally {
      setAdding(false);
    }
  }

  async function decide(a: Approval, action: "approve" | "reject") {
    const r = await fetch(`/api/approvals/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (r.ok) {
      success(action === "approve" ? "تمت الموافقة" : "تم الرفض");
      load();
    } else if (r.status === 403) {
      error("الموافقة متاحة للمالك أو المدير فقط");
    } else {
      error("تعذّر تنفيذ القرار");
    }
  }

  const inp = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-6 p-1">
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">الموافقات</h1>
        <p className="page-desc mt-1">اطلب موافقة قبل تنفيذ إجراء حسّاس — المالك أو المدير يوافق أو يرفض.</p>
      </div>

      {pending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          الوحدة منشورة بالكود. لتفعيل الحفظ، شغّل ترحيل قاعدة البيانات على الخادم (جدول جديد فقط — لا يمسّ بياناتك).
        </div>
      )}

      <div className="card p-5">
        <h3 className="section-title mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> طلب موافقة جديد
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عنوان الطلب *" className={inp} />
          <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })} className={inp}>
            {TYPES.map((t) => <option key={t.value} value={t.value} className="bg-canvas">{t.label}</option>)}
          </select>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="المبلغ (اختياري)" type="number" className={inp} />
          <input value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="تفاصيل" className={inp} />
        </div>
        <div className="mt-3">
          <button onClick={create} disabled={adding || !form.title.trim()} className="btn-primary inline-flex items-center gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            إرسال للموافقة
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? "border border-white/[0.08] bg-white/[0.06] text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {t === "pending" ? "بانتظار الموافقة" : "الكل"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && <div className="card p-8 text-center text-slate-400">جارٍ التحميل...</div>}
        {!loading && items.length === 0 && (
          <EmptyState icon={<CheckSquare className="h-full w-full" />} title="لا توجد طلبات" description="لا توجد طلبات موافقة في هذا العرض." />
        )}
        {items.map((a) => {
          const st = STATUS[a.status];
          const StIcon = st.icon;
          return (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{a.title}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>
                      <StIcon className="h-3 w-3" /> {st.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {TYPES.find((t) => t.value === a.targetType)?.label}
                    {a.amount != null && ` · ${a.amount}`}
                    {a.requestedBy && ` · بواسطة ${a.requestedBy}`}
                  </div>
                  {a.details && <div className="mt-1 text-xs text-slate-400">{a.details}</div>}
                </div>
                {a.status === "pending" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => decide(a, "approve")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20">
                      <Check className="h-3.5 w-3.5" /> موافقة
                    </button>
                    <button onClick={() => decide(a, "reject")} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20">
                      <X className="h-3.5 w-3.5" /> رفض
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
