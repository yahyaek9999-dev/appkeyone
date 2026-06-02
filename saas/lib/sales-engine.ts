// Phase 2 — Sales Brain (local, low-token).
//
// Detects buying signals, objections, hesitation, and picks a tiny "sales
// guidance" block to prepend to the LLM prompt. Hard budget: ≤120 tokens.
//
// Everything here is rule-based + cheap regex. No LLM calls. Runs in
// O(message length) and adds well under 1 ms to the request path.
//
// Persisted state piggybacks on CustomerMemory.factsJson (Phase 1) so we
// don't need a schema migration. Backward compatible.

import { normalizeAr } from "./semantic-match";
import type { MemoryFacts } from "./memory";

// ---------------------------------------------------------------------------
// Lexicons (Arabic + light English). Normalized at runtime via normalizeAr.
// Keep these tight — broad lists cause false positives that hurt quality.
// ---------------------------------------------------------------------------

const OBJ_PRICE = [
  "غالي","غاليه","غاليا","ثمنه عالي","ثمنها عالي","السعر مرتفع","ثمن غالي",
  "مش معايا","ميزانيتي","ميزانيه","مبلغ كبير","فوق ميزانيتي","كتير","كثير",
  "expensive","too much","over budget","pricey",
];
const OBJ_TRUST = [
  "نصب","كذب","مش واثق","موثوق","ثقه","تجار وهم","شكاوي","تقييمات","ضمان",
  "scam","not sure","trust","reviews","reputation","real","fake",
];
const OBJ_SHIPPING = [
  "شحن","توصيل","متاخر","يوصلني امتى","يوصل امتي","المده","وقت التوصيل","استلام",
  "shipping","delivery","when arrives","late",
];
const OBJ_QUALITY = [
  "خامه","الخامه","جوده","جوده عاليه","تقليد","اصلي","اصليه","original","quality","cheap quality","fake",
];

const HESIT = [
  "هفكر","مش متاكد","بفكر","بشوف","لسه بفكر","ممكن","يمكن","لو","ابعتلي بعدين",
  "let me think","not sure yet","maybe","later","ill think",
];

const BUY_STRONG = [
  "هاخده","هاخدها","عاوزه","عاوزها","اشتريه","اشتريها","احجز","احجزلي",
  "نزل اوردر","ابعتلي","تمام هاخد","تمام عاوز","موافق","ماشي تمام","ارسل التفاصيل",
  "want it","ill take it","buy now","order now","go ahead",
];
const BUY_INTEREST = [
  "ايه السعر","كم السعر","بكام","الاسعار","الباقات","التفاصيل","مميزات",
  "متاح","موجود","سايز","مقاس","لون","موديل",
  "price","cost","available","options","features",
];

const DISCOUNT_ASK = [
  "خصم","تخفيض","افضل سعر","اقل سعر","سعر نهائي","تنزل","نهائي كام","عرض",
  "discount","best price","cheaper","final price","deal",
];

const URGENCY_HIGH = [
  "النهارده","دلوقتي","مستعجل","ضروري","عاجل","قبل بكره","لازم اليوم",
  "today","urgent","asap","right now","immediately",
];

// ---------------------------------------------------------------------------
// Detectors. All cheap. All return primitive booleans / small arrays.
// ---------------------------------------------------------------------------

function hits(norm: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    const nw = normalizeAr(w);
    if (nw && norm.includes(nw)) n++;
  }
  return n;
}

export interface SalesSignals {
  buyStrong: boolean;
  buyInterest: boolean;
  hesitation: boolean;
  objections: { price: boolean; trust: boolean; shipping: boolean; quality: boolean };
  discountAsk: boolean;
  urgent: boolean;
}

export function detectSignals(text: string): SalesSignals {
  const n = normalizeAr(text);
  return {
    buyStrong:    hits(n, BUY_STRONG) > 0,
    buyInterest:  hits(n, BUY_INTEREST) > 0,
    hesitation:   hits(n, HESIT) > 0,
    objections: {
      price:    hits(n, OBJ_PRICE) > 0,
      trust:    hits(n, OBJ_TRUST) > 0,
      shipping: hits(n, OBJ_SHIPPING) > 0,
      quality:  hits(n, OBJ_QUALITY) > 0,
    },
    discountAsk:  hits(n, DISCOUNT_ASK) > 0,
    urgent:       hits(n, URGENCY_HIGH) > 0,
  };
}

// Growth Suite — catalog request detector ("send me the products/prices/menu").
// Used additively to attach product cards to a reply. Kept tight to avoid
// firing on generic price questions about a single item already in context.
const CATALOG_REQUEST = [
  "عاوز المنتجات", "عايز المنتجات", "ابعتلي المنتجات", "ابعتلي الاسعار", "ابعت الاسعار",
  "ايه المتاح", "ايه عندكم", "ايه اللي متوفر", "المنتجات المتاحة", "قائمة المنتجات",
  "الكتالوج", "الكاتالوج", "المنيو", "المعروضات", "اعرضلي", "وريني المنتجات", "عندكم ايه",
  "قائمة الاسعار", "الاصناف", "المنتجات",
  "catalog", "catalogue", "menu", "products", "price list", "show me products", "what do you have",
];

export function detectCatalogIntent(text: string): boolean {
  const n = normalizeAr(text);
  return hits(n, CATALOG_REQUEST) > 0;
}

export function hasAnyObjection(s: SalesSignals): boolean {
  const o = s.objections;
  return o.price || o.trust || o.shipping || o.quality;
}

// ---------------------------------------------------------------------------
// Psychology classifier — combines current signals with the customer's
// lead score, last intent, and persisted memory facts.
// ---------------------------------------------------------------------------

export type Psychology =
  | "hot"
  | "warm"
  | "cold"
  | "price_sensitive"
  | "impulse"
  | "hesitant";

export interface PsychologyInput {
  leadScore: number;
  lastIntent: string | null | undefined;
  signals: SalesSignals;
  facts: MemoryFacts;
  negotiation?: NegotiationState;
}

export function classifyPsychology(i: PsychologyInput): Psychology {
  const score = i.leadScore || 0;
  const s = i.signals;
  const discountAsks = i.negotiation?.discountAsks || 0;

  if (s.objections.price || discountAsks >= 2 || (i.facts.objections || []).includes("price")) {
    return "price_sensitive";
  }
  if (s.buyStrong && (s.urgent || i.facts.tone === "enthusiastic")) {
    return "impulse";
  }
  if (s.hesitation && score < 60) return "hesitant";
  if (score >= 70 || (s.buyStrong && score >= 50)) return "hot";
  if (score >= 35 || s.buyInterest) return "warm";
  return "cold";
}

// ---------------------------------------------------------------------------
// Persuasion mode chooser. Output is a tag; buildSalesBlock turns it into
// the actual ≤120-token guidance string.
// ---------------------------------------------------------------------------

export type PersuasionMode =
  | "none"
  | "soft"
  | "premium"
  | "scarcity"
  | "trust"
  | "fast_close"
  | "upsell"          // Issue #8: post-confirmation cross-sell prompt
  | "ghost_recover";  // Issue #8: re-engage a quiet hesitant lead

export function chooseMode(p: Psychology, s: SalesSignals, opts?: { justConfirmed?: boolean; idleHours?: number }): PersuasionMode {
  // Upsell takes precedence: customer JUST confirmed → suggest one related item.
  if (opts?.justConfirmed)                           return "upsell";
  // Ghost recovery: hesitant + long silence (>= 6h) → gentle nudge.
  if (p === "hesitant" && (opts?.idleHours ?? 0) >= 6) return "ghost_recover";
  if (s.objections.trust)                            return "trust";
  if (s.objections.quality)                          return "premium";
  if (p === "hot" || p === "impulse")                return "fast_close";
  if (p === "price_sensitive")                       return "premium";   // anchor on value, not discount
  if (p === "hesitant")                              return "soft";
  if (s.urgent || s.buyInterest)                     return "scarcity";
  if (p === "warm")                                  return "soft";
  return "none";
}

// ---------------------------------------------------------------------------
// Sales guidance block — strict ≤120 tokens (≈ 400 chars Arabic).
// Each block is a compact instruction, NOT a script. Keeps replies dynamic.
// ---------------------------------------------------------------------------

const BLOCKS: Record<PersuasionMode, string> = {
  none: "",
  soft:
    "توجيه بيع: العميل يفكر — كن ودوداً ومتفهماً، اسأله عن احتياجه المحدد بدل الضغط عليه، اذكر ميزة واحدة فقط تفرق، واترك له مساحة للرد.",
  premium:
    "توجيه بيع: ركز على الجودة والمزايا الفعلية بدل السعر، اذكر فرقاً ملموساً واحداً يبرر القيمة، ارسله لقسم المنتجات أو صور真实的ة لتأكيد الجودة.",
  scarcity:
    "توجيه بيع: العميل مهتم — اذكر بصدق توافراً محدوداً أو طلباً عالياً إن كان حقيقياً، شجعه على تأمين طلبه الآن بجملة واحدة فقط لا أكثر.",
  trust:
    "توجيه بيع: عزّز الثقة — اذكر ضماناً أو تجربة عملاء أو مدة عمل الشركة بإيجاز، طمئنه بدون مبالغة، وقدم له خيار الدفع عند الاستلام لو أمكن ليزيل قلقه.",
  fast_close:
    "توجيه بيع: العميل جاهز — أكد توافر المنتج بجملة، اطلب منه اسمه ورقمه واختيار طريقة الدفع المفضلة، وجّهه للإدارة إن لزم. لا تطلب معلومات إضافية غير ضرورية.",
  upsell:
    "توجيه بيع: العميل أكد الطلب — اشكره وأكد التفاصيل، ثم اقترح بلطف منتجاً مكملاً واحداً فقط (إكسسوار/إضافة/كمية أكبر) بسعر واضح. لا تكرر الاقتراح إن رفض.",
  ghost_recover:
    "توجيه بيع: العميل صامت منذ فترة — افتح برسالة قصيرة ودودة تذكره بالعرض أو المنتج اللي كان مهتماً به، اطرح سؤالاً واحداً مفتوحاً (مش نعم/لا)، ولا تكرر نفس الكلام السابق.",
};

export function buildSalesBlock(mode: PersuasionMode): string {
  return BLOCKS[mode] || "";
}

// ---------------------------------------------------------------------------
// Performance gate. Skip the whole sales pipeline when it can't help.
// ---------------------------------------------------------------------------

export function shouldRunSales(args: {
  leadScore: number;
  lastIntent: string | null | undefined;
  messageText: string;
  persuasionEnabled: boolean;
}): boolean {
  if (!args.persuasionEnabled) return false;
  // Skip pure greetings / acks — nothing to persuade.
  const norm = normalizeAr(args.messageText);
  if (norm.length < 5) return false;
  // Skip very cold leads who haven't shown any interest yet.
  if ((args.leadScore || 0) < 15 && args.lastIntent !== "buy" && args.lastIntent !== "inquiry") {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Negotiation state (persisted inside CustomerMemory.factsJson.negotiation).
// Backward compatible: missing fields default to 0/undefined.
// ---------------------------------------------------------------------------

export interface NegotiationState {
  lastOfferedPrice?: number;       // last price the bot quoted
  acceptedMin?: number;            // hint of customer's accepted floor
  acceptedMax?: number;            // hint of accepted ceiling
  rejectedOffers?: number[];       // prices the customer rejected
  favoriteCategory?: string;
  urgencyLevel?: "low" | "medium" | "high";
  discountAsks?: number;
  objectionCount?: number;
  lastSignalAt?: number;           // ms timestamp
}

/** Read negotiation state from MemoryFacts (legacy-safe). */
export function readNegotiation(facts: MemoryFacts | undefined | null): NegotiationState {
  if (!facts) return {};
  const raw: any = (facts as any).negotiation;
  return raw && typeof raw === "object" ? raw : {};
}

/** Update negotiation state based on the latest signals (pure function). */
export function applySignalsToNegotiation(
  prev: NegotiationState,
  signals: SalesSignals
): NegotiationState {
  const next: NegotiationState = { ...prev };
  if (signals.discountAsk) next.discountAsks = (prev.discountAsks || 0) + 1;
  if (hasAnyObjection(signals)) next.objectionCount = (prev.objectionCount || 0) + 1;
  if (signals.urgent) next.urgencyLevel = "high";
  else if (signals.buyStrong) next.urgencyLevel = next.urgencyLevel || "medium";
  next.lastSignalAt = Date.now();
  return next;
}

// ---------------------------------------------------------------------------
// Merchant intelligence labels — cheap derived booleans for dashboards.
// ---------------------------------------------------------------------------

export interface MerchantSignals {
  likelyToBuy: boolean;
  needsDiscount: boolean;
  highConversionProb: boolean;
  atRiskOfGhosting: boolean;
}

export function deriveMerchantSignals(args: {
  leadScore: number;
  signals: SalesSignals;
  psychology: Psychology;
  negotiation: NegotiationState;
  lastSeenAtMs?: number;
}): MerchantSignals {
  const score = args.leadScore || 0;
  const idleHours = args.lastSeenAtMs
    ? (Date.now() - args.lastSeenAtMs) / 3_600_000
    : 0;
  return {
    likelyToBuy:        score >= 65 && args.signals.buyStrong,
    needsDiscount:      args.psychology === "price_sensitive" && (args.negotiation.discountAsks || 0) >= 1,
    highConversionProb: score >= 75 && !hasAnyObjection(args.signals),
    atRiskOfGhosting:   (args.psychology === "hesitant" || args.signals.hesitation)
                        && idleHours > 2 && score >= 25,
  };
}

// ---------------------------------------------------------------------------
// Re-engagement helper. Suggests a follow-up delay (in hours) and an Arabic
// hint string for the merchant. Pure function — does not send anything.
// ---------------------------------------------------------------------------

export interface FollowUpSuggestion {
  delayHours: number;
  hint: string;
}

export function suggestFollowUp(args: {
  psychology: Psychology;
  signals: SalesSignals;
  negotiation: NegotiationState;
}): FollowUpSuggestion | null {
  const s = args.signals;
  if (s.buyStrong && !hasAnyObjection(s)) {
    return { delayHours: 2,  hint: "العميل جاهز — تابع خلال ساعتين بتأكيد التوافر وخطوة الدفع." };
  }
  if (args.psychology === "hesitant") {
    return { delayHours: 12, hint: "العميل متردد — رسالة لطيفة بعد 12 ساعة تذكّره بميزة واحدة بدون ضغط." };
  }
  if (args.psychology === "price_sensitive") {
    return { delayHours: 24, hint: "حساس للسعر — جرّب بعد يوم بعرض قيمة (مش خصم مباشر) أو باقة أصغر." };
  }
  if (s.buyInterest) {
    return { delayHours: 6,  hint: "مهتم — تذكير قصير بعد 6 ساعات بتفاصيل المنتج اللي سأل عنه." };
  }
  return null;
}
