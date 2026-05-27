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
  ["cod",           ["كاش","عند الاستلام","الدفع عند","عند الباب","الدفع كاش","cod","cash on delivery"]],
  ["instapay",      ["انستاباي","instapay","انستا باي"]],
  ["vodafone_cash", ["فودافون كاش","فودافون","vodafone cash","vodafone"]],
  ["stc_pay",       ["stc pay","stcpay","اس تي سي باي","stc"]],
  ["mada",          ["مدى","mada"]],
  ["card",          ["فيزا","ماستر","بطاقة","visa","master","card","credit"]],
  ["bank_transfer", ["تحويل بنكي","تحويل","حوّلت","حولت","حوالة","bank","transfer"]],
  ["tabby",         ["تابي","tabby","تقسيط تابي","دفع بالتقسيط"]],
  ["tamara",        ["تمارا","tamara","تمارة"]],
  ["apple_pay",     ["ابل باي","apple pay","ابل بي"]],
  ["urpay",         ["urpay","يور باي","يورباي"]],
  ["valu",          ["val u","فالي","valu"]],
];

const ADDRESS_HINTS = [
  "العنوان","عنواني","عنوان","ابعت","ابعتلي","ارسل","توصيل","وصل",
  // Saudi Arabia
  "الرياض","جدة","جده","مكة","مكه","الدمام","الخبر","المدينة","القصيم","تبوك","بريدة","حائل","الطائف","نجران","جازان","خميس مشيط","القطيف","الأحساء","الهفوف","عرعر","سكاكا",
  // UAE
  "دبي","أبوظبي","ابو ظبي","الشارقة","عجمان","رأس الخيمة","راس الخيمة","الفجيرة","أم القيوين","العين",
  // Kuwait
  "الكويت","مدينة الكويت","حولي","السالمية","الجهراء","الفروانية","الأحمدي","مبارك الكبير",
  // Qatar
  "الدوحة","الريان","الخور","الوكرة","مسيمير","الشحانية","أم صلال",
  // Bahrain
  "المنامة","المحرق","الرفاع","مدينة عيسى","سترة","البديع","الجفير","الدراز",
  // Oman
  "مسقط","صلالة","السيب","صحار","نزوى","الخابورة","إبرا","صور","بهلا",
  // General address terms
  "حي","الحى","الحی","شارع","طريق","بجانب","جنب","قرب","عمارة","عماره","بناية","بوابة","دور","الدور","شقه","شقة",
  "محافظه","محافظة","مدينه","مدينة","قريه","قرية","منطقه","منطقة",
  "district","riyadh","jeddah","dammam","dubai","abu dhabi","doha","manama","kuwait",
  "address","street","apt","building","floor","city","district","landmark",
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
  const m1 = t.match(/(?:عدد|كميه|كمية|قطع(?:ه|ة)?|حبه|حبة|علبه|علبة|كرتون|كرتونة|باكيت|×|x)\s*[:\-]?\s*(\d{1,3})/i);
  if (m1) return clampQty(parseInt(m1[1], 10));
  const m2 = t.match(/(\d{1,3})\s*(?:قطع(?:ه|ة)?|حبه|حبة|علبه|علبة|كرتون|كرتونة|باكيت|×|pcs?|x)/i);
  if (m2) return clampQty(parseInt(m2[1], 10));
  // Arabic word numbers (Egypt/Gulf/MSA common forms)
  const norm = normalizeAr(text);
  if (/\b(واحد|وحده|وحدة)\b/.test(norm)) return 1;
  if (/\b(اتنين|اثنين|إثنين|اثنان|ثنتين|ثنين)\b/.test(norm)) return 2;
  if (/\b(تلاته|تلاتة|ثلاثه|ثلاثة|ثلاث)\b/.test(norm)) return 3;
  if (/\b(اربعه|أربعه|اربعة|أربعة|اربع)\b/.test(norm)) return 4;
  if (/\b(خمسه|خمسة|خمس)\b/.test(norm)) return 5;
  if (/\b(سته|ستة|ست)\b/.test(norm)) return 6;
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
  // Saudi local mobile: 05XXXXXXXX → +9665XXXXXXXX
  const saLocal = t.match(/(?<![\d])0(5[0-9]{8})(?![\d])/);
  if (saLocal) return `+966${saLocal[1]}`;
  // UAE: 05x/06x/04x (9 digits after 0)
  const uaeLocal = t.match(/(?<![\d])0(5[024568]\d{7}|[46]\d{7})(?![\d])/);
  if (uaeLocal) return `+971${uaeLocal[1]}`;
  // Kuwait: 5xxxxxxx/6xxxxxxx/9xxxxxxx (8 digits)
  const kwLocal = t.match(/(?<![\d])(5[0-9]{7}|6[0-9]{7}|9[0-9]{7})(?![\d])/);
  if (kwLocal) return `+965${kwLocal[1]}`;
  // Qatar: 3xxxxxxx/5xxxxxxx/6xxxxxxx/7xxxxxxx (8 digits)
  const qaLocal = t.match(/(?<![\d])(3[0-9]{7}|[567][0-9]{7})(?![\d])/);
  if (qaLocal) return `+974${qaLocal[1]}`;
  // Bahrain: 3xxxxxxx (8 digits)
  const bhLocal = t.match(/(?<![\d])(3[0-9]{7}|[17][0-9]{7})(?![\d])/);
  if (bhLocal) return `+973${bhLocal[1]}`;
  // Oman: 9xxxxxxx (8 digits)
  const omLocal = t.match(/(?<![\d])(9[0-9]{7}|[7][0-9]{7})(?![\d])/);
  if (omLocal) return `+968${omLocal[1]}`;
  // International with country code (8-15 digits)
  const intl = t.match(/(?<![\d])(\+?\d{8,15})(?![\d])/);
  if (intl) return intl[1].startsWith("+") ? intl[1] : `+${intl[1]}`;
  return undefined;
}

function detectPrice(text: string): number {
  const t = arNumToWestern(text);
  // numbers near "جنيه", "ج", "EGP", "ل.م", "ر.س", "$"
  const m = t.match(/(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:جنيه|ج\b|egp|le|ل\.م|ر\.س|ريال|sar|aed|درهم|\$|usd)/i);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")));
  // bare "بكام 350" / "السعر 250"
  const m2 = t.match(/(?:بكام|السعر|سعرها|سعره|ثمنها|ثمنه|price|cost)\D{0,8}(\d{2,6})/i);
  if (m2) return parseInt(m2[1], 10);
  return 0;
}

function detectCurrency(text: string): string {
  const t = normalizeAr(text).toLowerCase();
  if (/ر\.س|ريال|sar|salla|zid/.test(t)) return "SAR";
  if (/درهم|aed/.test(t)) return "AED";
  if (/\$|usd|دولار/.test(t)) return "USD";
  return "EGP";
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
  // Heuristic: tokens around order verbs — supports Egyptian + Gulf + MSA.
  const m = text.match(/(?:هاخد(?:ه|ها)?|عاوز(?:ه|ها)?|عايز(?:ه|ها)?|ابعتلي|ارسلي|أرسل|ارسل|اطلب|أطلب|ابي|أبي|ابغى|أبغى|بغيت|اريد|أريد|احجز|اشتري|آخذ|اخذ|اشتراك|i want|i'll take|buy|order)\s+([\u0600-\u06FFA-Za-z0-9][\u0600-\u06FFA-Za-z0-9\s\-_/]{2,80})/i);
  if (m) {
    return m[1]
      .replace(/(?:توصيل|على|الى|إلى|في|العنوان|عنوان|بكام|السعر|سعرها|سعره|كاش|تحويل|فيزا|مدى|cod|cash|price).*$/i, "")
      .replace(/[.,،؟?!\n].*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }
  return undefined;
}

/**
 * Try to extract multiple product mentions from a message.
 * Handles patterns like:
 *   "عاوز 2 تيشيرت ابيض و 3 بنطلون اسود"
 *   "اخد المنتج الاول والمنتج التاني"
 * Splits on "و" / "and" / "," between product mentions when multiple verbs exist.
 */
function detectMultipleProducts(text: string): { name: string; quantity: number }[] {
  const t = arNumToWestern(text);
  const products: { name: string; quantity: number }[] = [];

  // Pattern: "رقم ورقم" or "رقم, رقم" between products
  // Try: "2 تيشيرت و 3 بنطلون" or "تيشيرت وبنطلون"
  const segments = t.split(/\s+و\s+|\s*,\s*/).filter(Boolean);
  for (const seg of segments) {
    const qty = detectQuantity(seg);
    const name = detectProductName(seg);
    if (name && !products.some(p => p.name === name)) {
      products.push({ name: name.slice(0, 80), quantity: qty });
    }
  }

  // If only one found via split, try the "X + Y" pattern with Arabic numbers
  if (products.length <= 1) {
    const multiMatch = t.match(/(\d{1,2})\s*(?:قطع|حبات|حبتين|products|items)\s*(.+)/i);
    if (multiMatch) {
      const items = multiMatch[2].split(/\s+و\s+|\s*,\s*/).filter(Boolean);
      for (const item of items) {
        const name = detectProductName(`عاوز ${item}`) || item.trim().slice(0, 80);
        if (name && !products.some(p => p.name === name)) {
          products.push({ name, quantity: 1 });
        }
      }
    }
  }

  return products;
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

  const customerPhone = detectPhone(customerText) || (input.fallbackCustomerPhone || undefined);
  const shippingAddress = detectAddress(customerText);
  const paymentMethod = detectPayment(fullText);
  const customerName = detectName(customerText) || (input.fallbackCustomerName || undefined);

  // Multi-product detection — try to extract multiple items
  const multiProducts = detectMultipleProducts(customerText);
  const size = detectSize(customerText);
  const color = detectColor(customerText);
  const priceFromAsst = detectPrice(assistantText);
  const priceFromUser = detectPrice(customerText);
  const unitPrice = priceFromAsst || priceFromUser || 0;

  let items: OrderDraftItem[];
  if (multiProducts.length > 1) {
    // Multiple products found — create one item per product
    items = multiProducts.map((p, i) => ({
      name: p.name,
      size: i === 0 ? size : undefined,
      color: i === 0 ? color : undefined,
      quantity: p.quantity,
      unitPrice,
      lineTotal: unitPrice * Math.max(1, p.quantity),
    }));
  } else {
    const productName = detectProductName(customerText) || detectProductName(assistantText) || "منتج";
    const quantity = detectQuantity(customerText);
    const lineTotal = unitPrice * Math.max(1, quantity);
    items = [{
      name: productName.slice(0, 80),
      size, color,
      quantity: Math.max(1, quantity),
      unitPrice,
      lineTotal,
    }];
  }
  const currency = detectCurrency(fullText);

  // Discount: scan customer text first (their request), then assistant text
  // (merchant's offer). Percentage takes priority over flat. Resolved value
  // is subtracted from subtotal so Order.total reflects what the customer pays.
  const dcCustomer = detectDiscount(customerText);
  const dcAssistant = (dcCustomer.pct > 0 || dcCustomer.flat > 0) ? dcCustomer : detectDiscount(assistantText);
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  let discount = 0;
  if (dcAssistant.pct > 0) {
    discount = Math.round((subtotal * dcAssistant.pct) / 100);
  } else if (dcAssistant.flat > 0) {
    discount = Math.min(dcAssistant.flat, subtotal);
  }
  const total = Math.max(0, subtotal - discount);

  const draft: OrderDraft = {
    items,
    customerName,
    customerPhone,
    shippingAddress,
    paymentMethod,
    subtotal,
    shipping: 0,
    discount,
    total: Math.max(0, subtotal - discount),
    currency,
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
