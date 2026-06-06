/**
 * Industry-matching system. 11 industry groups, each with 3 maturity levels
 * mapped to a recommended KEYONE tier. Powers the interactive matcher + the
 * visual "which plan fits my business" mapping on the pricing page.
 *
 * Pure presentation config — references tier slugs from `catalog.ts`.
 */

import type { Bilingual, TierSlug } from "./catalog";

export interface IndustryLevel {
  /** Stable key. */
  key: string;
  label: Bilingual;
  /** Recommended tier slug. */
  tier: TierSlug;
  /** One-line rationale shown when this level is selected. */
  why: Bilingual;
}

export interface IndustryGroup {
  key: string;
  icon: string; // emoji
  label: Bilingual;
  levels: [IndustryLevel, IndustryLevel, IndustryLevel];
}

export const INDUSTRIES: IndustryGroup[] = [
  {
    key: "local_brands",
    icon: "🛍️",
    label: { ar: "العلامات المحلية", en: "Local Brands" },
    levels: [
      { key: "local_startup", tier: "k_start", label: { ar: "علامة محلية ناشئة", en: "Local Brand Startup" }, why: { ar: "ردود فورية وإدارة عملاء لبداية احترافية.", en: "Instant replies + customer management to start right." } },
      { key: "local_growth", tier: "k_growth", label: { ar: "علامة محلية نامية", en: "Local Brand Growth" }, why: { ar: "أتمتة وحملات بثّ لزيادة الطلبات.", en: "Automation + broadcasts to drive more orders." } },
      { key: "local_elite", tier: "k_pro", label: { ar: "علامة محلية رائدة", en: "Local Brand Elite" }, why: { ar: "ذكاء كامل ورؤى مبيعات متقدّمة.", en: "Full intelligence + advanced sales insights." } },
    ],
  },
  {
    key: "ecommerce",
    icon: "🏪",
    label: { ar: "المتاجر الإلكترونية", en: "E-Commerce Stores" },
    levels: [
      { key: "ecom_startup", tier: "k_growth", label: { ar: "متجر إلكتروني ناشئ", en: "E-Commerce Startup" }, why: { ar: "أتمتة الطلبات والحملات من اليوم الأول.", en: "Order automation + campaigns from day one." } },
      { key: "ecom_scale", tier: "k_scale", label: { ar: "متجر إلكتروني متوسّع", en: "E-Commerce Scale" }, why: { ar: "أحجام عالية، أرقام متعدّدة، وتكاملات.", en: "High volume, multi-number, integrations." } },
      { key: "ecom_enterprise", tier: "k_enterprise", label: { ar: "متجر إلكتروني مؤسسي", en: "E-Commerce Enterprise" }, why: { ar: "بلا حدود + تكاملات ERP/CRM مخصّصة.", en: "Unlimited + custom ERP/CRM integrations." } },
    ],
  },
  {
    key: "car_showrooms",
    icon: "🚗",
    label: { ar: "معارض السيارات", en: "Car Showrooms" },
    levels: [
      { key: "show_startup", tier: "k_growth", label: { ar: "معرض ناشئ", en: "Showroom Startup" }, why: { ar: "متابعة العملاء المهتمين تلقائياً.", en: "Auto follow-up with interested buyers." } },
      { key: "show_pro", tier: "k_pro", label: { ar: "معرض احترافي", en: "Showroom Pro" }, why: { ar: "تقييم العملاء وخطّ أنابيب المبيعات.", en: "Lead scoring + sales pipeline." } },
      { key: "show_elite", tier: "k_business", label: { ar: "معرض رائد", en: "Showroom Elite" }, why: { ar: "فرق متعدّدة وتقارير تنفيذية.", en: "Multi-team + executive reporting." } },
    ],
  },
  {
    key: "real_estate",
    icon: "🏠",
    label: { ar: "العقارات", en: "Real Estate" },
    levels: [
      { key: "re_startup", tier: "k_growth", label: { ar: "عقارات ناشئة", en: "Real Estate Startup" }, why: { ar: "إدارة الاستفسارات والمتابعات.", en: "Manage inquiries + follow-ups." } },
      { key: "re_growth", tier: "k_pro", label: { ar: "عقارات نامية", en: "Real Estate Growth" }, why: { ar: "تقييم العملاء ورؤى متقدّمة.", en: "Lead scoring + advanced insights." } },
      { key: "re_enterprise", tier: "k_business", label: { ar: "عقارات مؤسسية", en: "Real Estate Enterprise" }, why: { ar: "فرق متعدّدة الفروع وموافقات.", en: "Multi-branch teams + approvals." } },
    ],
  },
  {
    key: "clinics",
    icon: "🏥",
    label: { ar: "العيادات والمراكز الطبية", en: "Clinics & Medical Centers" },
    levels: [
      { key: "clinic_startup", tier: "k_start", label: { ar: "عيادة ناشئة", en: "Clinic Startup" }, why: { ar: "حجوزات وردود تلقائية بدون سكرتيرة.", en: "Bookings + auto-replies, no extra staff." } },
      { key: "clinic_pro", tier: "k_pro", label: { ar: "عيادة احترافية", en: "Clinic Pro" }, why: { ar: "تذكير المواعيد ورؤى المرضى.", en: "Appointment reminders + patient insights." } },
      { key: "clinic_enterprise", tier: "k_business", label: { ar: "مركز طبي مؤسسي", en: "Clinic Enterprise" }, why: { ar: "فروع متعدّدة وفرق وتقارير.", en: "Multi-branch, teams & reporting." } },
    ],
  },
  {
    key: "beauty",
    icon: "💄",
    label: { ar: "التجميل والعناية", en: "Beauty & Aesthetics" },
    levels: [
      { key: "beauty_startup", tier: "k_start", label: { ar: "تجميل ناشئ", en: "Beauty Startup" }, why: { ar: "إدارة الحجوزات والاستفسارات.", en: "Manage bookings + inquiries." } },
      { key: "beauty_growth", tier: "k_growth", label: { ar: "تجميل نامي", en: "Beauty Growth" }, why: { ar: "حملات ترويجية وأتمتة المتابعة.", en: "Promo campaigns + follow-up automation." } },
      { key: "beauty_elite", tier: "k_pro", label: { ar: "تجميل رائد", en: "Beauty Elite" }, why: { ar: "ولاء العملاء ورؤى متقدّمة.", en: "Loyalty + advanced insights." } },
    ],
  },
  {
    key: "restaurants",
    icon: "🍽️",
    label: { ar: "المطاعم والكافيهات", en: "Restaurants & Cafés" },
    levels: [
      { key: "rest_startup", tier: "k_growth", label: { ar: "مطعم ناشئ", en: "Restaurant Startup" }, why: { ar: "استقبال الطلبات وتأكيدها تلقائياً.", en: "Auto order intake + confirmation." } },
      { key: "rest_pro", tier: "k_pro", label: { ar: "مطعم احترافي", en: "Restaurant Pro" }, why: { ar: "حملات ذكية ورؤى الذروة.", en: "Smart campaigns + peak-time insights." } },
      { key: "rest_enterprise", tier: "k_business", label: { ar: "سلسلة مطاعم", en: "Restaurant Enterprise" }, why: { ar: "فروع متعدّدة وتقارير موحّدة.", en: "Multi-branch + unified reporting." } },
    ],
  },
  {
    key: "education",
    icon: "🎓",
    label: { ar: "التعليم والتدريب", en: "Education & Training" },
    levels: [
      { key: "edu_startup", tier: "k_start", label: { ar: "أكاديمية ناشئة", en: "Academy Startup" }, why: { ar: "تسجيل الطلاب والرد على الاستفسارات.", en: "Student sign-ups + inquiry handling." } },
      { key: "edu_growth", tier: "k_growth", label: { ar: "أكاديمية نامية", en: "Academy Growth" }, why: { ar: "حملات تسجيل وأتمتة المتابعة.", en: "Enrollment campaigns + follow-up." } },
      { key: "edu_enterprise", tier: "k_pro", label: { ar: "أكاديمية رائدة", en: "Academy Enterprise" }, why: { ar: "ذكاء كامل ورؤى الطلاب.", en: "Full intelligence + student insights." } },
    ],
  },
  {
    key: "fitness",
    icon: "🏋️",
    label: { ar: "اللياقة والصالات", en: "Fitness & Gyms" },
    levels: [
      { key: "fit_startup", tier: "k_start", label: { ar: "صالة ناشئة", en: "Fitness Startup" }, why: { ar: "اشتراكات وردود تلقائية.", en: "Memberships + auto-replies." } },
      { key: "fit_pro", tier: "k_pro", label: { ar: "صالة احترافية", en: "Fitness Pro" }, why: { ar: "متابعة الأعضاء ورؤى الاحتفاظ.", en: "Member follow-up + retention insights." } },
      { key: "fit_elite", tier: "k_business", label: { ar: "سلسلة صالات", en: "Fitness Elite" }, why: { ar: "فروع متعدّدة وفرق.", en: "Multi-branch + teams." } },
    ],
  },
  {
    key: "logistics",
    icon: "📦",
    label: { ar: "الخدمات اللوجستية والشحن", en: "Logistics & Shipping" },
    levels: [
      { key: "log_startup", tier: "k_growth", label: { ar: "شحن ناشئ", en: "Logistics Startup" }, why: { ar: "تتبّع الطلبات وتحديثات تلقائية.", en: "Order tracking + auto-updates." } },
      { key: "log_growth", tier: "k_business", label: { ar: "شحن نامي", en: "Logistics Growth" }, why: { ar: "فرق متعدّدة وحجوم أعلى.", en: "Multi-team + higher volume." } },
      { key: "log_enterprise", tier: "k_scale", label: { ar: "شحن مؤسسي", en: "Logistics Enterprise" }, why: { ar: "أحجام ضخمة وتكاملات API.", en: "Massive volume + API integrations." } },
    ],
  },
  {
    key: "agencies",
    icon: "🏢",
    label: { ar: "الوكالات وشركات الخدمات", en: "Agencies & Service Companies" },
    levels: [
      { key: "agency_startup", tier: "k_growth", label: { ar: "وكالة ناشئة", en: "Agency Startup" }, why: { ar: "إدارة العملاء والحملات.", en: "Client management + campaigns." } },
      { key: "agency_pro", tier: "k_pro", label: { ar: "وكالة احترافية", en: "Agency Pro" }, why: { ar: "رؤى متقدّمة وخطّ مبيعات.", en: "Advanced insights + sales pipeline." } },
      { key: "agency_enterprise", tier: "k_enterprise", label: { ar: "وكالة مؤسسية", en: "Agency Enterprise" }, why: { ar: "علامة بيضاء وتكاملات مخصّصة.", en: "White label + custom integrations." } },
    ],
  },
];
