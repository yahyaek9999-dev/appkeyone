"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search, RefreshCw, Settings2, Eye, EyeOff, Zap,
  ZapOff, Clock, ChevronDown, LayoutList, LayoutGrid, Table2,
  Package, CheckCircle2, XCircle, AlertTriangle, Archive,
  X, Check, Filter, ChevronUp,
} from "lucide-react";
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

interface Release {
  releaseId: string;
  name: string;
  status: string;
}

type ViewMode = "list" | "table" | "category" | "release";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  enabled:    { label: "مفعّل",      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  disabled:   { label: "معطّل",      color: "text-red-400 bg-red-500/10 border-red-500/20",             icon: XCircle },
  hidden:     { label: "مخفي",       color: "text-slate-400 bg-white/5 border-white/10",                icon: EyeOff },
  beta:       { label: "تجريبي",     color: "text-amber-400 bg-amber-500/10 border-amber-500/20",       icon: AlertTriangle },
  coming_soon:{ label: "قريباً",     color: "text-sky-400 bg-sky-500/10 border-sky-500/20",             icon: Clock },
  deprecated: { label: "قديم",       color: "text-orange-400 bg-orange-500/10 border-orange-500/20",   icon: Archive },
};

const PLAN_LABELS: Record<string, string> = {
  k_start:     "Start",
  k_growth:    "Growth",
  k_pro:       "Pro",
  k_enterprise:"Enterprise",
  k_business:  "Business (legacy)",
  k_scale:     "Scale (legacy)",
};

const CATEGORY_LABELS: Record<string, string> = {
  core:         "الأساسيات",
  automation:   "الأتمتة والحملات",
  team:         "الفريق والصلاحيات",
  intelligence: "الذكاء والمبيعات",
  analytics:    "التحليلات والتقارير",
  commerce:     "التجارة والشحن",
  messaging:    "الرسائل والتواصل",
  scale:        "التوسّع والتكاملات",
  operations:   "العمليات والإدارة",
  enterprise:   "المؤسسات",
  general:      "عام",
  ops:          "عمليات",
  support:      "الدعم",
  ai:           "الذكاء الاصطناعي",
  settings:     "الإعدادات",
};

const RELEASE_STATUS_COLOR: Record<string, string> = {
  active:   "text-emerald-400",
  beta:     "text-amber-400",
  draft:    "text-slate-400",
  hidden:   "text-slate-500",
  archived: "text-orange-400",
};

export default function FeatureControlPage() {
  const { success, error: toastError } = useToast();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterRelease, setFilterRelease] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterVisibility, setFilterVisibility] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [fr, rr] = await Promise.all([
        fetch("/api/admin/feature-control", { cache: "no-store" }),
        fetch("/api/admin/releases", { cache: "no-store" }).catch(() => ({ json: async () => ({ releases: [] }) } as any)),
      ]);
      const [fj, rj] = await Promise.all([fr.json(), rr.json()]);
      if (fj.features) setFeatures(fj.features);
      if (rj.releases) setReleases(rj.releases);
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
      if (j.ok) { success(`تم تهيئة ${j.seeded} ميزة و ${j.releases} إصدار`); await load(); }
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

  const filtered = useMemo(() => {
    return features.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        if (!f.name.toLowerCase().includes(q) && !f.featureId.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) return false;
      }
      if (filterCategory !== "all" && f.category !== filterCategory) return false;
      if (filterPlan !== "all" && f.requiredPlan !== filterPlan) return false;
      if (filterRelease !== "all" && f.releaseId !== filterRelease) return false;
      if (filterStatus !== "all" && f.status !== filterStatus) return false;
      if (filterVisibility === "visible" && !f.customerVisible) return false;
      if (filterVisibility === "hidden" && f.customerVisible) return false;
      if (filterVisibility === "admin_only" && !f.adminOnly) return false;
      return true;
    });
  }, [features, search, filterCategory, filterPlan, filterRelease, filterStatus, filterVisibility]);

  // Stats
  const stats = useMemo(() => ({
    total: features.length,
    enabled: features.filter((f) => f.status === "enabled" && !f.killSwitch).length,
    beta: features.filter((f) => f.status === "beta").length,
    hidden: features.filter((f) => f.status === "hidden" || (!f.customerVisible && !f.adminOnly)).length,
    disabled: features.filter((f) => f.status === "disabled" || f.killSwitch).length,
    comingSoon: features.filter((f) => f.status === "coming_soon").length,
    deprecated: features.filter((f) => f.status === "deprecated").length,
  }), [features]);

  const categories = useMemo(() => Array.from(new Set(features.map((f) => f.category))), [features]);
  const plans = useMemo(() => Array.from(new Set(features.map((f) => f.requiredPlan).filter(Boolean))), [features]);

  const releaseMap = useMemo(() => {
    const m: Record<string, Release> = {};
    for (const r of releases) m[r.releaseId] = r;
    return m;
  }, [releases]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <h1 className="page-title mb-1">مركز الميزات</h1>
          <p className="page-desc">رؤية كاملة لكل ميزة في المنصة — حالتها، باقتها، إصدارها، ومن يراها.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-sm" disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button onClick={seed} disabled={seeding} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Settings2 className="h-3.5 w-3.5" />
            {seeding ? "جاري المزامنة..." : "مزامنة من الكتالوج"}
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        <StatChip label="إجمالي الميزات" value={stats.total} color="text-white" onClick={() => setFilterStatus("all")} />
        <StatChip label="مفعّلة" value={stats.enabled} color="text-emerald-400" onClick={() => setFilterStatus("enabled")} />
        <StatChip label="تجريبية" value={stats.beta} color="text-amber-400" onClick={() => setFilterStatus("beta")} />
        <StatChip label="مخفية" value={stats.hidden} color="text-slate-400" onClick={() => setFilterStatus("hidden")} />
        <StatChip label="معطّلة" value={stats.disabled} color="text-red-400" onClick={() => setFilterStatus("disabled")} />
        <StatChip label="قريباً" value={stats.comingSoon} color="text-sky-400" onClick={() => setFilterStatus("coming_soon")} />
        <StatChip label="قديمة" value={stats.deprecated} color="text-orange-400" onClick={() => setFilterStatus("deprecated")} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن ميزة..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pe-9 ps-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 focus:bg-white/[0.05]"
            dir="rtl"
          />
        </div>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${showFilters ? "border-brand-500/40 bg-brand-500/10 text-brand-300" : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white"}`}
        >
          <Filter className="h-3.5 w-3.5" />
          فلتر
          {(filterCategory !== "all" || filterPlan !== "all" || filterRelease !== "all" || filterStatus !== "all" || filterVisibility !== "all") && (
            <span className="ms-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] text-white font-bold">!</span>
          )}
        </button>

        {/* View mode */}
        <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5">
          {([["list", LayoutList, "قائمة"], ["table", Table2, "جدول"], ["category", LayoutGrid, "تصنيف"], ["release", Package, "إصدار"]] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              onClick={() => setViewMode(m as ViewMode)}
              title={label}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${viewMode === m ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="ms-auto text-[11px] text-slate-500">
          {filtered.length} من {features.length}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <FilterSelect label="الفئة" value={filterCategory} onChange={setFilterCategory}>
              <option value="all">كل الفئات</option>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
            </FilterSelect>
            <FilterSelect label="الباقة" value={filterPlan} onChange={setFilterPlan}>
              <option value="all">كل الباقات</option>
              {plans.map((p) => <option key={p!} value={p!}>{PLAN_LABELS[p!] ?? p}</option>)}
            </FilterSelect>
            <FilterSelect label="الإصدار" value={filterRelease} onChange={setFilterRelease}>
              <option value="all">كل الإصدارات</option>
              {releases.map((r) => <option key={r.releaseId} value={r.releaseId}>{r.name}</option>)}
            </FilterSelect>
            <FilterSelect label="الحالة" value={filterStatus} onChange={setFilterStatus}>
              <option value="all">كل الحالات</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </FilterSelect>
            <FilterSelect label="الظهور" value={filterVisibility} onChange={setFilterVisibility}>
              <option value="all">الكل</option>
              <option value="visible">مرئي للعملاء</option>
              <option value="hidden">مخفي عن العملاء</option>
              <option value="admin_only">مشرف فقط</option>
            </FilterSelect>
          </div>
          <button
            onClick={() => { setFilterCategory("all"); setFilterPlan("all"); setFilterRelease("all"); setFilterStatus("all"); setFilterVisibility("all"); }}
            className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            مسح الفلاتر
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/[0.02] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 && features.length === 0 ? (
        <EmptyState onSeed={seed} seeding={seeding} />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">لا توجد نتائج — جرّب فلتراً مختلفاً.</div>
      ) : viewMode === "table" ? (
        <TableView features={filtered} pending={pending} onPatch={patch} releaseMap={releaseMap} />
      ) : viewMode === "category" ? (
        <CategoryView features={filtered} categories={categories} releases={releases} pending={pending} onPatch={patch} releaseMap={releaseMap} editingId={editingId} setEditingId={setEditingId} />
      ) : viewMode === "release" ? (
        <ReleaseView features={filtered} releases={releases} pending={pending} onPatch={patch} releaseMap={releaseMap} editingId={editingId} setEditingId={setEditingId} />
      ) : (
        <ListView features={filtered} pending={pending} onPatch={patch} releases={releases} releaseMap={releaseMap} editingId={editingId} setEditingId={setEditingId} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-right transition-colors hover:border-white/[0.10] hover:bg-white/[0.04]"
    >
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{label}</div>
    </button>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-slate-500">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-6 text-xs text-slate-300 focus:outline-none focus:border-brand-500/50"
      >
        {children}
      </select>
    </div>
  );
}

function EmptyState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Settings2 className="h-10 w-10 text-slate-600 mb-4" />
      <h3 className="text-sm font-semibold text-white mb-2">السجل فارغ</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-sm">لا توجد ميزات مسجّلة بعد. اضغط "مزامنة من الكتالوج" لتهيئة السجل من الكتالوج الرسمي.</p>
      <button onClick={onSeed} disabled={seeding} className="btn-primary">
        {seeding ? "جاري التهيئة..." : "تهيئة الميزات"}
      </button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, killSwitch }: { status: string; killSwitch: boolean }) {
  const s = killSwitch ? "disabled" : status;
  const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.hidden;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {killSwitch ? "مفتاح الإيقاف" : cfg.label}
    </span>
  );
}

// ── Action toolbar per feature ────────────────────────────────────────────────
function ActionBar({
  feature: f, pending: saving, onPatch, compact = false,
}: {
  feature: Feature;
  pending: boolean;
  onPatch: (u: Partial<Feature>) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : ""}`}>
      {/* Quick status */}
      <select
        value={f.status}
        disabled={saving}
        onChange={(e) => onPatch({ status: e.target.value })}
        className="rounded-lg border border-white/[0.08] bg-[#0a1628] py-1 ps-2 pe-5 text-[11px] text-slate-300 focus:outline-none focus:border-brand-500/50"
      >
        <option value="enabled">مفعّل</option>
        <option value="disabled">معطّل</option>
        <option value="hidden">مخفي</option>
        <option value="beta">تجريبي</option>
        <option value="coming_soon">قريباً</option>
        <option value="deprecated">قديم</option>
      </select>

      {/* Visibility */}
      <button
        onClick={() => onPatch({ customerVisible: !f.customerVisible })}
        disabled={saving}
        title={f.customerVisible ? "مرئي للعملاء — اضغط للإخفاء" : "مخفي من العملاء — اضغط للإظهار"}
        className={`rounded-lg border p-1.5 transition-colors ${f.customerVisible ? "border-brand-500/30 bg-brand-500/10 text-brand-400" : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300"}`}
      >
        {f.customerVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>

      {/* Kill switch */}
      <button
        onClick={() => onPatch({ killSwitch: !f.killSwitch })}
        disabled={saving}
        title={f.killSwitch ? "إيقاف الطوارئ مفعّل — اضغط للإلغاء" : "تفعيل إيقاف الطوارئ"}
        className={`rounded-lg border p-1.5 transition-colors ${f.killSwitch ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:border-red-500/30 hover:text-red-400"}`}
      >
        {f.killSwitch ? <ZapOff className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────
function ListView({
  features, pending, onPatch, releases, releaseMap, editingId, setEditingId,
}: {
  features: Feature[];
  pending: Set<string>;
  onPatch: (id: string, u: Partial<Feature>) => void;
  releases: Release[];
  releaseMap: Record<string, Release>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      {features.map((f) => (
        <FeatureRow
          key={f.featureId}
          feature={f}
          saving={pending.has(f.featureId)}
          onPatch={(u) => onPatch(f.featureId, u)}
          releases={releases}
          release={f.releaseId ? releaseMap[f.releaseId] : undefined}
          expanded={editingId === f.featureId}
          onToggleExpand={() => setEditingId(editingId === f.featureId ? null : f.featureId)}
        />
      ))}
    </div>
  );
}

function FeatureRow({
  feature: f, saving, onPatch, releases, release, expanded, onToggleExpand,
}: {
  feature: Feature;
  saving: boolean;
  onPatch: (u: Partial<Feature>) => void;
  releases: Release[];
  release?: Release;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [editName, setEditName] = useState(f.name);
  const [editDesc, setEditDesc] = useState(f.description);
  const [editPlan, setEditPlan] = useState(f.requiredPlan ?? "");
  const [editRelease, setEditRelease] = useState(f.releaseId ?? "");
  const [editRollout, setEditRollout] = useState(f.rolloutPct);

  return (
    <div className={`rounded-xl border transition-colors ${f.killSwitch ? "border-red-500/25 bg-red-500/[0.03]" : expanded ? "border-white/[0.12] bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.09]"}`}>
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-3 p-3.5">
        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white text-sm">{f.name}</span>
            <StatusBadge status={f.status} killSwitch={f.killSwitch} />
            {f.adminOnly && <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400">مشرف فقط</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="bg-white/[0.03] border border-white/[0.06] rounded px-1.5 py-0.5">{CATEGORY_LABELS[f.category] ?? f.category}</span>
            {f.requiredPlan && (
              <span className={`rounded-full border px-2 py-0.5 font-medium ${
                f.requiredPlan === "k_enterprise" ? "border-violet-500/25 bg-violet-500/10 text-violet-300" :
                f.requiredPlan === "k_pro"        ? "border-brand-500/25 bg-brand-500/10 text-brand-300" :
                f.requiredPlan === "k_growth"     ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" :
                "border-white/[0.10] bg-white/[0.04] text-slate-300"
              }`}>{PLAN_LABELS[f.requiredPlan] ?? f.requiredPlan}</span>
            )}
            {release && (
              <span>الإصدار: <span className={RELEASE_STATUS_COLOR[release.status] ?? "text-slate-400"}>{release.name}</span></span>
            )}
            {f.rolloutPct < 100 && <span className="text-amber-500">{f.rolloutPct}% انتشار</span>}
            {f.dependencies.length > 0 && <span className="truncate max-w-[200px]">يعتمد على: {f.dependencies.join(", ")}</span>}
          </div>
        </div>

        {/* Actions */}
        <ActionBar feature={f} pending={saving} onPatch={onPatch} />

        {/* Expand */}
        <button
          onClick={onToggleExpand}
          className="rounded-lg border border-white/[0.08] p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-4">
          {/* Row 1: name + description */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">اسم الميزة</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
                dir="rtl"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">الوصف</label>
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
                dir="rtl"
              />
            </div>
          </div>

          {/* Row 2: plan + release + rollout */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">الحد الأدنى للباقة</label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-6 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
              >
                <option value="">بدون قيد (جميع الباقات)</option>
                <option value="k_start">Start</option>
                <option value="k_growth">Growth</option>
                <option value="k_pro">Pro</option>
                <option value="k_enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">الإصدار</label>
              <select
                value={editRelease}
                onChange={(e) => setEditRelease(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-6 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
              >
                <option value="">غير مرتبط بإصدار</option>
                {releases.map((r) => (
                  <option key={r.releaseId} value={r.releaseId}>{r.name} ({r.status})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>نسبة الانتشار</span>
                <span className="font-mono text-white">{editRollout}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={editRollout}
                onChange={(e) => setEditRollout(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onPatch({
                  name: editName,
                  description: editDesc,
                  requiredPlan: editPlan || null,
                  releaseId: editRelease || null,
                  rolloutPct: editRollout,
                });
                onToggleExpand();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500/20 border border-brand-500/30 px-3 py-1.5 text-sm text-brand-300 hover:bg-brand-500/30 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />حفظ
            </button>
            <button onClick={onToggleExpand} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors">
              <X className="h-3.5 w-3.5" />إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────
function TableView({
  features, pending, onPatch, releaseMap,
}: {
  features: Feature[];
  pending: Set<string>;
  onPatch: (id: string, u: Partial<Feature>) => void;
  releaseMap: Record<string, Release>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            {["الميزة", "الفئة", "الحالة", "الباقة", "الإصدار", "ظهور", "إجراءات"].map((h) => (
              <th key={h} className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {features.map((f) => {
            const release = f.releaseId ? releaseMap[f.releaseId] : undefined;
            const saving = pending.has(f.featureId);
            return (
              <tr key={f.featureId} className={`transition-colors hover:bg-white/[0.02] ${f.killSwitch ? "bg-red-500/[0.02]" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-white text-sm">{f.name}</div>
                  <div className="font-mono text-[10px] text-slate-600" dir="ltr">{f.featureId}</div>
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-400">{CATEGORY_LABELS[f.category] ?? f.category}</td>
                <td className="px-4 py-3"><StatusBadge status={f.status} killSwitch={f.killSwitch} /></td>
                <td className="px-4 py-3 text-[11px] text-slate-400">{f.requiredPlan ? PLAN_LABELS[f.requiredPlan] ?? f.requiredPlan : "—"}</td>
                <td className="px-4 py-3 text-[11px]">
                  {release ? <span className={RELEASE_STATUS_COLOR[release.status]}>{release.name}</span> : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] ${f.customerVisible ? "text-emerald-400" : "text-slate-600"}`}>
                    {f.customerVisible ? "عملاء" : f.adminOnly ? "مشرف" : "مخفي"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <select
                      value={f.status}
                      disabled={saving}
                      onChange={(e) => onPatch(f.featureId, { status: e.target.value })}
                      className="rounded-lg border border-white/[0.08] bg-[#0a1628] py-1 ps-1.5 pe-4 text-[11px] text-slate-300 focus:outline-none"
                    >
                      <option value="enabled">مفعّل</option>
                      <option value="disabled">معطّل</option>
                      <option value="hidden">مخفي</option>
                      <option value="beta">تجريبي</option>
                      <option value="coming_soon">قريباً</option>
                      <option value="deprecated">قديم</option>
                    </select>
                    <button
                      onClick={() => onPatch(f.featureId, { killSwitch: !f.killSwitch })}
                      disabled={saving}
                      className={`rounded p-1 transition-colors ${f.killSwitch ? "text-red-400 bg-red-500/10" : "text-slate-600 hover:text-red-400"}`}
                      title="Kill switch"
                    >
                      {f.killSwitch ? <ZapOff className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Category view ─────────────────────────────────────────────────────────────
function CategoryView({ features, categories, releases, pending, onPatch, releaseMap, editingId, setEditingId }: {
  features: Feature[];
  categories: string[];
  releases: Release[];
  pending: Set<string>;
  onPatch: (id: string, u: Partial<Feature>) => void;
  releaseMap: Record<string, Release>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const byCategory = useMemo(() => {
    const m: Record<string, Feature[]> = {};
    for (const f of features) {
      (m[f.category] = m[f.category] ?? []).push(f);
    }
    return m;
  }, [features]);

  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([cat, fts]) => (
        <div key={cat}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat] ?? cat}</span>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">{fts.length}</span>
          </div>
          <div className="space-y-1">
            {fts.map((f) => (
              <FeatureRow
                key={f.featureId}
                feature={f}
                saving={pending.has(f.featureId)}
                onPatch={(u) => onPatch(f.featureId, u)}
                releases={releases}
                release={f.releaseId ? releaseMap[f.releaseId] : undefined}
                expanded={editingId === f.featureId}
                onToggleExpand={() => setEditingId(editingId === f.featureId ? null : f.featureId)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Release view ──────────────────────────────────────────────────────────────
function ReleaseView({ features, releases, pending, onPatch, releaseMap, editingId, setEditingId }: {
  features: Feature[];
  releases: Release[];
  pending: Set<string>;
  onPatch: (id: string, u: Partial<Feature>) => void;
  releaseMap: Record<string, Release>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}) {
  const byRelease = useMemo(() => {
    const m: Record<string, Feature[]> = {};
    for (const f of features) {
      const key = f.releaseId ?? "_unassigned";
      (m[key] = m[key] ?? []).push(f);
    }
    return m;
  }, [features]);

  const releaseOrder = [...releases.map((r) => r.releaseId), "_unassigned"];

  return (
    <div className="space-y-4">
      {releaseOrder.filter((rid) => byRelease[rid]?.length).map((rid) => {
        const rel = rid === "_unassigned" ? null : releaseMap[rid];
        const fts = byRelease[rid] ?? [];
        return (
          <div key={rid}>
            <div className="mb-2 flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-semibold text-white">{rel ? rel.name : "غير مرتبط بإصدار"}</span>
              {rel && <span className={`text-[11px] rounded-full border px-2 py-0.5 ${RELEASE_STATUS_COLOR[rel.status] ?? "text-slate-400"} border-white/[0.08] bg-white/[0.03]`}>{rel.status}</span>}
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400">{fts.length} ميزة</span>
            </div>
            <div className="space-y-1">
              {fts.map((f) => (
                <FeatureRow
                  key={f.featureId}
                  feature={f}
                  saving={pending.has(f.featureId)}
                  onPatch={(u) => onPatch(f.featureId, u)}
                  releases={releases}
                  release={rel ?? undefined}
                  expanded={editingId === f.featureId}
                  onToggleExpand={() => setEditingId(editingId === f.featureId ? null : f.featureId)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
