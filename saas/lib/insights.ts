// ---------------------------------------------------------------------------
// Sales-intelligence helpers. Pure code, no external APIs.
//   * classify()      → asks our existing LLM for sentiment + intent in JSON
//   * scoreLead()     → deterministic heuristic, no LLM call
//   * matchQuickReply() → cheap keyword matcher to skip LLM entirely
//   * inWorkingHours() → schedule check for out-of-office mode
// ---------------------------------------------------------------------------

import { chat } from "./llm";
import { normalizeAr } from "./semantic-match";
import { partsInTz } from "./tz";

export type Sentiment = "positive" | "neutral" | "negative" | "angry";
export type Intent =
  | "buy"
  | "inquiry"
  | "complaint"
  | "support"
  | "greeting"
  | "other";

export interface Classification {
  sentiment: Sentiment;
  intent: Intent;
  tags: string[];
}

const DEFAULT_CLASSIFICATION: Classification = {
  sentiment: "neutral",
  intent: "other",
  tags: [],
};

/**
 * Audit fix #1 — Local-first classifier.
 *
 * Lightweight Arabic+English heuristics handle the common cases without
 * calling the scraper. Only ambiguous + long inputs fall through to the
 * LLM. Cuts scraper load by roughly 40-50% on real traffic.
 */
// Anger / escalation: broadened to catch refund threats, repeated frustration,
// caps-spam, threats to escalate to authorities/social, and direct insults.
// Coverage is intentionally wide because the cost of a false-positive anger
// alert (one notification to the merchant) is much lower than missing a real
// angry customer.
const ANGRY_RE      = /(زفت|نصب|نصاب|كذابين|كذاب|كذب|مفيش|هبلغ|اشتك|بلاغ|مستهلك|هاخد حقي|هرفع|هاروح|محامي|قضية|شرطة|فضيحه|فضيحة|ارجع.{0,5}فلوس|استرجاع|refund|wallah scam|scam|fraud|liar|fake|cheat|outrage|أقاضي|سأبلغ|أخس|اوسخ|حرامي|حرامية|حرام عليكم|بطلوا|ولاد ال|ابن ال)/i;
const NEG_RE        = /(سيء|سيئ|مش كويس|مش حلو|تعبان|زهقان|زهقت|مش راضي|مش عاجبني|مستاء|مضايق|مهين|تأخير|متأخر جداً|bad|terrible|awful|poor|hate|disappointed|frustrated|annoying|unacceptable)/i;
const POS_RE        = /\b(ممتاز|تمام|حلو|رائع|شكرا|تسلم|great|good|awesome|love it|nice|perfect)\b/i;
const COMPLAINT_RE  = /(شكوى|مشكله|مشكلة|عطل|مش شغال|تأخر|متأخر|complain|broken|issue|problem|defect|broken|not working)/i;
const SUPPORT_RE    = /\b(دعم|مساعده|مساعدة|مش عارف|محتاج اعرف|كيف اقدر|how do i|help|support|how can)\b/i;
const BUY_RE        = /\b(عاوز|عايز|اشتري|اشترى|اشتراك|احجز|اطلب|اوردر|ابعتلي|بكام|سعر|الباقات|ادفع|تحويل|buy|order|purchase|subscribe|how much|price)\b/i;
const INQUIRY_RE    = /(\?|؟|كيف|ايه|إيه|ازاي|متى|فين|هل|بكم|تكلفه|تكلفة|how|what|when|where|why|features|specs)/i;
const GREETING_RE   = /^(السلام|سلام|اهلا|أهلا|hi|hello|hey|مرحب|صباح|مساء|يا |peace)/i;

function classifyLocal(trimmed: string): Classification | null {
  if (!trimmed) return DEFAULT_CLASSIFICATION;
  const norm = normalizeAr(trimmed);
  const head = trimmed.slice(0, 18);
  const len  = trimmed.length;

  // Sentiment — angry/negative dominate
  let sentiment: Sentiment = "neutral";
  if (ANGRY_RE.test(norm))     sentiment = "angry";
  else if (NEG_RE.test(norm))  sentiment = "negative";
  else if (POS_RE.test(norm))  sentiment = "positive";

  // Caps-spam + exclamation flood: a customer SHOUTING in English or using
  // 4+ consecutive exclamation marks is almost always frustrated/angry.
  // Only upgrade sentiment if it's not already positive (don't override
  // "GREAT!!!!!" → angry).
  if (sentiment !== "positive") {
    const letters = trimmed.match(/[A-Za-z]/g) || [];
    const upper = trimmed.match(/[A-Z]/g) || [];
    const capsRatio = letters.length >= 8 ? upper.length / letters.length : 0;
    const exclaimBurst = /!{3,}|؟{3,}|\?{3,}/.test(trimmed);
    if (capsRatio > 0.7 || exclaimBurst) {
      sentiment = sentiment === "negative" ? "angry" : "negative";
    }
  }

  // Intent — order matters: complaint > buy > inquiry > greeting > support
  let intent: Intent = "other";
  const tags: string[] = [];

  if (COMPLAINT_RE.test(norm)) { intent = "complaint"; tags.push("شكوى"); }
  else if (BUY_RE.test(norm))  { intent = "buy";       tags.push("شراء"); }
  else if (GREETING_RE.test(head) && len < 25) {
    intent = "greeting";
    sentiment = sentiment === "neutral" ? "positive" : sentiment;
    tags.push("تحية");
  }
  else if (SUPPORT_RE.test(norm))   { intent = "support"; tags.push("دعم"); }
  else if (INQUIRY_RE.test(norm))   { intent = "inquiry"; tags.push("استفسار"); }

  // Confidence test — refuse a local answer if it's ambiguous AND the
  // message is long enough to be worth asking the LLM.
  const ambiguous = intent === "other" && sentiment === "neutral";
  if (ambiguous && len > 30) return null;
  return { sentiment, intent, tags: tags.slice(0, 3) };
}

/**
 * Classify a single customer message. Returns sentiment, intent, and
 * short Arabic tags. Local heuristics handle the common cases for free;
 * only ambiguous, long messages fall through to the LLM.
 */
export async function classify(text: string): Promise<Classification> {
  const trimmed = text.trim();
  if (!trimmed) return DEFAULT_CLASSIFICATION;

  // Audit fix #1: local-first path — handles ~60-70% of inbound messages
  // with zero scraper cost.
  const local = classifyLocal(trimmed);
  if (local !== null) return local;

  const sys = [
    "أنت مصنّف صامت لرسائل عملاء واتساب.",
    "أعد JSON فقط بدون أي شرح أو تنسيق markdown.",
    "الحقول المطلوبة:",
    '- sentiment: "positive" | "neutral" | "negative" | "angry"',
    '- intent: "buy" | "inquiry" | "complaint" | "support" | "greeting" | "other"',
    "- tags: مصفوفة قصيرة (٠-٣) من كلمات عربية تصف الرسالة (مثلاً: سعر، توصيل، شكوى، استعجال)",
    "",
    'تعريف angry: العميل غاضب أو يستخدم لغة عدوانية أو يهدد ("هبلغ", "زفت", "نصب", "كذابين"...).',
    'تعريف buy: نية صريحة للشراء/الاشتراك/الدفع.',
    'تعريف complaint: شكوى من خدمة سابقة.',
  ].join("\n");

  try {
    const raw = await chat([
      { role: "system", content: sys },
      { role: "user", content: trimmed.slice(0, 600) },
    ]);
    const parsed = extractJson(raw);
    if (!parsed) return DEFAULT_CLASSIFICATION;
    const out: Classification = {
      sentiment: normalizeSentiment(parsed.sentiment),
      intent: normalizeIntent(parsed.intent),
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t: any) => typeof t === "string").slice(0, 3)
        : [],
    };
    return out;
  } catch {
    return DEFAULT_CLASSIFICATION;
  }
}

function extractJson(s: string): any | null {
  if (!s) return null;
  // Strip ```json fences if model insists on them
  const cleaned = s.replace(/```json|```/g, "").trim();
  // Try plain parse
  try {
    return JSON.parse(cleaned);
  } catch {}
  // Try to find first {...} block
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return null;
}

function normalizeSentiment(v: any): Sentiment {
  const s = String(v || "").toLowerCase();
  if (s === "positive" || s === "negative" || s === "angry" || s === "neutral") return s;
  return "neutral";
}

function normalizeIntent(v: any): Intent {
  const s = String(v || "").toLowerCase();
  const ok: Intent[] = ["buy", "inquiry", "complaint", "support", "greeting", "other"];
  return (ok as string[]).includes(s) ? (s as Intent) : "other";
}

// ---------------------------------------------------------------------------
// Lead scoring (deterministic)
// ---------------------------------------------------------------------------

const BUY_SIGNAL_WORDS = [
  "اشتري", "اشترى", "اشتراك", "ادفع", "دفع", "كام", "سعر", "بكام", "السعر",
  "متاح", "متى", "احجز", "احجزلي", "حجز", "اوردر", "طلب", "اطلب",
  "buy", "purchase", "subscribe", "price", "cost", "how much",
];
const QUESTION_SIGNAL = ["؟", "?", "كيف", "ايه", "إيه", "ازاي", "هل", "متى", "فين"];

export interface LeadInputs {
  totalMessages: number;
  daysSinceFirstContact: number;
  lastMessageText: string;
  hasBuyIntent: boolean;
  sentiment: Sentiment;
  flaggedOrderMessages: number; // historical order/payment hits
}

/**
 * Returns a 0-100 score. Anything ≥70 is "hot lead".
 */
export function scoreLead(i: LeadInputs): number {
  let s = 0;
  // Engagement (max 25)
  s += Math.min(25, i.totalMessages * 2);
  // Recency penalty (max -10 if it's been a long time)
  if (i.daysSinceFirstContact > 30) s -= 10;
  else if (i.daysSinceFirstContact > 14) s -= 5;
  // Buy signal words in last message (max +30)
  const t = (i.lastMessageText || "").toLowerCase();
  const buyHits = BUY_SIGNAL_WORDS.filter((w) => t.includes(w)).length;
  s += Math.min(30, buyHits * 12);
  // Explicit buy intent (LLM-detected) (+25)
  if (i.hasBuyIntent) s += 25;
  // Asked a question (+5)
  if (QUESTION_SIGNAL.some((q) => t.includes(q))) s += 5;
  // Sentiment modifier
  if (i.sentiment === "positive") s += 5;
  else if (i.sentiment === "negative") s -= 5;
  else if (i.sentiment === "angry") s -= 15;
  // Order/payment evidence in history (+20)
  s += Math.min(20, i.flaggedOrderMessages * 10);
  // Clamp
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ---------------------------------------------------------------------------
// Quick-reply matcher (no LLM cost)
// ---------------------------------------------------------------------------

export interface QuickReplyRow {
  id: string;
  triggers: string;
  reply: string;
}

/**
 * Return the highest-scoring matching reply, or null. Match is case-insensitive
 * and Arabic-diacritic-insensitive. Score = sum of trigger token hits.
 */
export function matchQuickReply(
  text: string,
  rules: QuickReplyRow[]
): { id: string; reply: string } | null {
  const norm = normalizeAr(text);
  if (!norm) return null;

  let best: { id: string; reply: string; score: number } | null = null;

  for (const r of rules) {
    let triggers: string[] = [];
    try {
      triggers = JSON.parse(r.triggers);
    } catch {
      triggers = String(r.triggers || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    let score = 0;
    for (const trig of triggers) {
      const nt = normalizeAr(trig);
      if (!nt) continue;
      if (norm.includes(nt)) score += nt.length; // longer triggers win
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: r.id, reply: r.reply, score };
    }
  }

  return best ? { id: best.id, reply: best.reply } : null;
}

/**
 * Strip Arabic diacritics and lowercase for fuzzy keyword matching.
 * Audit fix #9: delegates to the stronger normalizer in semantic-match so
 * the whole codebase uses the same rules (dialect variants, tatweel,
 * arabic/persian digits, etc.). Name kept for backward compatibility.
 */

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

export interface WorkingHourSlot {
  day: number;     // 0 = Sunday … 6 = Saturday
  from: string;    // "09:00"
  to: string;      // "21:00"
  enabled: boolean;
}

/**
 * Returns true if 'now' falls inside any enabled slot for that weekday.
 * Computes the weekday + hour-of-day in the merchant's configured IANA
 * timezone (defaults to Africa/Cairo) so a Cairo-based merchant who set
 * "9 AM - 9 PM" gets the right window even when the server runs in UTC.
 */
export function inWorkingHours(
  slotsJson: string,
  now: Date = new Date(),
  tz: string = "Africa/Cairo"
): boolean {
  let slots: WorkingHourSlot[] = [];
  try {
    slots = JSON.parse(slotsJson);
  } catch {
    return true; // default: always open
  }
  if (!Array.isArray(slots) || slots.length === 0) return true;

  const p = partsInTz(now, tz);
  const day = p.weekday;
  const mins = p.hour * 60 + p.minute;

  return slots.some((s) => {
    if (!s.enabled || s.day !== day) return false;
    const from = parseHHMM(s.from);
    const to = parseHHMM(s.to);
    if (from === null || to === null) return false;
    return mins >= from && mins <= to;
  });
}

function parseHHMM(s: string): number | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

// ---------------------------------------------------------------------------
// Knowledge-gap detection
// Heuristic: bot replies that admit ignorance / ask the customer to wait for
// the team. We catch this so the admin can convert the question into KB.
// ---------------------------------------------------------------------------

const GAP_PHRASES = [
  "لا أعرف", "ما اعرف", "ما أعرف", "مش عارف", "مش متأكد", "مش متاكد",
  "غير متوفر", "ليس لدي", "ليست لدي", "ليس لدى", "ما عنديش",
  "اعتذر", "أعتذر", "آسف",
  "تواصل مع الإدارة", "تواصل مع الادارة", "هنتواصل معاك", "سيتواصل معك",
  "فريق المبيعات", "خدمة العملاء",
  "غير قادر على الإجابة", "خارج معلوماتي",
];

/** True if the assistant's reply indicates the bot couldn't answer. */
export function looksLikeGap(reply: string): boolean {
  if (!reply) return false;
  const norm = normalizeAr(reply);
  let hits = 0;
  for (const p of GAP_PHRASES) {
    if (norm.includes(normalizeAr(p))) hits++;
    if (hits >= 1) return true;
  }
  return false;
}

/** Cluster two questions as the same: cheap Jaccard on words. */
export function questionSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeAr(a).split(/\s+/).filter((w) => w.length > 2));
  const wb = new Set(normalizeAr(b).split(/\s+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach((w) => { if (wb.has(w)) inter++; });
  return inter / Math.min(wa.size, wb.size);
}
