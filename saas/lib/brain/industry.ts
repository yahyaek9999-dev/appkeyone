/**
 * lib/brain/industry.ts — pluggable Industry Brain framework.
 *
 * Each industry brain is a small descriptor (signals + prompt hints + lead
 * weighting). The registry is open: registerIndustryBrain() lets new verticals
 * plug in without touching the core. BrainProfile.industry references a key here.
 */
import { normalizeArabic } from "./dialect";

export type IndustryKey =
  | "furniture" | "cars" | "clinics" | "real_estate" | "restaurants" | "ecommerce" | "generic";

export interface IndustryBrain {
  key: IndustryKey | string;
  label: { ar: string; en: string };
  /** Keyword signals (ar + en) used to detect the industry from text. */
  signals: string[];
  /** Short system-prompt hint injected by the router for this vertical. */
  promptHints: string;
  /** Extra lead-score weight when a buying signal appears in this vertical. */
  buyingWeight: number;
}

const REGISTRY = new Map<string, IndustryBrain>();

export function registerIndustryBrain(brain: IndustryBrain): void {
  REGISTRY.set(brain.key, brain);
}

export function getIndustryBrain(key: string | null | undefined): IndustryBrain {
  return REGISTRY.get(key || "generic") || REGISTRY.get("generic")!;
}

export function listIndustryBrains(): IndustryBrain[] {
  return Array.from(REGISTRY.values());
}

// ---- Built-in verticals ----------------------------------------------------
registerIndustryBrain({ key: "furniture", label: { ar: "أثاث", en: "Furniture" }, buyingWeight: 12,
  signals: ["اثاث", "كنبة", "كنب", "سرير", "دولاب", "مطبخ", "ترابيزة", "طاولة", "خشب", "تنجيد", "furniture", "sofa", "bed", "wardrobe", "table"],
  promptHints: "Furniture retail: ask about room, dimensions, material, color, delivery & assembly." });
registerIndustryBrain({ key: "cars", label: { ar: "سيارات", en: "Cars" }, buyingWeight: 15,
  signals: ["عربية", "سيارة", "موديل", "كيلومتر", "موتور", "فابريكا", "اقساط", "car", "vehicle", "model", "mileage", "engine"],
  promptHints: "Automotive: capture model/year, mileage, budget, financing, inspection & test-drive." });
registerIndustryBrain({ key: "clinics", label: { ar: "عيادات", en: "Clinics" }, buyingWeight: 10,
  signals: ["دكتور", "عيادة", "كشف", "حجز", "موعد", "علاج", "اشعة", "تحليل", "clinic", "doctor", "appointment", "treatment"],
  promptHints: "Healthcare: book appointment, confirm specialty, time slot, location; never give diagnosis." });
registerIndustryBrain({ key: "real_estate", label: { ar: "عقارات", en: "Real Estate" }, buyingWeight: 14,
  signals: ["شقة", "فيلا", "ايجار", "تمليك", "متر", "عقار", "كمبوند", "دور", "غرفة", "apartment", "villa", "rent", "property"],
  promptHints: "Real estate: capture area, budget, bedrooms, finishing, payment plan; schedule a viewing." });
registerIndustryBrain({ key: "restaurants", label: { ar: "مطاعم", en: "Restaurants" }, buyingWeight: 8,
  signals: ["منيو", "اكل", "توصيل", "طلب", "وجبة", "عرض", "حجز طاولة", "menu", "food", "delivery", "meal", "order"],
  promptHints: "Restaurant: share menu, take order, capture address & time, upsell combos & drinks." });
registerIndustryBrain({ key: "ecommerce", label: { ar: "تجارة إلكترونية", en: "E-commerce" }, buyingWeight: 10,
  signals: ["منتج", "اوردر", "شحن", "مقاس", "لون", "ستوك", "متوفر", "كاش", "product", "order", "shipping", "size", "color", "stock"],
  promptHints: "E-commerce: confirm SKU/size/color/stock, shipping cost & ETA, COD vs prepaid." });
registerIndustryBrain({ key: "generic", label: { ar: "عام", en: "Generic" }, buyingWeight: 8,
  signals: [],
  promptHints: "General business: understand the need, qualify, and move toward a booking or order." });

/** Detect the most likely industry for a piece of text (returns key + score). */
export function detectIndustry(text: string): { industry: IndustryKey | string; score: number } {
  const norm = normalizeArabic(text).toLowerCase();
  let best = "generic";
  let bestScore = 0;
  for (const brain of REGISTRY.values()) {
    if (brain.key === "generic") continue;
    let s = 0;
    for (const sig of brain.signals) {
      if (norm.includes(normalizeArabic(sig).toLowerCase())) s += 1;
    }
    if (s > bestScore) { bestScore = s; best = brain.key; }
  }
  return { industry: best, score: bestScore };
}
