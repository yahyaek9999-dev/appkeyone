"use client";

import { useState, useEffect } from "react";
import { Power, PowerOff, Eye, EyeOff, FlaskConical, Zap, ZapOff, RefreshCw, Settings2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Feature {
  featureId: string;
  name: string;
  description: string;
  category: string;
  workspace: string;
  status: string;
  customerVisible: boolean;
  adminOnly: boolean;
  beta: boolean;
  killSwitch: boolean;
  rolloutPct: number;
  requiredPlan: string | null;
  releaseId: string | null;
  dependencies: string[];
}

const STATUS_LABELS: Record<string, string> = {
  enabled: "مفعّل",
  disabled: "معطّل",
  hidden: "مخفي",
  beta: "تجريبي",
  deprecated: "قديم",
};

const STATUS_COLORS: Record<string, string> = {
  enabled: "bg-emerald-500/15 text-emerald-300",
  disabled: "bg-red-500/15 text-red-300",
  hidden: "bg-slate-500/15 text-slate-400",
  beta: "bg-amber-500/15 text-amber-300",
  deprecated: "bg-orange-500/15 text-orange-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "رسائل",
  commerce: "تجارة",
  support: "دعم",
  ai: "ذكاء اصطناعي",
  settings: "الإعدادات",
  general: "عام",
  ops: "عمليات",
};

export default function FeatureControlPage() {
  const { success, error: toastError } = useToast();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/feature-control", { cache: "no-store" });
      const j = await r.json();
      if (j.features) setFeatures(j.features);
    } finally {
      setLoading(false);
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      const r = await fetch("/api/admin/feature-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      const j = await r.json();
      if (j.ok) { success(`تم تهيئة ${j.seeded} ميزة`); await load(); }
      else toastError(j.error || "فشل التهيئة");
    } finally {
      setSeeding(false);
    }
  }

  async function patch(featureId: string, update: Partial<Feature>) {
    setPending((p) => new Set(p).add(featureId));
    try {
      const r = await fetch(`/api/admin/feature-control/${featureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const j = await r.json();
      if (j.ok) {
        setFeatures((prev) => prev.map((f) => (f.featureId === featureId ? { ...f, ...j.feature } : f)));
        success("تم التحديث");
      } else {
        toastError(j.error || "فشل التحديث");
      }
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(featureId); return n; });
    }
  }

  useEffect(() => { load(); }, []);

  const categories = ["all", ...Array.from(new Set(features.map((f) => f.category)))];
  const filtered = categoryFilter === "all" ? features : features.filter((f) => f.category === categoryFilter);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="border-b border-white/[0.05] pb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title mb-1">مركز التحكم بالميزات</h1>
            <p className="page-desc">تفعيل وإيقاف وإخفاء وتقييد أي ميزة في المنصة بشكل مستقل.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-sm">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <button onClick={seed} disabled={seeding} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Settings2 className="h-3.5 w-3.5" />
              {seeding ? "جاري التهيئة..." : "تهيئة الإعدادات الافتراضية"}
            </button>
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === c
                ? "bg-brand-500 text-white"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            {c === "all" ? "الكل" : CATEGORY_LABELS[c] ?? c} ({c === "all" ? features.length : features.filter((f) => f.category === c).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Settings2 className="h-8 w-8 mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm mb-3">لا توجد ميزات بعد.</p>
          <button onClick={seed} className="btn-primary text-sm">تهيئة الميزات الافتراضية</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <FeatureRow
              key={f.featureId}
              feature={f}
              saving={pending.has(f.featureId)}
              onPatch={(u) => patch(f.featureId, u)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureRow({
  feature: f,
  saving,
  onPatch,
}: {
  feature: Feature;
  saving: boolean;
  onPatch: (u: Partial<Feature>) => void;
}) {
  return (
    <div className={`rounded-xl border ${f.killSwitch ? "border-red-500/30 bg-red-500/5" : "border-white/[0.07] bg-white/[0.02]"} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-white text-sm">{f.name}</span>
            <span className="font-mono text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded" dir="ltr">{f.featureId}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[f.status] ?? "bg-slate-500/15 text-slate-400"}`}>
              {STATUS_LABELS[f.status] ?? f.status}
            </span>
            {f.killSwitch && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">kill switch</span>}
            {f.beta && !f.killSwitch && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">تجريبي</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500">{CATEGORY_LABELS[f.category] ?? f.category}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{f.description || "—"}</p>
          {f.dependencies.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-1">يعتمد على: {f.dependencies.join(", ")}</p>
          )}
          {f.requiredPlan && (
            <p className="text-[11px] text-slate-500">يتطلب باقة: {f.requiredPlan}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Status quick-toggle */}
          <select
            value={f.status}
            disabled={saving}
            onChange={(e) => onPatch({ status: e.target.value as any })}
            className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none"
          >
            <option value="enabled">مفعّل</option>
            <option value="disabled">معطّل</option>
            <option value="hidden">مخفي</option>
            <option value="beta">تجريبي</option>
            <option value="deprecated">قديم</option>
          </select>

          {/* Customer visible toggle */}
          <button
            onClick={() => onPatch({ customerVisible: !f.customerVisible })}
            disabled={saving}
            title={f.customerVisible ? "مرئي للعملاء" : "مخفي من العملاء"}
            className={`rounded-lg p-1.5 transition-colors ${f.customerVisible ? "bg-brand-500/20 text-brand-400" : "bg-white/5 text-slate-500"}`}
          >
            {f.customerVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>

          {/* Beta toggle */}
          <button
            onClick={() => onPatch({ beta: !f.beta })}
            disabled={saving}
            title={f.beta ? "وضع تجريبي مفعّل" : "وضع تجريبي معطّل"}
            className={`rounded-lg p-1.5 transition-colors ${f.beta ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-slate-500"}`}
          >
            <FlaskConical className="h-3.5 w-3.5" />
          </button>

          {/* Kill switch */}
          <button
            onClick={() => onPatch({ killSwitch: !f.killSwitch })}
            disabled={saving}
            title={f.killSwitch ? "مفتاح الإيقاف الطارئ مفعّل — اضغط لإلغائه" : "تفعيل مفتاح الإيقاف الطارئ"}
            className={`rounded-lg p-1.5 transition-colors ${f.killSwitch ? "bg-red-500/20 text-red-400" : "bg-white/5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"}`}
          >
            {f.killSwitch ? <ZapOff className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
