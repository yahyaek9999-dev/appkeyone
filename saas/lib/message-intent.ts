// lib/message-intent.ts
// Pure, LLM-free customer-intent classifier for the auto-order gate (BUG3).
//
// The order extractor (lib/order-extractor.ts) is deliberately greedy: it ALWAYS
// returns a draft — with a placeholder product "منتج" — and a confidence score
// that address / phone / payment hints can inflate past the threshold. On its
// own that turned media-only messages, price questions, and location questions
// into bogus auto-orders. This classifier answers the prior question — WHAT DID
// THE CUSTOMER ACTUALLY INTEND — so the caller only creates an Order on a genuine
// purchase intent, routes inquiries to leads, and never turns media / greetings
// into orders.
//
// Additive: nothing here changes the send pipeline or existing extraction; it is
// a gate the caller consults before creating an Order.

import { normalizeAr } from "./semantic-match";

export type MessageIntent = "buy" | "inquiry" | "support" | "smalltalk" | "other";

export interface IntentResult {
  intent: MessageIntent;
  /** genuine purchase intent — "أريد أن أشتري", "احجزلي", explicit confirmation */
  buyIntent: boolean;
  matched: string[];
}

// Strong purchase verbs / confirmations → real buy intent. NOTE: bare "عايز"/
// "عاوز" (I want) is intentionally EXCLUDED because "عايز اعرف السعر" (I want to
// know the price) is an inquiry, not a purchase. We require an explicit buy verb.
const BUY_SIGNALS = [
  "عايز اشتري", "عاوز اشتري", "عايزة اشتري", "عاوزه اشتري", "حابب اشتري", "حابه اشتري", "بدي اشتري", "ابغى اشتري", "أبغى اشتري", "ابي اشتري",
  "اشتري", "هشتري", "هاشتري", "اشتريه", "اشتريها",
  "هاخد", "هاخده", "هاخدها", "هخد", "هخده", "اخدها", "اخده", "خدها", "خده", "ياخد",
  "احجز", "احجزلي", "احجزها", "احجزله", "حجزت", "اطلب", "اطلبها", "اطلبه", "هطلب", "اعمل اوردر", "اعملي اوردر", "اوردر",
  "ابعتهالي", "ابعتهالى", "ابعتها", "ابعتهولي", "ابعتلي", "ابعتيلي", "ابعتلى", "ابعتهيلي", "وصلهالي", "وصلها", "وصللي", "وصّلي",
  "اشترك", "اشتراك", "فعلي الاشتراك",
  "تمام ابعت", "تمام اطلب", "تمام هاخد", "اوكي اطلب", "اكد الطلب", "اكمل الطلب", "اؤكد الطلب",
  "ادفع", "هدفع", "حولت", "دفعت", "حولتلك",
  "i want to buy", "i wanna buy", "i'll take", "i will take", "place order", "place the order",
  "order it", "buy it", "buy now", "checkout", "confirm order", "i want to order", "i'd like to order",
];

// Price / availability / info questions → LEAD, not order.
const INQUIRY_SIGNALS = [
  "بكام", "بكم", "السعر", "سعرها", "سعره", "سعر", "كام سعر", "بيكلف", "بتكلف", "التكلفة", "تكلفة", "كام",
  "متوفر", "متوفره", "متوفرة", "موجود", "موجوده", "موجودة", "عندكم", "عندكو", "في منه", "في منها",
  "ممكن اعرف", "عايز اعرف", "عاوز اعرف", "استفسر", "استفسار عن",
  "how much", "the price", "what's the price", "what is the price", "cost", "available", "availability",
  "do you have", "in stock",
];

// Location / hours / branch / support questions → SUPPORT, not order.
const SUPPORT_SIGNALS = [
  "فرعكم", "فروعكم", "الفرع", "فين الفرع", "فين فرعكم", "عنوانكم", "مكانكم", "موقعكم", "المعرض فين", "المحل فين", "المتجر فين",
  "مواعيد", "المواعيد", "مواعيد العمل", "بتفتحوا", "بتقفلوا", "ساعات العمل", "بتشتغلوا امتى",
  "شكوى", "مشكلة عندي", "الدعم", "خدمة العملاء",
  "where is your branch", "where are you located", "your location", "your address", "opening hours", "working hours", "where are you",
];

// Thanks / greetings / chit-chat → IGNORE.
const SMALLTALK_SIGNALS = [
  "شكرا", "شكراً", "متشكر", "متشكره", "تسلم", "تسلمو", "تسلمي", "جزاك", "جزاكم", "ربنا يكرمك", "الف شكر", "مشكور",
  "thanks", "thank you", "thx", "thankyou", "appreciate it",
  "السلام عليكم", "صباح الخير", "مساء الخير", "ازيك", "ازيكم", "اهلا", "أهلا", "هاي", "هلا", "مرحبا", "مرحبتين",
  "hello", "hi", "hey", "good morning", "good evening",
];

function anyMatch(norm: string, list: string[]): string | null {
  for (const s of list) {
    const n = normalizeAr(s);
    if (n && norm.includes(n)) return s;
  }
  return null;
}

/**
 * Classify a customer message (or a joined tail of recent customer messages).
 * Priority: an explicit buy verb wins; otherwise inquiry > support > smalltalk.
 */
export function classifyMessageIntent(text: string): IntentResult {
  const norm = normalizeAr(String(text || ""));
  const matched: string[] = [];
  if (!norm.trim()) return { intent: "other", buyIntent: false, matched };

  const buy = anyMatch(norm, BUY_SIGNALS);
  if (buy) { matched.push(buy); return { intent: "buy", buyIntent: true, matched }; }

  const inquiry = anyMatch(norm, INQUIRY_SIGNALS);
  if (inquiry) { matched.push(inquiry); return { intent: "inquiry", buyIntent: false, matched }; }
  const support = anyMatch(norm, SUPPORT_SIGNALS);
  if (support) { matched.push(support); return { intent: "support", buyIntent: false, matched }; }
  const smalltalk = anyMatch(norm, SMALLTALK_SIGNALS);
  if (smalltalk) { matched.push(smalltalk); return { intent: "smalltalk", buyIntent: false, matched }; }

  return { intent: "other", buyIntent: false, matched };
}

/** True if ANY recent customer message carries genuine purchase intent. */
export function hasPurchaseIntent(customerMessages: string[]): boolean {
  const joined = (customerMessages || []).slice(-6).join("\n");
  return classifyMessageIntent(joined).buyIntent;
}
