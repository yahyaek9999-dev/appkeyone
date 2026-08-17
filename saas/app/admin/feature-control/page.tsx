"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, RefreshCw, Settings2, Eye, EyeOff, Zap,
  ZapOff, Clock, ChevronDown, LayoutList, Table2,
  Package, CheckCircle2, XCircle, AlertTriangle, Archive,
  X, Check, Filter, ChevronUp, ChevronRight,
  Layers, Save,
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

type ViewMode = "table" | "category" | "release";

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; icon: React.ComponentType<any> }> = {
  enabled:    { label: "مفعّل",  color: "text-emerald-400", dot: "bg-emerald-400", icon: CheckCircle2 },
  disabled:   { label: "معطّل",  color: "text-red-400",     dot: "bg-red-400",     icon: XCircle },
  hidden:     { label: "مخفي",   color: "text-slate-400",   dot: "bg-slate-500",   icon: EyeOff },
  beta:       { label: "تجريبي", color: "text-amber-400",   dot: "bg-amber-400",   icon: AlertTriangle },
  coming_soon:{ label: "قريباً", color: "text-sky-400",     dot: "bg-sky-400",     icon: Clock },
  deprecated: { label: "قديم",   color: "text-orange-400",  dot: "bg-orange-400",  icon: Archive },
};

const PLAN_CONFIG: Record<string, { label: string; color: string }> = {
  k_start:     { label: "Start",      color: "text-slate-300 bg-slate-500/10 border-slate-500/20" },
  k_growth:    { label: "Growth",     color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
  k_pro:       { label: "Pro",        color: "text-brand-300 bg-brand-500/10 border-brand-500/20" },
  k_enterprise:{ label: "Enterprise", color: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
  k_business:  { label: "Business",   color: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
  k_scale:     { label: "Scale",      color: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
};

const CATEGORY_LABELS: Record<string, string> = {
  core: "الأساسيات", automation: "الأتمتة", team: "الفريق",
  intelligence: "الذكاء", analytics: "التحليلات", commerce: "التجارة",
  messaging: "الرسائل", scale: "التوسّع", operations: "العمليات",
  enterprise: "المؤسسات", general: "عام", ops: "عمليات", support: "الدعم",
  ai: "الذكاء الاصطناعي", settings: "الإعدادات",
};

const RELEASE_STATUS: Record<string, string> = {
  active: "text-emerald-400", beta: "text-amber-400",
  draft: "text-slate-400", hidden: "text-slate-500", archived: "text-orange-400",
};

export default function FeatureControlPage() {
  const { success, error: toastError } = useToast();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterRelease, setFilterRelease] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [drawer, setDrawer] = useState<Feature | null>(null);
  const [drawerEdits, setDrawerEdits] = useState<Partial<Feature>>({});

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      const j = await r.json();
      if (j.ok) { success(`تم تهيئة ${j.seeded} ميزة`); await load(); }
      else toastError(j.error || "فشل التهيئة");
    } finally { setSeeding(false); }
  }

  async function patch(featureId: string, update: Partial<Feature>) {
    setPending((p) => new Set(p).add(featureId));
    try {
      const r = await fetch(`/api/admin/feature-control/${featureId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const j = await r.json();
      if (j.ok) {
        setFeatures((prev) => prev.map((f) => (f.featureId === featureId ? { ...f, ...j.feature } : f)));
        if (drawer?.featureId === featureId) setDrawer((d) => d ? { ...d, ...j.feature } : d);
        success("تم التحديث");
      } else {
        toastError(j.error || "فشل التحديث");
      }
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(featureId); return n; });
    }
  }

  function openDrawer(f: Feature) {
    setDrawer(f);
    setDrawerEdits({
      name: f.name, description: f.description,
      requiredPlan: f.requiredPlan ?? undefined,
      releaseId: f.releaseId ?? undefined,
      rolloutPct: f.rolloutPct,
      status: f.status,
      customerVisible: f.customerVisible,
      killSwitch: f.killSwitch,
    });
  }

  async function saveDrawer() {
    if (!drawer) return;
    await patch(drawer.featureId, drawerEdits);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => features.filter((f) => {
    if (search) {
      const q = search.toLowerCase();
      if (!f.name.toLowerCase().includes(q) && !f.featureId.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) return false;
    }
    if (filterCategory !== "all" && f.category !== filterCategory) return false;
    if (filterPlan !== "all" && f.requiredPlan !== filterPlan) return false;
    if (filterRelease !== "all" && f.releaseId !== filterRelease) return false;
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    return true;
  }), [features, search, filterCategory, filterPlan, filterRelease, filterStatus]);

  const stats = useMemo(() => ({
    total: features.length,
    enabled: features.filter((f) => f.status === "enabled" && !f.killSwitch).length,
    beta: features.filter((f) => f.status === "beta").length,
    disabled: features.filter((f) => f.status === "disabled" || f.killSwitch).length,
    comingSoon: features.filter((f) => f.status === "coming_soon").length,
  }), [features]);

  const categories = useMemo(() => Array.from(new Set(features.map((f) => f.category))).sort(), [features]);
  const releaseMap = useMemo(() => {
    const m: Record<string, Release> = {};
    for (const r of releases) m[r.releaseId] = r;
    return m;
  }, [releases]);

  const hasFilters = filterCategory !== "all" || filterPlan !== "all" || filterRelease !== "all" || filterStatus !== "all";

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title mb-0.5">مركز الميزات</h1>
            <p className="page-desc">{stats.total} ميزة — {stats.enabled} مفعّلة · {stats.beta} تجريبية · {stats.comingSoon} قريباً · {stats.disabled} معطّلة</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-sm">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </button>
            <button onClick={seed} disabled={seeding} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Settings2 className="h-3.5 w-3.5" />
              {seeding ? "مزامنة..." : "مزامنة من الكتالوج"}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الميزة أو المعرّف..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pe-8 ps-3 text-sm text-white placeholder-slate-500 focus:border-brand-500/40 focus:outline-none"
              dir="rtl"
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${showFilters || hasFilters ? "border-brand-500/40 bg-brand-500/10 text-brand-300" : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:text-white"}`}
          >
            <Filter className="h-3.5 w-3.5" />
            فلتر
            {hasFilters && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">!</span>}
          </button>

          {/* View mode */}
          <div className="ms-auto flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
            {([["table", Table2, "جدول"], ["category", Layers, "تصنيف"], ["release", Package, "إصدار"]] as const).map(([m, Icon, label]) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                title={label}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs transition-colors ${viewMode === m ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-500">{filtered.length}/{features.length}</span>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            {[
              { label: "الفئة", value: filterCategory, set: setFilterCategory, opts: [["all", "كل الفئات"], ...categories.map((c) => [c, CATEGORY_LABELS[c] ?? c])] },
              { label: "الباقة", value: filterPlan, set: setFilterPlan, opts: [["all", "كل الباقات"], ...Object.entries(PLAN_CONFIG).map(([k, v]) => [k, v.label])] },
              { label: "الإصدار", value: filterRelease, set: setFilterRelease, opts: [["all", "كل الإصدارات"], ...releases.map((r) => [r.releaseId, r.name])] },
              { label: "الحالة", value: filterStatus, set: setFilterStatus, opts: [["all", "كل الحالات"], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])] },
            ].map(({ label, value, set, opts }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500">{label}</span>
                <select
                  value={value}
                  onChange={(e) => (set as any)(e.target.value)}
                  className="rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-6 text-xs text-slate-300 focus:outline-none"
                >
                  {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            ))}
            <button onClick={() => { setFilterCategory("all"); setFilterPlan("all"); setFilterRelease("all"); setFilterStatus("all"); }} className="text-xs text-slate-500 hover:text-slate-300">
              مسح
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-1">{[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/[0.02] animate-pulse" />)}</div>
        ) : filtered.length === 0 && features.length === 0 ? (
          <EmptyState onSeed={seed} seeding={seeding} />
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">لا توجد نتائج</div>
        ) : viewMode === "category" ? (
          <CategoryView features={filtered} categories={categories} releaseMap={releaseMap} pending={pending} onPatch={patch} onOpen={openDrawer} selected={drawer?.featureId} />
        ) : viewMode === "release" ? (
          <ReleaseView features={filtered} releases={releases} releaseMap={releaseMap} pending={pending} onPatch={patch} onOpen={openDrawer} selected={drawer?.featureId} />
        ) : (
          <FeatureTable features={filtered} releaseMap={releaseMap} pending={pending} onPatch={patch} onOpen={openDrawer} selected={drawer?.featureId} />
        )}
      </div>

      {/* Side drawer */}
      {drawer && (
        <div className="ms-4 flex w-[320px] shrink-0 flex-col rounded-2xl border border-white/[0.09] bg-white/[0.03] backdrop-blur-xl">
          {/* Drawer header */}
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white text-sm leading-snug">{drawer.name}</div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-600" dir="ltr">{drawer.featureId}</div>
            </div>
            <button onClick={() => setDrawer(null)} className="rounded-lg p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {/* Status + kill switch */}
            <div className="space-y-2">
              <DrawerLabel>الحالة</DrawerLabel>
              <div className="flex items-center gap-2">
                <select
                  value={drawerEdits.status ?? drawer.status}
                  onChange={(e) => setDrawerEdits((d) => ({ ...d, status: e.target.value }))}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-5 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
                >
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button
                  onClick={() => setDrawerEdits((d) => ({ ...d, killSwitch: !(drawerEdits.killSwitch ?? drawer.killSwitch) }))}
                  title={drawerEdits.killSwitch ?? drawer.killSwitch ? "إيقاف الطوارئ مفعّل" : "تفعيل إيقاف الطوارئ"}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${(drawerEdits.killSwitch ?? drawer.killSwitch) ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-red-500/30 hover:text-red-400"}`}
                >
                  <ZapOff className="h-3.5 w-3.5" />
                  إيقاف
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <DrawerLabel>الاسم</DrawerLabel>
              <input
                value={drawerEdits.name ?? drawer.name}
                onChange={(e) => setDrawerEdits((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
                dir="rtl"
              />
            </div>

            {/* Description */}
            <div>
              <DrawerLabel>الوصف</DrawerLabel>
              <textarea
                value={drawerEdits.description ?? drawer.description}
                onChange={(e) => setDrawerEdits((d) => ({ ...d, description: e.target.value }))}
                rows={2}
                className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
                dir="rtl"
              />
            </div>

            {/* Plan */}
            <div>
              <DrawerLabel>الحد الأدنى للباقة</DrawerLabel>
              <select
                value={drawerEdits.requiredPlan ?? drawer.requiredPlan ?? ""}
                onChange={(e) => setDrawerEdits((d) => ({ ...d, requiredPlan: e.target.value || undefined }))}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-5 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
              >
                <option value="">جميع الباقات</option>
                {Object.entries(PLAN_CONFIG).filter(([k]) => !k.includes("business") && !k.includes("scale")).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Release */}
            <div>
              <DrawerLabel>الإصدار</DrawerLabel>
              <select
                value={drawerEdits.releaseId ?? drawer.releaseId ?? ""}
                onChange={(e) => setDrawerEdits((d) => ({ ...d, releaseId: e.target.value || undefined }))}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] py-1.5 ps-2 pe-5 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
              >
                <option value="">غير مرتبط</option>
                {releases.map((r) => <option key={r.releaseId} value={r.releaseId}>{r.name}</option>)}
              </select>
            </div>

            {/* Rollout */}
            <div>
              <DrawerLabel>
                <span>نسبة الانتشار</span>
                <span className="ms-auto font-mono text-white">{drawerEdits.rolloutPct ?? drawer.rolloutPct}%</span>
              </DrawerLabel>
              <input
                type="range" min={0} max={100}
                value={drawerEdits.rolloutPct ?? drawer.rolloutPct}
                onChange={(e) => setDrawerEdits((d) => ({ ...d, rolloutPct: Number(e.target.value) }))}
                className="w-full accent-brand-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>

            {/* Customer visible */}
            <div className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2.5">
              <span className="text-sm text-slate-300">مرئي للعملاء</span>
              <button
                onClick={() => setDrawerEdits((d) => ({ ...d, customerVisible: !(drawerEdits.customerVisible ?? drawer.customerVisible) }))}
                className={`relative h-5 w-9 rounded-full transition-colors ${(drawerEdits.customerVisible ?? drawer.customerVisible) ? "bg-brand-500" : "bg-white/[0.08]"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${(drawerEdits.customerVisible ?? drawer.customerVisible) ? "start-4" : "start-0.5"}`} />
              </button>
            </div>

            {/* Dependencies */}
            {drawer.dependencies.length > 0 && (
              <div>
                <DrawerLabel>يعتمد على</DrawerLabel>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {drawer.dependencies.map((d) => (
                    <span key={d} className="rounded-md bg-white/[0.04] border border-white/[0.07] px-2 py-0.5 font-mono text-[10px] text-slate-400">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Category / workspace */}
            <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3 space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">الفئة</span>
                <span className="text-slate-300">{CATEGORY_LABELS[drawer.category] ?? drawer.category}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">لوحة العمل</span>
                <span className="text-slate-300">{drawer.workspace}</span>
              </div>
            </div>
          </div>

          {/* Drawer footer */}
          <div className="border-t border-white/[0.06] p-4">
            <button
              onClick={saveDrawer}
              disabled={pending.has(drawer.featureId)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500/20 border border-brand-500/30 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/30 transition-colors disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {pending.has(drawer.featureId) ? "جاري الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared table component ─────────────────────────────────────────────────────

function FeatureTable({
  features, releaseMap, pending, onPatch, onOpen, selected,
}: {
  features: Feature[];
  releaseMap: Record<string, Release>;
  pending: Set<string>;
  onPatch: (id: string, u: Partial<Feature>) => void;
  onOpen: (f: Feature) => void;
  selected?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.015]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {["الميزة", "الفئة", "الحالة", "الباقة", "الإصدار", "الظهور", ""].map((h) => (
              <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${h ? "text-start" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {features.map((f) => (
            <TableRow
              key={f.featureId}
              feature={f}
              release={f.releaseId ? releaseMap[f.releaseId] : undefined}
              saving={pending.has(f.featureId)}
              onPatch={(u) => onPatch(f.featureId, u)}
              onOpen={() => onOpen(f)}
              selected={selected === f.featureId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  feature: f, release, saving, onPatch, onOpen, selected,
}: {
  feature: Feature;
  release?: Release;
  saving: boolean;
  onPatch: (u: Partial<Feature>) => void;
  onOpen: () => void;
  selected: boolean;
}) {
  const sc = STATUS_CONFIG[f.killSwitch ? "disabled" : f.status] ?? STATUS_CONFIG.hidden;
  const pc = f.requiredPlan ? PLAN_CONFIG[f.requiredPlan] : null;

  return (
    <tr
      className={`cursor-pointer transition-colors hover:bg-white/[0.025] ${selected ? "bg-brand-500/[0.06]" : ""} ${f.killSwitch ? "bg-red-500/[0.02]" : ""}`}
      onClick={onOpen}
    >
      <td className="px-4 py-2.5 max-w-[220px]">
        <div className="font-medium text-white truncate">{f.name}</div>
        {f.description && <div className="text-[11px] text-slate-500 truncate mt-0.5">{f.description}</div>}
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">
          {CATEGORY_LABELS[f.category] ?? f.category}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
          <span className={`text-[11px] font-medium ${sc.color}`}>{f.killSwitch ? "إيقاف الطوارئ" : sc.label}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {pc ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${pc.color}`}>{pc.label}</span>
        ) : (
          <span className="text-[11px] text-slate-600">الكل</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-[11px]">
        {release ? (
          <span className={RELEASE_STATUS[release.status] ?? "text-slate-400"}>{release.name}</span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-[11px]">
        <span className={f.customerVisible ? "text-emerald-400" : f.adminOnly ? "text-violet-400" : "text-slate-600"}>
          {f.customerVisible ? "عملاء" : f.adminOnly ? "مشرف" : "مخفي"}
        </span>
      </td>
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <select
            value={f.status}
            disabled={saving}
            onChange={(e) => onPatch({ status: e.target.value })}
            className="rounded border border-white/[0.07] bg-[#0a1628] py-1 ps-1.5 pe-4 text-[10px] text-slate-400 focus:outline-none hover:border-white/[0.14] focus:border-brand-500/40"
          >
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button
            onClick={() => onPatch({ killSwitch: !f.killSwitch })}
            disabled={saving}
            title={f.killSwitch ? "إلغاء إيقاف الطوارئ" : "إيقاف الطوارئ"}
            className={`rounded p-1 transition-colors ${f.killSwitch ? "text-red-400 bg-red-500/10" : "text-slate-600 hover:text-red-400"}`}
          >
            {f.killSwitch ? <ZapOff className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
          </button>
          <button onClick={onOpen} className="rounded p-1 text-slate-600 hover:text-slate-300 transition-colors">
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Category view ──────────────────────────────────────────────────────────────

function CategoryView({ features, categories, releaseMap, pending, onPatch, onOpen, selected }: {
  features: Feature[]; categories: string[]; releaseMap: Record<string, Release>;
  pending: Set<string>; onPatch: (id: string, u: Partial<Feature>) => void;
  onOpen: (f: Feature) => void; selected?: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const byCategory = useMemo(() => {
    const m: Record<string, Feature[]> = {};
    for (const f of features) (m[f.category] = m[f.category] ?? []).push(f);
    return m;
  }, [features]);

  return (
    <div className="space-y-2">
      {categories.filter((c) => byCategory[c]?.length).map((cat) => {
        const fts = byCategory[cat] ?? [];
        const open = !collapsed.has(cat);
        return (
          <div key={cat} className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
            <button
              onClick={() => setCollapsed((s) => { const n = new Set(s); open ? n.add(cat) : n.delete(cat); return n; })}
              className="flex w-full items-center gap-2 px-4 py-3 text-start hover:bg-white/[0.02]"
            >
              <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`} />
              <span className="text-sm font-semibold text-white">{CATEGORY_LABELS[cat] ?? cat}</span>
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-400">{fts.length}</span>
            </button>
            {open && (
              <div className="border-t border-white/[0.05]">
                <FeatureTable features={fts} releaseMap={releaseMap} pending={pending} onPatch={onPatch} onOpen={onOpen} selected={selected} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Release view ───────────────────────────────────────────────────────────────

function ReleaseView({ features, releases, releaseMap, pending, onPatch, onOpen, selected }: {
  features: Feature[]; releases: Release[]; releaseMap: Record<string, Release>;
  pending: Set<string>; onPatch: (id: string, u: Partial<Feature>) => void;
  onOpen: (f: Feature) => void; selected?: string;
}) {
  const byRelease = useMemo(() => {
    const m: Record<string, Feature[]> = {};
    for (const f of features) (m[f.releaseId ?? "_none"] = m[f.releaseId ?? "_none"] ?? []).push(f);
    return m;
  }, [features]);

  const order = [...releases.map((r) => r.releaseId), "_none"];

  return (
    <div className="space-y-2">
      {order.filter((rid) => byRelease[rid]?.length).map((rid) => {
        const rel = rid === "_none" ? null : releaseMap[rid];
        const fts = byRelease[rid] ?? [];
        return (
          <div key={rid} className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <Package className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-sm font-semibold text-white">{rel ? rel.name : "غير مرتبط"}</span>
              {rel && <span className={`text-[10px] rounded-full border border-white/[0.08] px-2 py-0.5 ${RELEASE_STATUS[rel.status] ?? "text-slate-400"}`}>{rel.status}</span>}
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-400">{fts.length}</span>
            </div>
            <div className="border-t border-white/[0.05]">
              <FeatureTable features={fts} releaseMap={releaseMap} pending={pending} onPatch={onPatch} onOpen={onOpen} selected={selected} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onSeed, seeding }: { onSeed: () => void; seeding: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Settings2 className="h-10 w-10 text-slate-600 mb-4" />
      <h3 className="text-sm font-semibold text-white mb-2">السجل فارغ</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">اضغط "مزامنة من الكتالوج" لتهيئة جميع الميزات من الكتالوج الرسمي.</p>
      <button onClick={onSeed} disabled={seeding} className="btn-primary">{seeding ? "جاري التهيئة..." : "تهيئة الميزات"}</button>
    </div>
  );
}

// ── Drawer helpers ─────────────────────────────────────────────────────────────

function DrawerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">{children}</div>
  );
}
