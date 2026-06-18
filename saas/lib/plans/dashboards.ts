/**
 * lib/plans/dashboards.ts — per-plan dashboards (Phase 5). Each tier resolves a
 * distinct widget set + limits + onboarding from the pricing catalog.
 */
import { TIERS, capabilitiesForIndex, getTier, type TierDef } from "@/lib/pricing/catalog";

export interface PlanDashboard {
  slug: string; name: string; tier: string;
  widgets: string[]; limits: Record<string, number>; onboarding: string[];
}

const PREMIUM_WIDGETS = ["broadcasts", "knowledge_base", "smart_assistant", "sales_pipeline", "advanced_analytics", "api_access", "white_label"];

const FREE: PlanDashboard = {
  slug: "free", name: "Free", tier: "free",
  widgets: ["inbox", "customers", "orders"],
  limits: { messages: 100, ai: 100, broadcasts: 0, customers: 0, whatsapp: 1, team: 1 },
  onboarding: ["اربط واتساب", "أضف أول عميل", "فعّل الرد التلقائي"],
};

function buildOnboarding(tier: TierDef): string[] {
  const steps = ["اربط واتساب", "درّب البوت", "أضف منتجاتك"];
  if (tier.index >= 1) steps.push("أنشئ أول حملة بثّ");
  if (tier.index >= 2) steps.push("فعّل قاعدة المعرفة والمساعد الذكي");
  if (tier.index >= 4) steps.push("أنشئ مفتاح API للمطوّرين");
  if (tier.index >= 5) steps.push("خصّص العلامة البيضاء");
  return steps;
}

export function getPlanDashboard(slug: string | null | undefined): PlanDashboard {
  if (!slug || slug === "none" || slug === "free") return FREE;
  const tier = getTier(slug);
  if (!tier) return FREE;
  const caps = capabilitiesForIndex(tier.index);
  const widgets = Array.from(new Set(["inbox", "customers", "orders", ...caps.filter((c) => PREMIUM_WIDGETS.includes(c))]));
  return {
    slug: tier.slug, name: tier.name.en, tier: tier.internalTier, widgets,
    limits: { messages: tier.limits.messages, ai: tier.limits.ai, broadcasts: tier.limits.broadcasts, customers: tier.limits.customers, whatsapp: tier.limits.whatsapp, team: tier.limits.team },
    onboarding: buildOnboarding(tier),
  };
}

export function allPlanDashboards(): PlanDashboard[] {
  return [FREE, ...TIERS.map((t) => getPlanDashboard(t.slug))];
}
