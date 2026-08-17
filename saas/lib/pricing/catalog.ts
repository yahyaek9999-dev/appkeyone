/**
 * Pricing catalog — single source of truth for public pricing and entitlement gating.
 *
 * Design split:
 *   - DB `Plan` rows own MONEY + runtime LIMITS + `featureFlags` (admin-editable).
 *   - THIS file owns marketing metadata, capability matrix, tier definitions.
 *   - Admin editing a Plan row's price is the live source of truth after seeding.
 *
 * PUBLIC TIERS: exactly 4 — Start, Growth, Pro, Enterprise.
 * Legacy tiers (k_business, k_scale) are kept in TIER_ORDER for backward compat
 * with existing subscribers but are NOT included in PUBLIC_TIERS.
 *
 * LAUNCH PRICING: ~2x the baseline (Start $58, Growth $118, Pro $238).
 * Admin can change prices from /admin/plans without code deploy.
 *
 * Capability minTierIndex maps to PUBLIC_TIER_ORDER (4 levels: 0=Start, 1=Growth,
 * 2=Pro, 3=Enterprise). The legacy k_business/k_scale tiers sit at index 3
 * (treated as Enterprise for capability resolution).
 */

export type Bilingual = { ar: string; en: string };

/**
 * All tier slugs including legacy ones (for backward compat with existing subscribers).
 * PUBLIC_TIER_ORDER is the customer-visible subset.
 */
export const TIER_ORDER = [
  "k_start",
  "k_growth",
  "k_pro",
  "k_business",   // legacy — not public; existing subscribers keep entitlements
  "k_scale",      // legacy — not public; existing subscribers keep entitlements
  "k_enterprise",
] as const;

export type TierSlug = (typeof TIER_ORDER)[number];

/** The 4 tiers shown to customers on pricing pages and upgrade flows. */
export const PUBLIC_TIER_ORDER = [
  "k_start",
  "k_growth",
  "k_pro",
  "k_enterprise",
] as const;

export type PublicTierSlug = (typeof PUBLIC_TIER_ORDER)[number];

/** Internal gating tier (4-value union — unchanged from plan.ts). */
export type InternalTier = "basic" | "pro" | "max" | "companies";

export type CapabilityCategory =
  | "core"
  | "automation"
  | "team"
  | "intelligence"
  | "analytics"
  | "commerce"
  | "scale"
  | "enterprise"
  | "messaging"
  | "operations";

export interface Capability {
  key: string;
  label: Bilingual;
  category: CapabilityCategory;
  /** Index into PUBLIC_TIER_ORDER (0=Start, 1=Growth, 2=Pro, 3=Enterprise). */
  minTierIndex: number;
  /** Not-yet-built — visible in plan matrix but marked "قريباً". */
  comingSoon?: boolean;
}

export const CATEGORY_LABELS: Record<CapabilityCategory, Bilingual> = {
  core:         { ar: "الأساسيات",                en: "Core" },
  automation:   { ar: "الأتمتة والحملات",          en: "Automation & Campaigns" },
  team:         { ar: "الفريق والصلاحيات",          en: "Team & Permissions" },
  intelligence: { ar: "الذكاء والمبيعات",           en: "Intelligence & Sales" },
  analytics:    { ar: "التحليلات والتقارير",         en: "Analytics & Reporting" },
  commerce:     { ar: "التجارة والشحن والرسائل",    en: "Commerce, Shipping & Messaging" },
  messaging:    { ar: "الرسائل والتواصل",           en: "Messaging & Communication" },
  scale:        { ar: "التوسّع والتكاملات",          en: "Scale & Integrations" },
  operations:   { ar: "العمليات والإدارة",           en: "Operations & Administration" },
  enterprise:   { ar: "المؤسسات",                  en: "Enterprise" },
};

/**
 * CAPABILITY MATRIX (4-tier model)
 *
 * Start (0):    Core communication only. Know your customers. Reply fast.
 * Growth (1):   Revenue automation. Campaigns. Recovery. Team.
 * Pro (2):      AI intelligence. Full commerce. K1SMS. Shipping. Support ops. Advanced analytics.
 * Enterprise (3): Custom controls. Multiple teams. Branches. Advanced security. White label.
 */
export const CAPABILITIES: Capability[] = [
  // ── START — core communication & operations (all paying customers) ─────
  { key: "inbox",                 category: "core",       minTierIndex: 0, label: { ar: "صندوق وارد واتساب موحّد",      en: "WhatsApp Inbox" } },
  { key: "auto_reply",            category: "core",       minTierIndex: 0, label: { ar: "ردود تلقائية ذكية",            en: "Smart Auto-Reply" } },
  { key: "bot_configuration",     category: "core",       minTierIndex: 0, label: { ar: "إعداد المساعد الآلي",          en: "Bot Setup & Configuration" } },
  { key: "customer_management",   category: "core",       minTierIndex: 0, label: { ar: "إدارة العملاء (360°)",         en: "Customer Management (360°)" } },
  { key: "order_management",      category: "core",       minTierIndex: 0, label: { ar: "إدارة الطلبات",                en: "Order Management" } },
  { key: "quick_replies",         category: "core",       minTierIndex: 0, label: { ar: "ردود سريعة جاهزة",             en: "Quick Replies" } },
  { key: "basic_analytics",       category: "analytics",  minTierIndex: 0, label: { ar: "تحليلات أساسية",               en: "Basic Analytics" } },
  { key: "products",              category: "commerce",   minTierIndex: 0, label: { ar: "كتالوج المنتجات",               en: "Product Catalog" } },
  { key: "customer_import",       category: "operations", minTierIndex: 0, label: { ar: "استيراد العملاء",               en: "Customer Import" } },
  { key: "data_export",           category: "operations", minTierIndex: 0, label: { ar: "تصدير البيانات",                en: "Data Export" } },
  { key: "whatsapp_connection",   category: "core",       minTierIndex: 0, label: { ar: "إدارة اتصال واتساب",           en: "WhatsApp Connection" } },
  { key: "wallet",                category: "operations", minTierIndex: 0, label: { ar: "المحفظة والرصيد",               en: "Wallet & Credits" } },
  { key: "my_work",               category: "operations", minTierIndex: 0, label: { ar: "عملي اليوم",                   en: "My Work Today" } },

  // ── GROWTH — revenue automation + campaigns ───────────────────────────
  { key: "advanced_automations",  category: "automation", minTierIndex: 1, label: { ar: "أتمتة متقدّمة",              en: "Advanced Automations" } },
  { key: "broadcasts",            category: "automation", minTierIndex: 1, label: { ar: "حملات البثّ الجماعي",        en: "Broadcast Campaigns" } },
  { key: "broadcast_credits",     category: "messaging",  minTierIndex: 1, label: { ar: "حملات الرصيد (بالاستهلاك)", en: "Credit-Based Broadcast Campaigns" } },
  { key: "recovery",              category: "automation", minTierIndex: 1, label: { ar: "استعادة العملاء",             en: "Customer Recovery" } },
  { key: "segments",              category: "automation", minTierIndex: 1, label: { ar: "شرائح العملاء",               en: "Customer Segments" } },
  { key: "working_hours",         category: "automation", minTierIndex: 1, label: { ar: "ساعات العمل والردود خارج الدوام", en: "Working Hours & After-Hours Replies" } },
  { key: "team",                  category: "team",       minTierIndex: 1, label: { ar: "أعضاء الفريق (حتى 5)",       en: "Team Members (up to 5)" } },
  { key: "lead_scoring",          category: "intelligence", minTierIndex: 1, label: { ar: "تقييم العملاء المحتملين",  en: "Lead Scoring" } },
  { key: "flow_builder",          category: "automation", minTierIndex: 1, label: { ar: "منشئ محادثات المبيعات",      en: "Bot / Conversation Builder" } },
  { key: "human_handoff",         category: "automation", minTierIndex: 1, label: { ar: "تحويل للموظف عند الحاجة",    en: "Human Handoff" } },
  { key: "coupons_discounts",     category: "commerce",   minTierIndex: 1, label: { ar: "الكوبونات والخصومات",         en: "Coupons & Discounts" } },
  { key: "qr_broadcast_queue",    category: "messaging",  minTierIndex: 1, label: { ar: "جدولة جلسات الإرسال",        en: "Broadcast Session Queue" } },
  { key: "escalations",           category: "operations", minTierIndex: 1, label: { ar: "التصعيدات والمتابعة",         en: "Escalations & Follow-ups" } },
  { key: "compliance_monitoring", category: "operations", minTierIndex: 1, label: { ar: "لوحة الامتثال وصحة التسليم", en: "Compliance & Delivery Health" } },
  { key: "meta_cloud",            category: "messaging",  minTierIndex: 1, label: { ar: "مركز تكامل Meta والفوترة",   en: "Meta Cloud Integration Center" } },
  { key: "monitoring_center",     category: "operations", minTierIndex: 1, label: { ar: "مركز المراقبة والتنبيهات",    en: "Business Monitoring Center" } },

  // ── PRO — full revenue OS + AI intelligence + K1SMS + shipping + support ──
  { key: "knowledge_base",        category: "intelligence", minTierIndex: 2, label: { ar: "قاعدة المعرفة (AI)",         en: "AI Knowledge Base" } },
  { key: "smart_assistant",       category: "intelligence", minTierIndex: 2, label: { ar: "مساعد مبيعات ذكي",           en: "AI Sales Assistant" } },
  { key: "advanced_insights",     category: "intelligence", minTierIndex: 2, label: { ar: "رؤى متقدّمة عن العملاء",      en: "Advanced Customer Insights" } },
  { key: "sales_pipeline",        category: "intelligence", minTierIndex: 2, label: { ar: "خطّ أنابيب المبيعات",          en: "Sales Pipeline" } },
  { key: "customer_segmentation", category: "intelligence", minTierIndex: 2, label: { ar: "تقسيم العملاء الذكي",          en: "Smart Customer Segmentation" } },
  { key: "smart_campaign_builder",category: "intelligence", minTierIndex: 2, label: { ar: "منشئ الحملات الذكي",           en: "Smart Campaign Builder" } },
  { key: "next_best_action",      category: "intelligence", minTierIndex: 2, label: { ar: "الإجراء الأمثل التالي (AI)",   en: "Next Best Action (AI)" } },
  { key: "revenue_copilot",       category: "intelligence", minTierIndex: 2, label: { ar: "مساعد الإيرادات (AI)",         en: "Revenue Copilot (AI)" } },
  { key: "advanced_analytics",    category: "analytics",    minTierIndex: 2, label: { ar: "تحليلات متقدّمة",              en: "Advanced Analytics" } },
  { key: "revenue_attribution",   category: "analytics",    minTierIndex: 2, label: { ar: "إسناد الإيرادات",              en: "Revenue Attribution" } },
  { key: "forecasting",           category: "analytics",    minTierIndex: 2, label: { ar: "توقّع الإيرادات",              en: "Revenue Forecasting" } },
  { key: "funnel_analytics",      category: "analytics",    minTierIndex: 2, label: { ar: "قمع التحويل",                  en: "Conversion Funnel Analytics" } },
  { key: "business_performance",  category: "analytics",    minTierIndex: 2, label: { ar: "أداء النشاط التجاري",          en: "Business Performance" } },
  { key: "k1sms",                 category: "messaging",    minTierIndex: 2, label: { ar: "K1SMS — رسائل SMS تجارية",          en: "K1SMS — Transactional SMS" } },
  { key: "sms_messaging",         category: "messaging",    minTierIndex: 2, label: { ar: "إدارة الرسائل القصيرة",              en: "SMS Messaging Interface" } },
  { key: "shipping_tracking",     category: "commerce",     minTierIndex: 2, label: { ar: "الشحن والتتبّع",                    en: "Shipping & Tracking" } },
  { key: "loyalty_rewards",       category: "commerce",     minTierIndex: 2, label: { ar: "الولاء والمكافآت",                  en: "Loyalty & Rewards" } },
  { key: "team_routing",          category: "team",         minTierIndex: 2, label: { ar: "توزيع المحادثات على الفريق",        en: "Team Routing" } },
  { key: "support_inbox",         category: "team",         minTierIndex: 2, label: { ar: "صندوق دعم العمليات (SLA)",          en: "Support Ops Inbox (SLA)" } },
  { key: "audit_log",             category: "operations",   minTierIndex: 2, label: { ar: "سجل النشاط والتدقيق",               en: "Activity & Audit Log" } },
  { key: "integrations",          category: "scale",        minTierIndex: 2, label: { ar: "التكاملات مع الأنظمة",              en: "Third-Party Integrations" } },
  { key: "api_access",            category: "scale",        minTierIndex: 2, label: { ar: "وصول API للمطوّرين",                en: "Developer API Access" } },
  { key: "safety_controls",       category: "operations",   minTierIndex: 2, label: { ar: "لوحة السلامة وتحكّم الحماية",       en: "Safety & Anti-Ban Controls" } },
  { key: "revenue_pro",           category: "analytics",    minTierIndex: 2, label: { ar: "تحليلات الإيرادات المتقدّمة (Pro)", en: "Revenue Pro Analytics" } },

  // ── ENTERPRISE — custom controls + multi-team + scale ────────────────────
  { key: "multi_team",          category: "team",       minTierIndex: 3, label: { ar: "فرق متعدّدة مع صلاحيات منفصلة", en: "Multi-Team with Isolated Permissions" } },
  { key: "multi_branch",        category: "scale",      minTierIndex: 3, label: { ar: "إدارة الفروع المتعدّدة",          en: "Multi-Branch Management" } },
  { key: "multi_whatsapp",      category: "scale",      minTierIndex: 3, label: { ar: "أرقام واتساب متعدّدة",            en: "Multiple WhatsApp Numbers" } },
  { key: "custom_integrations", category: "scale",      minTierIndex: 3, label: { ar: "تكاملات مخصّصة",                  en: "Custom Integrations" } },
  { key: "approval_workflows",  category: "team",       minTierIndex: 3, label: { ar: "مسارات الموافقات",                en: "Approval Workflows" } },
  { key: "advanced_reporting",  category: "analytics",  minTierIndex: 3, label: { ar: "تقارير تنفيذية متقدّمة",          en: "Advanced Executive Reporting" } },
  { key: "white_label",         category: "enterprise", minTierIndex: 3, comingSoon: true, label: { ar: "علامة بيضاء (White Label)", en: "White Label" } },
  { key: "dedicated_infra",     category: "enterprise", minTierIndex: 3, label: { ar: "بنية تحتية مخصّصة",              en: "Dedicated Infrastructure" } },
  { key: "priority_support",    category: "enterprise", minTierIndex: 3, label: { ar: "دعم ذو أولوية (SLA)",            en: "Priority Support (SLA)" } },
  { key: "custom_dev",          category: "enterprise", minTierIndex: 3, label: { ar: "تطوير مخصّص",                    en: "Custom Development" } },
  { key: "sla",                 category: "enterprise", minTierIndex: 3, label: { ar: "اتفاقية مستوى خدمة (SLA)",       en: "SLA Agreement" } },
  { key: "custom_billing",      category: "enterprise", minTierIndex: 3, label: { ar: "فوترة مخصّصة",                   en: "Custom Billing" } },
];

export interface TierLimits {
  messages:    number;  // monthly WhatsApp messages; 0 = unlimited
  ai:          number;  // monthly AI requests; 0 = unlimited
  broadcasts:  number;  // monthly broadcast campaigns; 0 = unlimited
  whatsapp:    number;  // concurrent WhatsApp numbers
  team:        number;  // team members (incl. owner); 0 = unlimited
  automations: number;  // active automations; 0 = unlimited
  kbDocs:      number;  // knowledge-base documents; 0 = unlimited
  customers:   number;  // CRM customer records; 0 = unlimited
}

export interface TierDef {
  slug: TierSlug;
  /** Display order (0=Start … 5=Enterprise). */
  index: number;
  /** Whether this tier is publicly visible on pricing / upgrade pages. */
  public: boolean;
  name: Bilingual;
  tagline: Bilingual;
  /** Display price (USD/month). null = contact sales. */
  priceUsdMonthly: number | null;
  /** Display price (USD/year). null = contact sales. */
  priceUsdYearly: number | null;
  contactSales?: boolean;
  popular?: boolean;
  recommended?: boolean;
  audience: Bilingual[];
  internalTier: InternalTier;
  limits: TierLimits;
  metaAccess: "none" | "limited" | "full";
  analyticsAccess: "basic" | "advanced";
  /**
   * The index into PUBLIC_TIER_ORDER used for capability resolution.
   * Legacy tiers (k_business=2, k_scale=2) map to Pro; they keep
   * their full entitlements without appearing on the public pricing page.
   */
  capIndex: number;
}

export const TIERS: TierDef[] = [
  // ── START ──────────────────────────────────────────────────────────────────
  {
    slug: "k_start",
    index: 0,
    public: true,
    capIndex: 0,
    name:    { ar: "KEYONE Start",   en: "KEYONE Start" },
    tagline: { ar: "ابدأ رحلتك على واتساب باحتراف", en: "Start selling on WhatsApp, professionally" },
    priceUsdMonthly: 58,
    priceUsdYearly:  580,
    audience: [
      { ar: "العلامات المحلية الصغيرة", en: "Small Local Brands" },
      { ar: "الأعمال الجديدة",          en: "New Businesses" },
      { ar: "روّاد الأعمال الأفراد",    en: "Solo Founders" },
    ],
    internalTier:    "basic",
    metaAccess:      "none",
    analyticsAccess: "basic",
    limits: { messages: 2000, ai: 1000, broadcasts: 0, whatsapp: 1, team: 1, automations: 0, kbDocs: 0, customers: 2000 },
  },

  // ── GROWTH ─────────────────────────────────────────────────────────────────
  {
    slug: "k_growth",
    index: 1,
    public: true,
    capIndex: 1,
    name:    { ar: "KEYONE Growth", en: "KEYONE Growth" },
    tagline: { ar: "نمِّ مبيعاتك بالأتمتة واستعادة العملاء", en: "Grow with automation & customer recovery" },
    priceUsdMonthly: 118,
    priceUsdYearly:  1180,
    popular: true,
    audience: [
      { ar: "المتاجر الإلكترونية النامية", en: "Growing E-commerce Stores" },
      { ar: "العيادات والخدمات",            en: "Clinics & Service Businesses" },
      { ar: "فرق المبيعات الصغيرة",         en: "Small Sales Teams" },
    ],
    internalTier:    "pro",
    metaAccess:      "none",
    analyticsAccess: "basic",
    limits: { messages: 10000, ai: 5000, broadcasts: 8, whatsapp: 1, team: 5, automations: 15, kbDocs: 0, customers: 10000 },
  },

  // ── PRO ────────────────────────────────────────────────────────────────────
  {
    slug: "k_pro",
    index: 2,
    public: true,
    capIndex: 2,
    name:    { ar: "KEYONE Pro", en: "KEYONE Pro" },
    tagline: { ar: "نظام إيرادات كامل: ذكاء · شحن · SMS · دعم",  en: "Full revenue OS: AI · Shipping · SMS · Support" },
    priceUsdMonthly: 238,
    priceUsdYearly:  2380,
    recommended: true,
    audience: [
      { ar: "الأعمال الراسخة",            en: "Established Businesses" },
      { ar: "متاجر إلكترونية متوسطة",     en: "Mid-size E-commerce" },
      { ar: "شركات العقارات والسيارات",   en: "Real Estate & Car Showrooms" },
      { ar: "العمليات متعدّدة الفرق",      en: "Multi-Team Operations" },
    ],
    internalTier:    "max",
    metaAccess:      "limited",
    analyticsAccess: "advanced",
    limits: { messages: 40000, ai: 20000, broadcasts: 30, whatsapp: 2, team: 10, automations: 0, kbDocs: 0, customers: 0 },
  },

  // ── BUSINESS (legacy, non-public — kept for existing subscribers) ──────────
  {
    slug: "k_business",
    index: 3,
    public: false,
    capIndex: 2,   // maps to Pro capability level
    name:    { ar: "KEYONE Business", en: "KEYONE Business" },
    tagline: { ar: "باقة Business — لم تعد تُعرض للعملاء الجدد", en: "Business — no longer offered to new customers" },
    priceUsdMonthly: 249,
    priceUsdYearly:  2490,
    audience: [],
    internalTier:    "max",
    metaAccess:      "limited",
    analyticsAccess: "advanced",
    limits: { messages: 40000, ai: 30000, broadcasts: 30, whatsapp: 3, team: 10, automations: 50, kbDocs: 0, customers: 40000 },
  },

  // ── SCALE (legacy, non-public — kept for existing subscribers) ────────────
  {
    slug: "k_scale",
    index: 4,
    public: false,
    capIndex: 2,   // maps to Pro capability level
    name:    { ar: "KEYONE Scale", en: "KEYONE Scale" },
    tagline: { ar: "باقة Scale — لم تعد تُعرض للعملاء الجدد", en: "Scale — no longer offered to new customers" },
    priceUsdMonthly: 499,
    priceUsdYearly:  4990,
    audience: [],
    internalTier:    "max",
    metaAccess:      "full",
    analyticsAccess: "advanced",
    limits: { messages: 100000, ai: 80000, broadcasts: 100, whatsapp: 6, team: 25, automations: 0, kbDocs: 0, customers: 0 },
  },

  // ── ENTERPRISE ─────────────────────────────────────────────────────────────
  {
    slug: "k_enterprise",
    index: 5,
    public: true,
    capIndex: 3,
    name:    { ar: "KEYONE Enterprise", en: "KEYONE Enterprise" },
    tagline: { ar: "كل شيء · بلا حدود · فريق مخصّص · SLA",    en: "Everything · Unlimited · Dedicated team · SLA" },
    priceUsdMonthly: null,
    priceUsdYearly:  null,
    contactSales: true,
    audience: [
      { ar: "الشركات الكبرى",             en: "Corporations" },
      { ar: "الأعمال متعدّدة الفروع",       en: "Multi-Branch Businesses" },
      { ar: "التكاملات المخصّصة",          en: "Custom Integrations" },
      { ar: "العلامات البيضاء",             en: "White Label Resellers" },
    ],
    internalTier:    "companies",
    metaAccess:      "full",
    analyticsAccess: "advanced",
    limits: { messages: 0, ai: 0, broadcasts: 0, whatsapp: 0, team: 0, automations: 0, kbDocs: 0, customers: 0 },
  },
];

// ── Derived helpers ───────────────────────────────────────────────────────────

/** Public tiers only (4 tiers shown to customers). */
export const PUBLIC_TIERS: TierDef[] = TIERS.filter((t) => t.public);

const TIER_BY_SLUG: Record<string, TierDef> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t]),
);

export function getTier(slug: string): TierDef | undefined {
  return TIER_BY_SLUG[slug];
}

/** Capabilities unlocked at a given capIndex. */
export function capabilitiesForIndex(capIndex: number): string[] {
  return CAPABILITIES.filter((c) => capIndex >= c.minTierIndex).map((c) => c.key);
}

/** Does a tier (by slug) include a capability key? */
export function tierHasCapability(slug: string, capKey: string): boolean {
  const tier = TIER_BY_SLUG[slug];
  const cap = CAPABILITIES.find((c) => c.key === capKey);
  if (!tier || !cap) return false;
  return tier.capIndex >= cap.minTierIndex;
}

/** First (cheapest) PUBLIC tier slug that unlocks the capability — for upgrade CTAs. */
export function tierUnlocking(capKey: string): TierSlug | null {
  const cap = CAPABILITIES.find((c) => c.key === capKey);
  if (!cap) return null;
  const tier = PUBLIC_TIERS.find((t) => t.capIndex >= cap.minTierIndex);
  return tier?.slug ?? null;
}

/**
 * Build the `featureFlags` JSON object the DB Plan row should carry for a tier.
 * Uses `capIndex` so legacy tiers resolve correctly.
 */
export function featureFlagsForTier(tier: TierDef): Record<string, boolean | number> {
  const flags: Record<string, boolean | number> = {};
  for (const cap of CAPABILITIES) {
    flags[cap.key] = tier.capIndex >= cap.minTierIndex;
  }
  flags.team        = tier.limits.team;
  flags.automations = tier.limits.automations;
  flags.kbDocs      = tier.limits.kbDocs;
  flags.customers   = tier.limits.customers;
  return flags;
}

/** Yearly savings vs paying monthly. Returns null for contact-sales tiers. */
export function yearlySavings(tier: TierDef): number | null {
  if (tier.priceUsdMonthly == null || tier.priceUsdYearly == null) return null;
  return tier.priceUsdMonthly * 12 - tier.priceUsdYearly;
}

export const YEARLY_SAVINGS_LABEL: Bilingual = { ar: "وفّر حتى 18%", en: "Save up to 18%" };

/**
 * Monthly broadcast-credit allotment per public tier.
 * Gated by BROADCAST_MONTHLY_CREDITS_ENABLED env flag.
 */
export const MONTHLY_BROADCAST_CREDITS: Record<TierSlug, number> = {
  k_start:      0,
  k_growth:     2000,
  k_pro:        10000,
  k_business:   15000,   // legacy
  k_scale:      50000,   // legacy
  k_enterprise: 200000,
};

export function monthlyBroadcastCreditsForSlug(slug: string): number {
  return (slug in MONTHLY_BROADCAST_CREDITS)
    ? MONTHLY_BROADCAST_CREDITS[slug as TierSlug]
    : 0;
}

/**
 * Monthly AI Brain credit allotment per tier.
 * Gated by BRAIN_MONTHLY_CREDITS_ENABLED env flag.
 */
export const MONTHLY_BRAIN_CREDITS: Record<TierSlug, number> = {
  k_start:      200,
  k_growth:     1000,
  k_pro:        5000,
  k_business:   5000,    // legacy
  k_scale:      20000,   // legacy
  k_enterprise: 100000,
};

export function monthlyBrainCreditsForSlug(slug: string): number {
  return (slug in MONTHLY_BRAIN_CREDITS)
    ? MONTHLY_BRAIN_CREDITS[slug as TierSlug]
    : 0;
}

/** SMS credit allotment per tier (0 = none / not included). */
export const MONTHLY_SMS_CREDITS: Record<TierSlug, number> = {
  k_start:      0,
  k_growth:     0,
  k_pro:        500,
  k_business:   500,     // legacy
  k_scale:      2000,    // legacy
  k_enterprise: 10000,
};

export function monthlySmsCreditsForSlug(slug: string): number {
  return (slug in MONTHLY_SMS_CREDITS)
    ? MONTHLY_SMS_CREDITS[slug as TierSlug]
    : 0;
}
