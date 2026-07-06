// lib/modules.ts — Business Type (vertical) + Workspace Modules registry.
//
// The product historically assumed every merchant sells physical products. This
// registry makes the workspace adapt to the merchant's VERTICAL (Store,
// Restaurant, Agency, Software, Medical, …) by turning whole MODULES on/off. The
// same module map drives the sidebar, dashboard KPIs, readiness checklist, AI
// recommendations, and search — so a disabled module disappears everywhere.
//
// Backward compatibility: an unset businessType resolves to "Store" and a null
// enabledModules means every module is ON, so existing tenants are unchanged.
// Additive only — no rename/removal of existing concepts.

export type ModuleKey =
  | "orders"
  | "products"
  | "inventory"
  | "shipping"
  | "crm"
  | "broadcasts"
  | "ai"
  | "knowledge_base"
  | "employees"
  | "appointments"
  | "subscriptions"
  | "support"
  | "wallet"
  | "reports"
  | "branches";

export const ALL_MODULES: ModuleKey[] = [
  "orders", "products", "inventory", "shipping", "crm", "broadcasts", "ai",
  "knowledge_base", "employees", "appointments", "subscriptions", "support",
  "wallet", "reports", "branches",
];

/** Human labels (Arabic) for the module-toggle UI. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  orders: "الطلبات",
  products: "المنتجات",
  inventory: "المخزون",
  shipping: "الشحن",
  crm: "إدارة العملاء (CRM)",
  broadcasts: "الحملات والبث",
  ai: "الذكاء الاصطناعي",
  knowledge_base: "قاعدة المعرفة",
  employees: "الموظفون",
  appointments: "المواعيد والحجوزات",
  subscriptions: "الاشتراكات",
  support: "الدعم",
  wallet: "المحفظة",
  reports: "التقارير والتحليلات",
  branches: "الفروع",
};

export type Vertical =
  | "Store"
  | "Restaurant"
  | "Agency"
  | "Software"
  | "Medical"
  | "Education"
  | "Services"
  | "RealEstate"
  | "Manufacturing"
  | "Other";

export const DEFAULT_VERTICAL: Vertical = "Store";

/** The onboarding-wizard choices, in order, with Arabic labels + lucide icon name. */
export const VERTICALS: { key: Vertical; label: string; icon: string }[] = [
  { key: "Store", label: "متجر / تجارة إلكترونية", icon: "ShoppingBag" },
  { key: "Restaurant", label: "مطعم / كافيه", icon: "UtensilsCrossed" },
  { key: "Agency", label: "وكالة تسويق / إعلان", icon: "Megaphone" },
  { key: "Software", label: "شركة برمجيات / تقنية", icon: "Code2" },
  { key: "Medical", label: "عيادة / رعاية طبية", icon: "Stethoscope" },
  { key: "Education", label: "تعليم / تدريب", icon: "GraduationCap" },
  { key: "Services", label: "خدمات / استشارات", icon: "Briefcase" },
  { key: "RealEstate", label: "عقارات", icon: "Building2" },
  { key: "Manufacturing", label: "مصنع / تصنيع", icon: "Factory" },
  { key: "Other", label: "أخرى", icon: "Shapes" },
];

/**
 * Per-vertical DEFAULT-OFF modules. A module not listed here is ON by default for
 * that vertical. The merchant can always override per-module (see isModuleEnabled).
 * Commerce-only modules (products/inventory/shipping/orders) are switched off for
 * service/knowledge verticals so we never nag a software company to "add products".
 */
export const VERTICAL_DEFAULT_OFF: Record<Vertical, ModuleKey[]> = {
  Store: [],                                                   // full commerce experience
  Manufacturing: [],                                           // B2B products + inventory + orders
  Restaurant: ["subscriptions"],                               // menu(products)/delivery(shipping)/branches stay ON
  Agency: ["products", "inventory", "shipping", "orders"],
  Software: ["products", "inventory", "shipping", "orders", "branches"],
  Medical: ["products", "inventory", "shipping", "orders", "subscriptions"],
  Education: ["products", "inventory", "shipping", "orders"],
  Services: ["products", "inventory", "shipping", "orders"],
  RealEstate: ["products", "inventory", "shipping", "orders", "subscriptions"],
  Other: [],                                                   // conservative — everything ON
};

/** Case/spacing-tolerant resolution of a stored businessType → a known Vertical. Defaults to Store. */
export function resolveVertical(raw?: string | null): Vertical {
  const s = String(raw || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s) return DEFAULT_VERTICAL;
  const map: Record<string, Vertical> = {
    store: "Store", ecommerce: "Store", shop: "Store", retail: "Store",
    restaurant: "Restaurant", cafe: "Restaurant", food: "Restaurant",
    agency: "Agency", marketing: "Agency", advertising: "Agency",
    software: "Software", tech: "Software", saas: "Software", it: "Software",
    medical: "Medical", clinic: "Medical", clinics: "Medical", doctor: "Medical", healthcare: "Medical",
    education: "Education", training: "Education", school: "Education", courses: "Education",
    services: "Services", service: "Services", consulting: "Services", freelancer: "Services",
    realestate: "RealEstate", property: "RealEstate", realty: "RealEstate",
    manufacturing: "Manufacturing", factory: "Manufacturing", industrial: "Manufacturing",
    other: "Other", general: "Other", generic: "Other",
  };
  return map[s] || DEFAULT_VERTICAL;
}

/** Parse the enabledModules JSON safely. Corrupt/absent → empty overrides (all vertical defaults apply). */
export function parseEnabledModules(json?: string | null): Partial<Record<ModuleKey, boolean>> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Partial<Record<ModuleKey, boolean>>;
  } catch { /* corrupt → treat as no overrides */ }
  return {};
}

/**
 * Is a module enabled for this vertical? Explicit per-module override wins;
 * otherwise the vertical default (ON unless listed in VERTICAL_DEFAULT_OFF).
 */
export function isModuleEnabled(vertical: Vertical, enabledModulesJson: string | null | undefined, mod: ModuleKey): boolean {
  const override = parseEnabledModules(enabledModulesJson);
  if (typeof override[mod] === "boolean") return override[mod] as boolean;
  return !(VERTICAL_DEFAULT_OFF[vertical] || []).includes(mod);
}

/** The full resolved module map for a vertical + overrides. */
export function moduleMap(vertical: Vertical, enabledModulesJson: string | null | undefined): Record<ModuleKey, boolean> {
  const out = {} as Record<ModuleKey, boolean>;
  for (const m of ALL_MODULES) out[m] = isModuleEnabled(vertical, enabledModulesJson, m);
  return out;
}
