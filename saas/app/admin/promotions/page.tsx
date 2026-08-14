"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Play, Pause, Trash2, BarChart2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Promotion {
  id: string;
  name: string;
  code: string | null;
  discountPct: number | null;
  discountUsd: number | null;
  freeDays: number | null;
  creditType: string | null;
  creditAmount: number | null;
  featureKey: string | null;
  customPriceUsd: number | null;
  targetPlans: string;
  newCustomersOnly: boolean;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string;
  endsAt: string | null;
  status: "draft" | "active" | "paused" | "expired";
  createdBy: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  paused: "موقوف",
  expired: "منتهي",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  expired: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const PUBLIC_TIERS = ["k_start", "k_growth", "k_pro", "k_enterprise"];

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const { success: toastSuccess, error: toastError } = useToast();

  // Create form
  const [name, setName]                 = useState("");
  const [code, setCode]                 = useState("");
  const [discountPct, setDiscountPct]   = useState("");
  const [discountUsd, setDiscountUsd]   = useState("");
  const [freeDays, setFreeDays]         = useState("");
  const [creditType, setCreditType]     = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [featureKey, setFeatureKey]     = useState("");
  const [customPrice, setCustomPrice]   = useState("");
  const [targetPlans, setTargetPlans]   = useState<string[]>([]);
  const [newOnly, setNewOnly]           = useState(false);
  const [usageLimit, setUsageLimit]     = useState("");
  const [endsAt, setEndsAt]             = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const q = filter ? `?status=${filter}` : "";
    const res = await fetch(`/api/admin/promotions${q}`).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setPromotions(data.promotions || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) { toastError("الاسم مطلوب"); return; }
    const body: any = {
      name,
      code: code || null,
      targetPlans: JSON.stringify(targetPlans),
      newCustomersOnly: newOnly,
    };
    if (discountPct)  body.discountPct   = Number(discountPct);
    if (discountUsd)  body.discountUsd   = Number(discountUsd);
    if (freeDays)     body.freeDays      = Number(freeDays);
    if (creditType)   body.creditType    = creditType;
    if (creditAmount) body.creditAmount  = Number(creditAmount);
    if (featureKey)   body.featureKey    = featureKey;
    if (customPrice)  body.customPriceUsd = Number(customPrice);
    if (usageLimit)   body.usageLimit    = Number(usageLimit);
    if (endsAt)       body.endsAt        = endsAt;

    const res = await fetch("/api/admin/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      toastSuccess("تم إنشاء العرض");
      setShowCreate(false);
      resetForm();
      load();
    } else {
      toastError(data.error || "فشل الإنشاء");
    }
  }

  function resetForm() {
    setName(""); setCode(""); setDiscountPct(""); setDiscountUsd(""); setFreeDays("");
    setCreditType(""); setCreditAmount(""); setFeatureKey(""); setCustomPrice("");
    setTargetPlans([]); setNewOnly(false); setUsageLimit(""); setEndsAt("");
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/promotions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.ok) {
      setPromotions(prev => prev.map(p => p.id === id ? { ...p, status: status as any } : p));
    } else {
      toastError(data.error || "فشل التحديث");
    }
  }

  async function deletePromo(id: string) {
    const res = await fetch(`/api/admin/promotions/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setPromotions(prev => prev.filter(p => p.id !== id));
      toastSuccess("تم حذف العرض");
    } else {
      toastError(data.error || "لا يمكن حذف عرض غير مسودة");
    }
  }

  function describeBenefit(p: Promotion): string {
    const parts: string[] = [];
    if (p.discountPct)  parts.push(`خصم ${p.discountPct}%`);
    if (p.discountUsd)  parts.push(`خصم $${p.discountUsd}`);
    if (p.freeDays)     parts.push(`${p.freeDays} يوم مجاني`);
    if (p.featureKey)   parts.push(`فتح ${p.featureKey}`);
    if (p.creditType && p.creditAmount) parts.push(`${p.creditAmount.toLocaleString()} ${p.creditType}`);
    if (p.customPriceUsd) parts.push(`سعر مخصّص $${p.customPriceUsd}`);
    return parts.join(" + ") || "—";
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">العروض والتخفيضات</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} عرض إجمالي</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> عرض جديد
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {["", "draft", "active", "paused", "expired"].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-2 text-sm transition-colors ${filter === s ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {s ? STATUS_LABELS[s] : "الكل"}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-border rounded-xl p-5 space-y-4 bg-muted/20">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" /> إنشاء عرض جديد
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">اسم العرض *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                placeholder="عرض الصيف 2026"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">كود (اختياري)</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                placeholder="SUMMER26"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">خصم %</label>
              <input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" min={0} max={100}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">خصم $ ثابت</label>
              <input type="number" value={discountUsd} onChange={e => setDiscountUsd(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" min={0}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">أيام مجانية</label>
              <input type="number" value={freeDays} onChange={e => setFreeDays(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" min={0}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">مفتاح ميزة (فتح مؤقت)</label>
              <input value={featureKey} onChange={e => setFeatureKey(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                placeholder="k1sms"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">حد الاستخدام</label>
              <input type="number" value={usageLimit} onChange={e => setUsageLimit(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" min={1}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">ينتهي في</label>
              <input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-2">الباقات المستهدفة (اختياري)</label>
            <div className="flex gap-2 flex-wrap">
              {PUBLIC_TIERS.map(t => (
                <button
                  key={t}
                  onClick={() => setTargetPlans(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${targetPlans.includes(t) ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={newOnly} onChange={e => setNewOnly(e.target.checked)} className="rounded" />
            للعملاء الجدد فقط
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={create} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
              إنشاء كمسودة
            </button>
            <button onClick={() => { setShowCreate(false); resetForm(); }} className="border border-border px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Promotions list */}
      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>
      ) : promotions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">لا توجد عروض</p>
        </div>
      ) : (
        <div className="space-y-2">
          {promotions.map(p => (
            <div key={p.id} className="flex items-center gap-4 border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{p.name}</span>
                  {p.code && <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{p.code}</code>}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {describeBenefit(p)}
                  {p.usageLimit ? ` · ${p.usedCount}/${p.usageLimit} استخدام` : ` · ${p.usedCount} استخدام`}
                  {p.endsAt ? ` · حتى ${new Date(p.endsAt).toLocaleDateString("ar-SA")}` : ""}
                  {p.newCustomersOnly ? " · جدد فقط" : ""}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {p.status === "draft" && (
                  <button onClick={() => setStatus(p.id, "active")} title="تفعيل" className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded text-emerald-600">
                    <Play className="h-4 w-4" />
                  </button>
                )}
                {p.status === "active" && (
                  <button onClick={() => setStatus(p.id, "paused")} title="إيقاف" className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded text-amber-600">
                    <Pause className="h-4 w-4" />
                  </button>
                )}
                {p.status === "paused" && (
                  <button onClick={() => setStatus(p.id, "active")} title="استئناف" className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded text-emerald-600">
                    <Play className="h-4 w-4" />
                  </button>
                )}
                {p.status === "draft" && (
                  <button onClick={() => deletePromo(p.id)} title="حذف" className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
