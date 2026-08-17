"use client";

import React, { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CAPABILITIES, CATEGORY_LABELS, TIERS } from "@/lib/pricing/catalog";
import {
  ChevronDown, ChevronUp, Check, X, AlertTriangle,
  DollarSign, Users, Zap, MessageSquare, BarChart3,
  ShoppingBag, Brain, Globe, Settings, Package,
  Megaphone, Bot, Lock, Unlock, Archive, RotateCcw,
  Edit2, Save,
} from "lucide-react";

interface PlanRow {
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  priceUsd: number;
  yearlyUsd: number | null;
  status: "active" | "archived";
  monthlyMsgs: number;
  tier: "basic" | "pro" | "max" | "companies";
  aiRequestsMonthly: number;
  broadcastsMonthly: number;
  whatsappSessions: number;
  metaAccess: "none" | "limited" | "full";
  analyticsAccess: "basic" | "advanced";
  queuePriority: number;
  rateLimitPerMin: number;
  featureFlags: Record<string, any>;
}

interface PriceDrift {
  slug: string;
  catalogPrice: number;
  dbPrice: number;
}

// Capability category → icon
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  core:         MessageSquare,
  automation:   Zap,
  team:         Users,
  intelligence: Brain,
  analytics:    BarChart3,
  commerce:     ShoppingBag,
  messaging:    MessageSquare,
  scale:        Globe,
  operations:   Settings,
  enterprise:   Lock,
};

// Human-readable plan visibility labels
const PLAN_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  k_start:     { label: "Start",            color: "text-slate-300 bg-slate-500/15 border-slate-500/20" },
  k_growth:    { label: "Growth",           color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
  k_pro:       { label: "Pro",              color: "text-brand-300 bg-brand-500/10 border-brand-500/20" },
  k_enterprise:{ label: "Enterprise",       color: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
  k_business:  { label: "Business (legacy)",color: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
  k_scale:     { label: "Scale (legacy)",   color: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
};

// Group capabilities by category for the feature editor
const CAPABILITIES_BY_CATEGORY = useMemoCapabilities();

function useMemoCapabilities() {
  const groups: Record<string, typeof CAPABILITIES> = {};
  for (const cap of CAPABILITIES) {
    (groups[cap.category] = groups[cap.category] ?? []).push(cap);
  }
  return groups;
}

// Catalog tier slug → capIndex
const CATALOG_CAP_INDEX: Record<string, number> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.capIndex])
);

export default function PlansUi({
  initial,
  missingFromDb = [],
  priceDrift = [],
}: {
  initial: PlanRow[];
  missingFromDb?: string[];
  priceDrift?: PriceDrift[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [rows, setRows] = useState<PlanRow[]>(initial);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function update(slug: string, patch: Partial<PlanRow>) {
    setRows((r) => r.map((p) => (p.slug === slug ? { ...p, ...patch } : p)));
  }

  function save(p: PlanRow) {
    setMsg(null);
    start(async () => {
      const r = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: p.slug,
          name: p.name,
          nameEn: p.nameEn,
          description: p.description || "",
          priceUsd: Number(p.priceUsd) || 0,
          yearlyUsd: p.yearlyUsd == null || p.yearlyUsd === ("" as any) ? null : Number(p.yearlyUsd),
          tier: p.tier,
          monthlyMsgs: Number(p.monthlyMsgs) || 0,
          aiRequestsMonthly: Number(p.aiRequestsMonthly) || 0,
          broadcastsMonthly: Number(p.broadcastsMonthly) || 0,
          whatsappSessions: Number(p.whatsappSessions) || 1,
          metaAccess: p.metaAccess,
          analyticsAccess: p.analyticsAccess,
          queuePriority: Number(p.queuePriority) || 0,
          rateLimitPerMin: Number(p.rateLimitPerMin) || 60,
          featureFlags: p.featureFlags,
        }),
      });
      if (r.ok) {
        setMsg({ text: `تم حفظ ${p.name}`, ok: true });
        setEditing(null);
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg({ text: j.error || `خطأ ${r.status}`, ok: false });
      }
    });
  }

  async function toggleArchive(p: PlanRow) {
    const next = p.status === "archived" ? "active" : "archived";
    if (next === "archived" && !confirm(`أرشفة باقة "${p.name}"؟\nستختفي من صفحة الأسعار وشاشة الدفع للعملاء الجدد. المشتركون الحاليون يحتفظون بباقتهم ومزاياها.`)) return;
    start(async () => {
      const r = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: p.slug, status: next }),
      });
      if (r.ok) {
        update(p.slug, { status: next });
        setMsg({ text: next === "archived" ? `تمت أرشفة ${p.name}` : `تمت استعادة ${p.name}`, ok: true });
        router.refresh();
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg({ text: j.error || `خطأ ${r.status}`, ok: false });
      }
    });
  }

  async function seedCatalog() {
    setMsg(null);
    const r = await fetch("/api/admin/plans/seed-catalog", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(
      r.ok
        ? { text: j.created?.length ? `تم إنشاء ${j.created.length} باقة جديدة: ${j.created.join(", ")}` : "كل باقات الكتالوج موجودة", ok: true }
        : { text: j.error || `خطأ ${r.status}`, ok: false },
    );
    router.refresh();
  }

  async function seedDefaults() {
    setMsg(null);
    const r = await fetch("/api/admin/membership/seed-defaults", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(
      r.ok
        ? { text: `تم تحديث ${j.updated ?? ""} باقة بالقيم الافتراضية`, ok: true }
        : { text: j.error || `خطأ ${r.status}`, ok: false },
    );
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Drift warnings */}
      {(missingFromDb.length > 0 || priceDrift.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-sm">
            <div className="font-semibold text-amber-300 mb-1">تحذير: فرق بين الكتالوج وقاعدة البيانات</div>
            {missingFromDb.length > 0 && (
              <div className="text-amber-200/80 text-xs mb-1">
                باقات غير موجودة في قاعدة البيانات: <span className="font-mono">{missingFromDb.join(", ")}</span>
              </div>
            )}
            {priceDrift.map((d) => (
              <div key={d.slug} className="text-amber-200/80 text-xs">
                سعر <span className="font-mono">{d.slug}</span> في الكتالوج ${d.catalogPrice} ≠ قاعدة البيانات ${d.dbPrice} (ربما تعديل متعمد)
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={seedCatalog} disabled={pending} className="btn-secondary flex items-center gap-1.5 text-sm disabled:opacity-50">
          <Package className="h-3.5 w-3.5" />
          زرع باقات الكتالوج المفقودة
        </button>
        <button onClick={seedDefaults} disabled={pending} className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" />
          إعادة ضبط القيم الافتراضية
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
            {msg.ok ? "✓" : "✗"} {msg.text}
          </span>
        )}
      </div>

      {/* Plan cards */}
      {/* Public plans section */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">الباقات العامة (4)</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-[10px] text-slate-600">تظهر في صفحة الأسعار وشاشة الدفع</span>
        </div>
        <div className="space-y-3">
          {rows.filter((p) => ["k_start", "k_growth", "k_pro", "k_enterprise"].includes(p.slug)).map((p) => {
          const typeConfig = PLAN_TYPE_LABELS[p.slug];
          const isEditing = editing === p.slug;
          const isLegacy = false;
          const capIndex = CATALOG_CAP_INDEX[p.slug] ?? 0;

          return (
            <div
              key={p.slug}
              className={`rounded-xl border transition-colors ${p.status === "archived" ? "border-white/[0.05] bg-white/[0.01] opacity-60" : isEditing ? "border-white/[0.12] bg-white/[0.04]" : "border-white/[0.07] bg-white/[0.02]"}`}
            >
              {/* Plan header */}
              <div className="flex flex-wrap items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-base font-bold text-white">{p.name}</span>
                    {typeConfig && (
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                    )}
                    {isLegacy && <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-300">legacy</span>}
                    {p.status === "archived" && <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">مؤرشفة</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                    <span className="font-bold text-white">
                      {p.priceUsd === 0 ? "تواصل معنا" : `$${p.priceUsd}/شهر`}
                    </span>
                    {p.yearlyUsd && <span className="text-slate-500">${p.yearlyUsd}/سنة</span>}
                    <span className="text-slate-600">·</span>
                    <span>{p.monthlyMsgs === 0 ? "رسائل غير محدودة" : `${p.monthlyMsgs.toLocaleString()} رسالة/شهر`}</span>
                    <span className="text-slate-600">·</span>
                    <span>{p.aiRequestsMonthly === 0 ? "AI غير محدود" : `${p.aiRequestsMonthly.toLocaleString()} AI/شهر`}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditing(isEditing ? null : p.slug)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${isEditing ? "border-brand-500/40 bg-brand-500/10 text-brand-300" : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white"}`}
                  >
                    <Edit2 className="h-3 w-3" />
                    {isEditing ? "إغلاق" : "تعديل"}
                  </button>
                  <button
                    onClick={() => toggleArchive(p)}
                    disabled={pending}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${p.status === "archived" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300"}`}
                  >
                    {p.status === "archived" ? <><Unlock className="h-3 w-3" /> استعادة</> : <><Archive className="h-3 w-3" /> أرشفة</>}
                  </button>
                </div>
              </div>

              {/* Editor */}
              {isEditing && (
                <div className="border-t border-white/[0.06] p-4 space-y-5">
                  {/* General */}
                  <Section title="عام" icon={Settings}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField label="اسم الباقة" value={p.name} onChange={(v) => update(p.slug, { name: v })} />
                      <FormField label="Plan Name (EN)" value={p.nameEn} onChange={(v) => update(p.slug, { nameEn: v })} />
                      <div className="sm:col-span-2">
                        <FormField label="وصف الباقة" value={p.description} onChange={(v) => update(p.slug, { description: v })} />
                      </div>
                    </div>
                  </Section>

                  {/* Pricing */}
                  <Section title="التسعير" icon={DollarSign}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <FormField label="السعر الشهري ($)" type="number" value={p.priceUsd} onChange={(v) => update(p.slug, { priceUsd: Number(v) })} />
                      <FormField label="السعر السنوي ($، فارغ = لا)" type="number" value={p.yearlyUsd ?? ""} onChange={(v) => update(p.slug, { yearlyUsd: v === "" ? null : Number(v) })} />
                      <FormField label="أولوية قائمة الإرسال" type="number" value={p.queuePriority} onChange={(v) => update(p.slug, { queuePriority: Number(v) })} hint="0–100" />
                      <FormField label="حد الطلبات/دقيقة" type="number" value={p.rateLimitPerMin} onChange={(v) => update(p.slug, { rateLimitPerMin: Number(v) })} />
                    </div>
                  </Section>

                  {/* Limits */}
                  <Section title="حدود الاستخدام" icon={Zap}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <FormField label="رسائل شهرياً (0 = ∞)" type="number" value={p.monthlyMsgs} onChange={(v) => update(p.slug, { monthlyMsgs: Number(v) })} />
                      <FormField label="طلبات AI شهرياً (0 = ∞)" type="number" value={p.aiRequestsMonthly} onChange={(v) => update(p.slug, { aiRequestsMonthly: Number(v) })} />
                      <FormField label="حملات Broadcast/شهر (0 = ∞)" type="number" value={p.broadcastsMonthly} onChange={(v) => update(p.slug, { broadcastsMonthly: Number(v) })} />
                      <FormField label="جلسات واتساب" type="number" value={p.whatsappSessions} onChange={(v) => update(p.slug, { whatsappSessions: Number(v) })} />
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-500">وصول Meta Cloud</label>
                        <select
                          value={p.metaAccess}
                          onChange={(e) => update(p.slug, { metaAccess: e.target.value as any })}
                          className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] px-2 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
                        >
                          <option value="none">بدون وصول</option>
                          <option value="limited">وصول محدود</option>
                          <option value="full">وصول كامل</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-500">مستوى التحليلات</label>
                        <select
                          value={p.analyticsAccess}
                          onChange={(e) => update(p.slug, { analyticsAccess: e.target.value as any })}
                          className="w-full rounded-lg border border-white/[0.08] bg-[#0a1628] px-2 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-brand-500/50"
                        >
                          <option value="basic">أساسي</option>
                          <option value="advanced">متقدّم</option>
                        </select>
                      </div>
                    </div>
                  </Section>

                  {/* Features */}
                  <Section title="الميزات المضمّنة" icon={Package}>
                    <div className="space-y-3">
                      {Object.entries(CAPABILITIES_BY_CATEGORY).map(([cat, caps]) => (
                        <CapabilityGroup
                          key={cat}
                          category={cat}
                          caps={caps}
                          flags={p.featureFlags}
                          capIndex={capIndex}
                          onToggle={(key, val) => update(p.slug, { featureFlags: { ...p.featureFlags, [key]: val } })}
                        />
                      ))}
                    </div>
                  </Section>

                  {/* Save */}
                  <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
                    <button
                      onClick={() => save(p)}
                      disabled={pending}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-500/20 border border-brand-500/30 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/30 transition-colors disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {pending ? "جاري الحفظ..." : "حفظ التغييرات"}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsed view — feature pills */}
              {!isEditing && (
                <div className="border-t border-white/[0.04] px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {CAPABILITIES.filter((cap) => capIndex >= cap.minTierIndex && !cap.comingSoon).slice(0, 12).map((cap) => (
                      <span key={cap.key} className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-slate-400">
                        {cap.label.ar}
                      </span>
                    ))}
                    {CAPABILITIES.filter((cap) => capIndex >= cap.minTierIndex && !cap.comingSoon).length > 12 && (
                      <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-slate-600">
                        +{CAPABILITIES.filter((cap) => capIndex >= cap.minTierIndex && !cap.comingSoon).length - 12} أخرى
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Legacy plans section */}
      {rows.some((p) => !["k_start", "k_growth", "k_pro", "k_enterprise"].includes(p.slug)) && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-orange-500/70">الباقات القديمة (legacy)</span>
            <div className="h-px flex-1 bg-white/[0.04]" />
            <span className="text-[10px] text-slate-600">مخفية عن العملاء الجدد — المشتركون الحاليون محمّيون</span>
          </div>
          <div className="space-y-3 opacity-75">
            {rows.filter((p) => !["k_start", "k_growth", "k_pro", "k_enterprise"].includes(p.slug)).map((p) => {
              const typeConfig = PLAN_TYPE_LABELS[p.slug];
              const isEditing = editing === p.slug;
              const isLegacy = true;
              const capIndex = CATALOG_CAP_INDEX[p.slug] ?? 0;
              return (
                <div
                  key={p.slug}
                  className={`rounded-xl border transition-colors ${p.status === "archived" ? "border-white/[0.05] bg-white/[0.01] opacity-60" : isEditing ? "border-white/[0.12] bg-white/[0.04]" : "border-orange-500/[0.10] bg-orange-500/[0.02]"}`}
                >
                  <div className="flex flex-wrap items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-base font-bold text-white">{p.name}</span>
                        {typeConfig && (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                        )}
                        <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-300">legacy</span>
                        {p.status === "archived" && <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">مؤرشفة</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                        <span className="font-bold text-white">
                          {p.priceUsd === 0 ? "تواصل معنا" : `$${p.priceUsd}/شهر`}
                        </span>
                        {p.yearlyUsd && <span className="text-slate-500">${p.yearlyUsd}/سنة</span>}
                        <span className="text-slate-600">·</span>
                        <span>{p.monthlyMsgs === 0 ? "رسائل غير محدودة" : `${p.monthlyMsgs.toLocaleString()} رسالة/شهر`}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleArchive(p)}
                        disabled={pending}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${p.status === "archived" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300"}`}
                      >
                        {p.status === "archived" ? <><Unlock className="h-3 w-3" /> استعادة</> : <><Archive className="h-3 w-3" /> أرشفة</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Form field ────────────────────────────────────────────────────────────────
function FormField({
  label, value, onChange, type = "text", hint,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500/50"
      />
      {hint && <div className="mt-0.5 text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

// ── Capability group (collapsible) ────────────────────────────────────────────
function CapabilityGroup({
  category, caps, flags, capIndex, onToggle,
}: {
  category: string;
  caps: typeof CAPABILITIES;
  flags: Record<string, any>;
  capIndex: number;
  onToggle: (key: string, value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = CATEGORY_ICONS[category] ?? Package;
  const categoryLabel = (CATEGORY_LABELS as any)[category]?.ar ?? category;

  // Count: how many are on vs total
  const enabledCount = caps.filter((c) => flags[c.key]).length;
  const defaultCount = caps.filter((c) => capIndex >= c.minTierIndex).length;

  return (
    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors hover:bg-white/[0.02]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span className="flex-1 text-sm font-medium text-slate-300">{categoryLabel}</span>
        <span className="text-[11px] text-slate-600">{enabledCount}/{caps.length}</span>
        {defaultCount > 0 && (
          <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-400">{defaultCount} افتراضي</span>
        )}
        {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-600" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-600" />}
      </button>

      {open && (
        <div className="border-t border-white/[0.05] grid grid-cols-1 divide-y divide-white/[0.04]">
          {caps.map((cap) => {
            const included = !!flags[cap.key];
            const defaultByPlan = capIndex >= cap.minTierIndex;
            return (
              <label
                key={cap.key}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
              >
                <button
                  type="button"
                  onClick={() => onToggle(cap.key, !included)}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${included ? "border-brand-500/50 bg-brand-500/20 text-brand-400" : "border-white/[0.12] bg-white/[0.03] text-transparent"}`}
                >
                  <Check className="h-3 w-3" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{cap.label.ar}</div>
                  <div className="text-[10px] text-slate-600">{cap.label.en}</div>
                </div>
                {defaultByPlan && (
                  <span className="shrink-0 text-[10px] text-brand-500">افتراضي للباقة</span>
                )}
                {cap.comingSoon && (
                  <span className="shrink-0 text-[10px] text-sky-500">قريباً</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
