/**
 * lib/brain/classify.ts — sales-intelligence classifiers (heuristic, no LLM).
 *
 * Returns zero or more typed classifications for a message, each with a 0-1
 * score + evidence. Context (order history) drives VIP / RETURNING which are
 * not derivable from text alone. Arabic + English markers.
 */
import { normalizeArabic } from "./dialect";

export type InsightType =
  | "PRICE_OBJECTION" | "DISCOUNT_REQUEST" | "BUYING_SIGNAL"
  | "FOLLOWUP_REQUIRED" | "VIP_CUSTOMER" | "ANGRY_CUSTOMER" | "RETURNING_CUSTOMER";

export interface ClassifyContext {
  orderCount?: number;
  totalOrderValue?: number;
  vip?: boolean;
}

export interface Classification {
  type: InsightType;
  label: string;
  score: number;   // 0-1
  evidence: string;
}

const TEXT_RULES: Array<{ type: InsightType; label: string; markers: string[] }> = [
  { type: "PRICE_OBJECTION", label: "اعتراض على السعر", markers: ["غالي", "غاليه", "كتير اوي", "مكلف", "السعر عالي", "expensive", "too much", "pricey", "cant afford", "مش قادر ادفع"] },
  { type: "DISCOUNT_REQUEST", label: "طلب خصم", markers: ["خصم", "تخفيض", "اقل سعر", "اخر سعر", "عرض", "كوبون", "discount", "offer", "coupon", "deal", "ينفع تنزل"] },
  { type: "BUYING_SIGNAL", label: "نية شراء", markers: ["عايز اشتري", "ابغى اطلب", "احجز", "اوردر", "متوفر", "التوصيل", "الدفع", "كاش", "ابعتلي", "تمام هاخده", "buy", "order", "i want", "available", "checkout", "purchase"] },
  { type: "FOLLOWUP_REQUIRED", label: "يحتاج متابعة", markers: ["هفكر", "بعدين", "لاحقا", "هرد عليك", "مش دلوقتي", "later", "think about it", "i'll get back", "not now", "هشوف"] },
  { type: "ANGRY_CUSTOMER", label: "عميل غاضب", markers: ["زعلان", "مش راضي", "وحش", "سيء", "زبالة", "نصب", "هبلغ", "angry", "terrible", "worst", "scam", "refund now", "!!!"] },
];

export function classifyMessage(text: string, ctx: ClassifyContext = {}): Classification[] {
  const norm = normalizeArabic(text).toLowerCase();
  const out: Classification[] = [];

  for (const rule of TEXT_RULES) {
    const hits = rule.markers.filter((m) => norm.includes(normalizeArabic(m).toLowerCase()));
    if (hits.length > 0) {
      out.push({ type: rule.type, label: rule.label, score: Math.min(1, 0.5 + hits.length * 0.25), evidence: hits.slice(0, 3).join(", ") });
    }
  }

  // Context-derived classifications (not text-based).
  const orders = Math.max(0, ctx.orderCount || 0);
  const value = Math.max(0, ctx.totalOrderValue || 0);
  if (ctx.vip || orders >= 3 || value >= 5000) {
    out.push({ type: "VIP_CUSTOMER", label: "عميل مميز", score: Math.min(1, 0.6 + orders * 0.1), evidence: `orders=${orders}, value=${Math.round(value)}` });
  }
  if (orders >= 1) {
    out.push({ type: "RETURNING_CUSTOMER", label: "عميل عائد", score: Math.min(1, 0.6 + orders * 0.1), evidence: `orders=${orders}` });
  }
  return out;
}

export const INSIGHT_TYPES: InsightType[] = [
  "PRICE_OBJECTION", "DISCOUNT_REQUEST", "BUYING_SIGNAL", "FOLLOWUP_REQUIRED", "VIP_CUSTOMER", "ANGRY_CUSTOMER", "RETURNING_CUSTOMER",
];
