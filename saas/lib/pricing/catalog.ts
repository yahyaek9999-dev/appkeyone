/**
 * Pricing catalog — the single source of *presentation* truth for the public
 * pricing experience and in-app entitlement gating.
 *
 * Design split (see plan):
 *   - DB `Plan` rows own MONEY + runtime LIMITS + `featureFlags` (admin-editable,
 *     drive `getEffectivePlan()`).
 *   - THIS file owns marketing metadata: tier order, audience, the capability
 *     matrix, badges. It is typed + versioned and never needs a migration.
 *
 * The 6 public tiers use NEW slugs (k_*) so existing subscribers on legacy
 * plan rows are never touched. `prisma/seed-plans.ts` upserts DB rows whose
 * numbers are DERIVED from this catalog, keeping the two in sync by slug.
 *
 * Limit convention (matches lib/membership/limits.ts): a numeric limit of
 * `0` means UNLIMITED. Feature *availability* is gated by the capability set,
 * NOT by a 0 (so "locked" and "unlimited" never collide).
 */

export type Bilingual = { ar: string; en: string };

/** Public tier slugs, in display order. */
export const TIER_ORDER = [
  "k_start",
  "k_growth",
  "k_pro",
  "k_business",
  "k_scale",
  "k_enterprise",
] as const;

export type TierSlug = (typeof TIER_ORDER)[number];

/** Internal gating tier (unchanged 4-value union used by getEffectivePlan). */
export type InternalTier = "basic" | "pro" | "max" | "companies";

export type CapabilityCategory =
  | "core"
  | "automation"
  | "team"
  | "intelligence"
  | "analytics"
  | "scale"
  | "enterprise";

export interface Capability {
  key: string;
  label: Bilingual;
  category: CapabilityCategory;
  /** Index into TIER_ORDER from which this capability is unlocked. */
  minTierIndex: number;
  /** Not-yet-built functional module — shown as entitlement / "coming soon". */
  comingSoon?: boolean;
}

export const CATEGORY_LABELS: Record<CapabilityCategory, Bilingual> = {
  core: { ar: "الأساسيات", en: "Core" },
  automation: { ar: "الأتمتة والحملات", en: "Automation & Campaigns" },
  team: { ar: "الفريق والصلاحيات", en: "Team & Permissions" },
  intelligence: { ar: "الذكاء والمبيعات", en: "Intelligence & Sales" },
  analytics: { ar: "التحليلات والتقارير", en: "Analytics & Reporting" },
  scale: { ar: "التوسّع والتكاملات", en: "Scale & Integrations" },
  enterprise: { ar: "المؤسسات", en: "Enterprise" },
};

/**
 * Canonical capability list = union of gated features + the 15 premium
 * modules. `key` doubles as the `featureFlags` key written by the seed.
 * minTierIndex follows the brief's feature-gating ladder exactly.
 */
export const CAPABILITIES: Capability[] = [
  // ── Core (all tiers) ────────────────────────────────────────────────
  { key: "inbox", category: "core", minTierIndex: 0, label: { ar: "صندوق وارد واتساب موحّد", en: "WhatsApp Inbox" } },
  { key: "auto_reply", category: "core", minTierIndex: 0, label: { ar: "ردود تلقائية ذكية", en: "Smart Auto-Reply" } },
  { key: "customer_management", category: "core", minTierIndex: 0, label: { ar: "إدارة العملاء", en: "Customer Management" } },
  { key: "order_management", category: "core", minTierIndex: 0, label: { ar: "إدارة الطلبات", en: "Order Management" } },
  { key: "quick_replies", category: "core", minTierIndex: 0, label: { ar: "ردود سريعة جاهزة", en: "Quick Replies" } },

  // ── Growth+ : Automation & Campaigns ────────────────────────────────
  { key: "advanced_automations", category: "automation", minTierIndex: 1, label: { ar: "أتمتة متقدمة", en: "Advanced Automations" } },
  { key: "broadcasts", category: "automation", minTierIndex: 1, label: { ar: "حملات البثّ الجماعي", en: "Broadcast Campaigns" } },
  { key: "working_hours", category: "automation", minTierIndex: 1, label: { ar: "ساعات العمل وردود خارج الدوام", en: "Working Hours" } },

  // ── Growth+ : Team ──────────────────────────────────────────────────
  { key: "team", category: "team", minTierIndex: 1, label: { ar: "أعضاء فريق", en: "Team Members" } },

  // ── Pro+ : Intelligence ─────────────────────────────────────────────
  { key: "knowledge_base", category: "intelligence", minTierIndex: 2, label: { ar: "قاعدة المعرفة", en: "Knowledge Base" } },
  { key: "smart_assistant", category: "intelligence", minTierIndex: 2, label: { ar: "المساعد الذكي (Knowledge Brain)", en: "Smart Assistant (AI Brain)" } },
  { key: "advanced_insights", category: "intelligence", minTierIndex: 2, label: { ar: "رؤى متقدّمة عن العملاء", en: "Advanced Customer Insights" } },
  { key: "lead_scoring", category: "intelligence", minTierIndex: 2, label: { ar: "تقييم العملاء المحتملين", en: "Lead Scoring" } },
  { key: "sales_pipeline", category: "intelligence", minTierIndex: 2, label: { ar: "خطّ أنابيب المبيعات", en: "Sales Pipeline" } },
  { key: "customer_segmentation", category: "intelligence", minTierIndex: 2, label: { ar: "تقسيم العملاء (شرائح)", en: "Customer Segmentation" } },
  { key: "smart_campaign_builder", category: "intelligence", minTierIndex: 2, label: { ar: "منشئ الحملات الذكي", en: "Smart Campaign Builder" } },

  // ── Pro+ : Analytics ────────────────────────────────────────────────
  { key: "advanced_analytics", category: "analytics", minTierIndex: 2, label: { ar: "تحليلات متقدّمة", en: "Advanced Analytics" } },
  { key: "revenue_attribution", category: "analytics", minTierIndex: 2, label: { ar: "إسناد الإيرادات", en: "Revenue Attribution" } },

  // ── Business+ : Team / Analytics / Automation ───────────────────────
  { key: "multi_team", category: "team", minTierIndex: 3, label: { ar: "وصول متعدّد الفرق", en: "Multi-Team Access" } },
  { key: "approval_workflows", category: "team", minTierIndex: 3, comingSoon: true, label: { ar: "مسارات الموافقات", en: "Approval Workflows" } },
  { key: "advanced_reporting", category: "analytics", minTierIndex: 3, label: { ar: "تقارير تنفيذية متقدّمة", en: "Advanced Reporting" } },
  { key: "flow_builder", category: "automation", minTierIndex: 3, comingSoon: true, label: { ar: "منشئ المسارات (Flow Builder)", en: "Flow Builder" } },
  { key: "multi_branch", category: "scale", minTierIndex: 3, comingSoon: true, label: { ar: "إدارة الفروع المتعدّدة", en: "Multi-Branch Management" } },
  { key: "loyalty_rewards", category: "intelligence", minTierIndex: 3, label: { ar: "الولاء والمكافآت", en: "Loyalty & Rewards" } },

  // ── Scale+ : Scale & Integrations ───────────────────────────────────
  { key: "multi_whatsapp", category: "scale", minTierIndex: 4, label: { ar: "أرقام واتساب متعدّدة", en: "Multiple WhatsApp Numbers" } },
  { key: "api_access", category: "scale", minTierIndex: 4, label: { ar: "وصول API للمطوّرين", en: "API Access" } },
  { key: "custom_integrations", category: "scale", minTierIndex: 4, label: { ar: "تكاملات مخصّصة", en: "Custom Integrations" } },

  // ── Enterprise ──────────────────────────────────────────────────────
  { key: "white_label", category: "enterprise", minTierIndex: 5, comingSoon: true, label: { ar: "علامة بيضاء (White Label)", en: "White Label" } },
  { key: "dedicated_infra", category: "enterprise", minTierIndex: 5, label: { ar: "بنية تحتية مخصّصة", en: "Dedicated Infrastructure" } },
  { key: "priority_support", category: "enterprise", minTierIndex: 5, label: { ar: "دعم ذو أولوية", en: "Priority Support" } },
  { key: "custom_dev", category: "enterprise", minTierIndex: 5, label: { ar: "تطوير مخصّص", en: "Custom Development" } },
  { key: "sla", category: "enterprise", minTierIndex: 5, label: { ar: "اتفاقية مستوى خدمة (SLA)", en: "SLA" } },
];

export interface TierLimits {
  /** Monthly WhatsApp messages. 0 = unlimited. */
  messages: number;
  /** Monthly AI requests. 0 = unlimited. */
  ai: number;
  /** Monthly broadcast campaigns. 0 = unlimited (only when broadcasts capability is on). */
  broadcasts: number;
  /** Concurrent WhatsApp numbers. */
  whatsapp: number;
  /** Team members (incl. owner). 0 = unlimited. */
  team: number;
  /** Active automations. 0 = unlimited. */
  automations: number;
  /** Knowledge-base documents. 0 = unlimited (only when knowledge_base capability is on). */
  kbDocs: number;
  /** CRM customer records. 0 = unlimited. Enforced only when grandfathering keeps existing tenants safe. */
  customers: number;
}

export interface TierDef {
  slug: TierSlug;
  index: number;
  name: Bilingual;
  /** Short one-line description. */
  tagline: Bilingual;
  /** Display price; null => contact sales. */
  priceUsdMonthly: number | null;
  priceUsdYearly: number | null;
  contactSales?: boolean;
  popular?: boolean;
  recommended?: boolean;
  /** "Perfect for" audience chips. */
  audience: Bilingual[];
  /** Internal gating tier for getEffectivePlan defaults + badge color. */
  internalTier: InternalTier;
  limits: TierLimits;
  metaAccess: "none" | "limited" | "full";
  analyticsAccess: "basic" | "advanced";
}

export const TIERS: TierDef[] = [
  {
    slug: "k_start",
    index: 0,
    name: { ar: "KEYONE Start", en: "KEYONE Start" },
    tagline: { ar: "ابدأ رحلتك على واتساب باحتراف", en: "Start selling on WhatsApp, professionally" },
    priceUsdMonthly: 29,
    priceUsdYearly: 290,
    audience: [
      { ar: "العلامات المحلية الصغيرة", en: "Small Local Brands" },
      { ar: "الأعمال الجديدة", en: "New Businesses" },
      { ar: "روّاد الأعمال الأفراد", en: "Solo Founders" },
    ],
    internalTier: "basic",
    metaAccess: "none",
    analyticsAccess: "basic",
    limits: { messages: 1000, ai: 500, broadcasts: 0, whatsapp: 1, team: 1, automations: 0, kbDocs: 0, customers: 1000 },
  },
  {
    slug: "k_growth",
    index: 1,
    name: { ar: "KEYONE Growth", en: "KEYONE Growth" },
    tagline: { ar: "نمِّ مبيعاتك بالأتمتة والحملات", en: "Grow with automation & campaigns" },
    priceUsdMonthly: 59,
    priceUsdYearly: 590,
    audience: [
      { ar: "العلامات النامية", en: "Growing Brands" },
      { ar: "متاجر إلكترونية صغيرة", en: "Small E-commerce Stores" },
      { ar: "العيادات الصغيرة", en: "Small Clinics" },
    ],
    internalTier: "pro",
    metaAccess: "none",
    analyticsAccess: "basic",
    limits: { messages: 5000, ai: 3000, broadcasts: 4, whatsapp: 1, team: 3, automations: 5, kbDocs: 0, customers: 5000 },
  },
  {
    slug: "k_pro",
    index: 2,
    name: { ar: "KEYONE Pro", en: "KEYONE Pro" },
    tagline: { ar: "ذكاء كامل ورؤى متقدّمة للمبيعات", en: "Full intelligence & advanced sales insights" },
    priceUsdMonthly: 119,
    priceUsdYearly: 1190,
    popular: true,
    recommended: true,
    audience: [
      { ar: "الأعمال الراسخة", en: "Established Businesses" },
      { ar: "معارض السيارات", en: "Car Showrooms" },
      { ar: "شركات العقارات", en: "Real Estate Agencies" },
      { ar: "متاجر إلكترونية متوسطة", en: "Medium E-commerce Stores" },
    ],
    internalTier: "pro",
    metaAccess: "limited",
    analyticsAccess: "advanced",
    limits: { messages: 15000, ai: 10000, broadcasts: 12, whatsapp: 2, team: 5, automations: 20, kbDocs: 0, customers: 15000 },
  },
  {
    slug: "k_business",
    index: 3,
    name: { ar: "KEYONE Business", en: "KEYONE Business" },
    tagline: { ar: "فرق متعدّدة وتقارير وموافقات", en: "Multi-team, reporting & approvals" },
    priceUsdMonthly: 249,
    priceUsdYearly: 2490,
    audience: [
      { ar: "فرق المبيعات", en: "Sales Teams" },
      { ar: "الأعمال متعدّدة الفروع", en: "Multi-Branch Businesses" },
      { ar: "العيادات الكبيرة", en: "Large Clinics" },
      { ar: "المطاعم", en: "Restaurants" },
    ],
    internalTier: "max",
    metaAccess: "limited",
    analyticsAccess: "advanced",
    limits: { messages: 40000, ai: 30000, broadcasts: 30, whatsapp: 3, team: 10, automations: 50, kbDocs: 0, customers: 40000 },
  },
  {
    slug: "k_scale",
    index: 4,
    name: { ar: "KEYONE Scale", en: "KEYONE Scale" },
    tagline: { ar: "للعمليات عالية الحجم والتكاملات", en: "High-volume operations & integrations" },
    priceUsdMonthly: 499,
    priceUsdYearly: 4990,
    audience: [
      { ar: "العمليات عالية الحجم", en: "High Volume Operations" },
      { ar: "شركات التجارة الإلكترونية الكبرى", en: "Large E-commerce Companies" },
      { ar: "شركات الخدمات اللوجستية", en: "Logistics Companies" },
      { ar: "أعمال الامتياز التجاري", en: "Franchise Businesses" },
    ],
    internalTier: "max",
    metaAccess: "full",
    analyticsAccess: "advanced",
    limits: { messages: 100000, ai: 80000, broadcasts: 100, whatsapp: 6, team: 25, automations: 0, kbDocs: 0, customers: 200000 },
  },
  {
    slug: "k_enterprise",
    index: 5,
    name: { ar: "KEYONE Enterprise", en: "KEYONE Enterprise" },
    tagline: { ar: "حلول مخصّصة بلا حدود مع SLA", en: "Custom, unlimited, with SLA" },
    priceUsdMonthly: null,
    priceUsdYearly: null,
    contactSales: true,
    audience: [
      { ar: "الشركات الكبرى", en: "Corporations" },
      { ar: "المؤسسات", en: "Enterprise Organizations" },
      { ar: "التكاملات المخصّصة", en: "Custom Integrations" },
      { ar: "الشركات متعدّدة المواقع", en: "Large Multi-Location Companies" },
    ],
    internalTier: "companies",
    metaAccess: "full",
    analyticsAccess: "advanced",
    limits: { messages: 0, ai: 0, broadcasts: 0, whatsapp: 0, team: 0, automations: 0, kbDocs: 0, customers: 0 },
  },
];

// ── Derived helpers ───────────────────────────────────────────────────

const TIER_BY_SLUG: Record<string, TierDef> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t]),
);

export function getTier(slug: string): TierDef | undefined {
  return TIER_BY_SLUG[slug];
}

/** Capability keys unlocked at a given tier index. */
export function capabilitiesForIndex(index: number): string[] {
  return CAPABILITIES.filter((c) => index >= c.minTierIndex).map((c) => c.key);
}

/** Does a tier (by slug) include a capability key? */
export function tierHasCapability(slug: string, capKey: string): boolean {
  const tier = TIER_BY_SLUG[slug];
  const cap = CAPABILITIES.find((c) => c.key === capKey);
  if (!tier || !cap) return false;
  return tier.index >= cap.minTierIndex;
}

/** First (cheapest) tier slug that unlocks the capability — for upgrade CTAs. */
export function tierUnlocking(capKey: string): TierSlug | null {
  const cap = CAPABILITIES.find((c) => c.key === capKey);
  if (!cap) return null;
  const tier = TIERS.find((t) => t.index === cap.minTierIndex);
  return tier?.slug ?? null;
}

/**
 * Build the `featureFlags` JSON object the DB row should carry for a tier.
 * Booleans for every capability + numeric soft-limits (team/automations/kbDocs)
 * that have no dedicated DB column.
 */
export function featureFlagsForTier(tier: TierDef): Record<string, boolean | number> {
  const flags: Record<string, boolean | number> = {};
  for (const cap of CAPABILITIES) {
    flags[cap.key] = tier.index >= cap.minTierIndex;
  }
  // Numeric soft-limits live inside featureFlags (no schema change).
  flags.team = tier.limits.team;
  flags.automations = tier.limits.automations;
  flags.kbDocs = tier.limits.kbDocs;
  flags.customers = tier.limits.customers;
  return flags;
}

/** Yearly savings vs paying monthly. Returns null for contact-sales tiers. */
export function yearlySavings(tier: TierDef): number | null {
  if (tier.priceUsdMonthly == null || tier.priceUsdYearly == null) return null;
  return tier.priceUsdMonthly * 12 - tier.priceUsdYearly;
}

/** Marketing badge shown on the billing toggle. */
export const YEARLY_SAVINGS_LABEL: Bilingual = { ar: "وفّر حتى 20%", en: "Save up to 20%" };

/**
 * Monthly broadcast-credit allotment auto-granted to active public-plan (k_*)
 * subscribers, by tier (1 credit ≈ 1 QR-broadcast recipient). Completes the
 * "Plan → Monthly Credits" model. These are starter defaults the business
 * tunes; the grant itself is flag-gated OFF (BROADCAST_MONTHLY_CREDITS_ENABLED),
 * so the numbers are inert until explicitly enabled. 0 = no automatic monthly
 * grant (e.g. k_start has no broadcasts capability; legacy slugs map to 0).
 */
export const MONTHLY_BROADCAST_CREDITS: Record<TierSlug, number> = {
  k_start: 0,
  k_growth: 1000,
  k_pro: 5000,
  k_business: 15000,
  k_scale: 50000,
  k_enterprise: 200000,
};

/** Monthly broadcast-credit allotment for a plan slug (unknown/legacy → 0). */
export function monthlyBroadcastCreditsForSlug(slug: string): number {
  return (slug in MONTHLY_BROADCAST_CREDITS) ? MONTHLY_BROADCAST_CREDITS[slug as TierSlug] : 0;
}

/**
 * Monthly KEYONE Brain credit allotment per public tier (1 credit ≈ 1 Brain API
 * call). Starter defaults; the grant is flag-gated OFF (BRAIN_MONTHLY_CREDITS_ENABLED)
 * so these numbers are inert until enabled. Legacy/unknown slugs → 0.
 */
export const MONTHLY_BRAIN_CREDITS: Record<TierSlug, number> = {
  k_start: 100,
  k_growth: 500,
  k_pro: 2000,
  k_business: 5000,
  k_scale: 20000,
  k_enterprise: 100000,
};

/** Monthly Brain-credit allotment for a plan slug (unknown/legacy → 0). */
export function monthlyBrainCreditsForSlug(slug: string): number {
  return (slug in MONTHLY_BRAIN_CREDITS) ? MONTHLY_BRAIN_CREDITS[slug as TierSlug] : 0;
}
