// Lightweight order extractor.
//
// Scans the recent conversation tail and pulls out product / quantity / size /
// color / price / address / payment-method hints using pure regex + a small
// Arabic lexicon. Returns a draft + a 0-100 confidence score.
//
// Designed to run BEFORE any LLM call. If confidence is low, the caller can
// optionally fall back to an LLM extraction (we do not require it).

import { normalizeAr } from "./semantic-match";

export interface OrderDraftItem {
  name: string;
  size?: string;
  color?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderDraft {
  items: OrderDraftItem[];
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: string;
  paymentMethod?: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  currency: string;
  notes: string;       // short Arabic merchant-facing note
  confidence: number;  // 0-100
}

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------

const COLORS = [
  ["احمر","أحمر","حمراء","red"],
  ["ازرق","أزرق","زرقاء","blue"],
  ["اسود","أسود","سوداء","black"],
  ["ابيض","أبيض","بيضاء","white"],
  ["اخضر","أخضر","خضراء","green"],
  ["اصفر","أصفر","صفراء","yellow"],
  ["بني","بنية","brown"],
  ["رمادي","رمادية","gray","grey"],
  ["وردي","زهري","pink"],
  ["بنفسجي","موف","purple"],
  ["برتقالي","orange"],
  ["بيج","beige"],
  ["كحلي","نيلي","navy"],
];

const SIZES_AR_KEYS = ["مقاس","سايز","مقاسه","مقاسي","حجم"];

const PAYMENT_KEYWORDS: Array<[string, string[]]> = [
  ["cod",           ["كاش","عند الاستلام","الدفع عند","عند الباب","cod"]],
  ["instapay",      ["انستاباي","instapay","انستا باي"]],
  ["vodafone_cash", ["فودافون كاش","فودافون","vodafone cash","vodafone"]],
  ["card",          ["فيزا","ماستر","بطاقة","visa","master","card","credit"]],
  ["bank_transfer", ["تحويل بنكي","تحويل","حوّلت","حولت","حوالة","bank","transfer"]],
];

const ADDRESS_HINTS = [
  "العنوان","عنواني","عنوان","ابعت","ابعتلي","شارع","شقه","شقة","عماره","عمارة",
  "دور","الدور","محافظه","محافظة","مدينه","مدينة","قريه","قرية","منطقه","منطقة",
  "address","street","apt","building","floor","city","district",
];

const ARABIC_NUMERALS: Record<string, string> = {
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
  "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
};

function arNumToWestern(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => ARABIC_NUMERALS[c] || c);
}

// ---------------------------------------------------------------------------
// Field detectors
// ---------------------------------------------------------------------------

function detectQuantity(text: string): number {
  const t = arNumToWestern(text);
  // "2 قطعة", "عدد 3", "كميه 4", "اتنين", explicit numbers
  const m1 = t.match(/(?:عدد|كميه|كمية|قطع(?:ه|ة)?|×|x)\s*[:\-]?\s*(\d{1,3})/i);
  if (m1) return clampQty(parseInt(m1[1], 10));
  const m2 = t.match(/(\d{1,3})\s*(?:قطع(?:ه|ة)?|×|pcs?|x)/i);
  if (m2) return clampQty(parseInt(m2[1], 10));
  // Arabic word numbers
  const norm = normalizeAr(text);
  if (/\bاتنين\b/.test(norm)) return 2;
  if (/\bتلاته\b|\bتلاتة\b|\bثلاثه\b|\bثلاثة\b/.test(norm)) return 3;
  if (/\bاربعه\b|\bأربعه\b|\bاربعة\b/.test(norm)) return 4;
  return 1;
}

function clampQty(n: number): number {
  if (!isFinite(n) || n < 1) return 1;
  if (n > 999) return 999;
  return n;
}

function detectSize(text: string): string | undefined {
  const t = arNumToWestern(text);
  // "مقاس L" / "مقاس 42"
  const m1 = t.match(new RegExp(`(?:${SIZES_AR_KEYS.join("|")})\\s*[:\\-]?\\s*([a-zA-Z]{1,4}|\\d{1,3})`, "i"));
  if (m1) return m1[1].toUpperCase();
  // Bare size tokens with word boundary
  const m2 = t.match(/\b(xxxl|xxl|xl|l|m|s|xs)\b/i);
  if (m2) return m2[1].toUpperCase();
  return undefined;
}

function detectColor(text: string): string | undefined {
  const norm = normalizeAr(text);
  for (const group of COLORS) {
    for (const variant of group) {
      const nv = normalizeAr(variant);
      if (nv && norm.includes(nv)) return group[0]; // canonical (first variant)
    }
  }
  return undefined;
}

function detectPhone(text: string): string | undefined {
  const t = arNumToWestern(text);
  // Egyptian mobile (most common): 01XXXXXXXXX (11 digits)
  const eg = t.match(/(?<![\d])(01[0-9]{9})(?![\d])/);
  if (eg) return eg[1];
  // International with country code (8-15 digits)
  const intl = t.match(/(?<![\d])(\+?\d{8,15})(?![\d])/);
  if (intl) return intl[1];
  return undefined;
}

function detectPrice(text: string): number {
  const t = arNumToWestern(text);
  // numbers near "جنيه", "ج", "EGP", "ل.م", "ر.س", "$"
  const m = t.match(/(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:جنيه|ج\b|egp|le|ر\.س|sar|aed|درهم|\$|usd)/i);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")));
  // bare "بكام 350" / "السعر 250"
  const m2 = t.match(/(?:بكام|السعر|سعرها|سعره|ثمنها|ثمنه|price|cost)\D{0,4}(\d{2,6})/i);
  if (m2) return parseInt(m2[1], 10);
  return 0;
}

/**
 * Detect a discount expressed either as a percentage ("خصم 10%") or a flat
 * amount ("خصم 50 جنيه" / "خصم 50"). Returns `{ pct, flat }` where exactly
 * one is > 0. Returns nulls if no discount was mentioned.
 */
function detectDiscount(text: string): { pct: number; flat: number } {
  const t = arNumToWestern(text);
  // Percentage form first — "خصم 10%", "10٪ خصم", "تخفيض 15%"
  const pctMatch = t.match(/(?:خصم|تخفيض|عرض|discount)\D{0,8}(\d{1,2})\s*[%٪]/i)
    || t.match(/(\d{1,2})\s*[%٪]\s*(?:خصم|تخفيض|off|discount)/i);
  if (pctMatch) {
    const n = parseInt(pctMatch[1], 10);
    if (n >= 1 && n <= 90) return { pct: n, flat: 0 };
  }
  // Flat form — "خصم 50 جنيه" / "خصم 50"
  const flatMatch = t.match(/(?:خصم|تخفيض|discount|off)\D{0,8}(\d{2,5})(?:\s*(?:جنيه|ج\b|egp|le|ر\.س))?/i);
  if (flatMatch) {
    const n = parseInt(flatMatch[1], 10);
    if (n >= 5 && n <= 10000) return { pct: 0, flat: n };
  }
  return { pct: 0, flat: 0 };
}

function detectPayment(text: string): string | undefined {
  const norm = normalizeAr(text);
  for (const [code, keys] of PAYMENT_KEYWORDS) {
    for (const k of keys) {
      if (norm.includes(normalizeAr(k))) return code;
    }
  }
  return undefined;
}

function detectAddress(text: string): string | undefined {
  const norm = normalizeAr(text);
  let hits = 0;
  for (const h of ADDRESS_HINTS) {
    if (norm.includes(normalizeAr(h))) { hits++; if (hits >= 1) break; }
  }
  if (!hits) return undefined;
  // Address tends to be long — return up to 200 chars of the raw text
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

function detectName(text: string): string | undefined {
  // "اسمي أحمد", "انا محمد", "name: ahmad"
  const m = text.match(/(?:اسمي|انا|أنا|اسم[يي]?|name)[\s:]+([\u0600-\u06FFA-Za-z]{2,30}(?:\s+[\u0600-\u06FFA-Za-z]{2,30}){0,3})/i);
  if (m) return m[1].trim();
  return undefined;
}

function detectProductName(text: string): string | undefined {
  // Heuristic: tokens around "هاخد", "عاوز", "ابعتلي", "اطلب" — take ~3 words after
  const m = text.match(/(?:هاخد(?:ه|ها)?|عاوز(?:ه|ها)?|ابعتلي|اطلب|احجز|اشتري|اشتراك|i want|i'll take|buy)\s+([\u0600-\u06FFA-Za-z][\u0600-\u06FF\s\w]{2,60})/i);
  if (m) {
    return m[1]
      .replace(/[.,،؟?!\n].*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Confidence scoring — pure heuristic.
// ---------------------------------------------------------------------------

function scoreConfidence(draft: Partial<OrderDraft>): number {
  let s = 0;
  if (draft.items && draft.items.length && draft.items[0].name) s += 30;
  if (draft.items?.[0]?.unitPrice) s += 20;
  if (draft.customerPhone)   s += 20;
  if (draft.shippingAddress) s += 15;
  if (draft.paymentMethod)   s += 10;
  if (draft.customerName)    s += 5;
  if (draft.items?.[0]?.size || draft.items?.[0]?.color) s += 5;
  return Math.min(100, s);
}

// ---------------------------------------------------------------------------
// Public — extract a draft from the recent conversation.
// `messages` is ordered chronologically; we only scan the last ~10 turns.
// ---------------------------------------------------------------------------

export interface ExtractInput {
  messages: { role: string; content: string }[];
  fallbackCustomerName?: string | null;
  fallbackCustomerPhone?: string | null;
}

export function extractOrderFast(input: ExtractInput): OrderDraft {
  const recent = (input.messages || []).slice(-12);
  // Bias toward customer messages but keep some assistant turns
  // (we may have quoted the price in the assistant reply).
  const customerText = recent.filter((m) => m.role === "user")
    .map((m) => m.content).join("\n");
  const assistantText = recent.filter((m) => m.role === "assistant")
    .map((m) => m.content).join("\n");
  const fullText = `${customerText}\n${assistantText}`;

  const productName = detectProductName(customerText) || detectProductName(assistantText) || "منتج";
  const quantity    = detectQuantity(customerText);
  const size        = detectSize(customerText);
  const color       = detectColor(customerText);
  // Prefer price from the assistant (likely a confirmed quote) then customer.
  const priceFromAsst = detectPrice(assistantText);
  const priceFromUser = detectPrice(customerText);
  const unitPrice   = priceFromAsst || priceFromUser || 0;
  const lineTotal   = unitPrice * Math.max(1, quantity);

  const customerPhone = detectPhone(customerText) || (input.fallbackCustomerPhone || undefined);
  const shippingAddress = detectAddress(customerText);
  const paymentMethod = detectPayment(fullText);
  const customerName = detectName(customerText) || (input.fallbackCustomerName || undefined);

  const item: OrderDraftItem = {
    name: productName.slice(0, 80),
    size, color,
    quantity,
    unitPrice,
    lineTotal,
  };

  // Discount: scan customer text first (their request), then assistant text
  // (merchant's offer). Percentage takes priority over flat. Resolved value
  // is subtracted from subtotal so Order.total reflects what the customer pays.
  const dcCustomer = detectDiscount(customerText);
  const dcAssistant = (dcCustomer.pct > 0 || dcCustomer.flat > 0) ? dcCustomer : detectDiscount(assistantText);
  const subtotal = lineTotal;
  let discount = 0;
  if (dcAssistant.pct > 0) {
    discount = Math.round((subtotal * dcAssistant.pct) / 100);
  } else if (dcAssistant.flat > 0) {
    discount = Math.min(dcAssistant.flat, subtotal); // never negative total
  }
  const total = Math.max(0, subtotal - discount);

  const draft: OrderDraft = {
    items: [item],
    customerName,
    customerPhone,
    shippingAddress,
    paymentMethod,
    subtotal,
    shipping: 0,
    discount,
    total,
    currency: "EGP",
    notes: "",
    confidence: 0,
  };
  draft.confidence = scoreConfidence(draft);

  // Small Arabic note for the merchant.
  const missing: string[] = [];
  if (!customerPhone)     missing.push("رقم العميل");
  if (!shippingAddress)   missing.push("العنوان");
  if (!unitPrice)         missing.push("السعر");
  if (!paymentMethod)     missing.push("طريقة الدفع");
  draft.notes = missing.length
    ? `طلب تلقائي — يحتاج مراجعة: ناقص ${missing.join("، ")}.`
    : `طلب تلقائي مكتمل بثقة عالية.`;

  return draft;
}
