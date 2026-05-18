// Phase 3 — Smart Response Pipeline (local, zero-deps).
//
// Provides:
//   - Strong Arabic normalization (typo / dialect tolerant)
//   - Lightweight TF-cosine similarity (no embeddings, no vector DB)
//   - Fuzzy FAQ matcher for QuickReply rules
//   - Adaptive history-depth classifier
//   - History compressor (drops greetings, dedupes assistant repeats)
//   - Normalized cache-key helper
//
// All functions are pure, allocate small Maps, and have zero external deps.

// ---------------------------------------------------------------------------
// Arabic normalization (stronger than insights.normalizeArabic)
// ---------------------------------------------------------------------------

const TASHKEEL_RE  = /[\u064B-\u065F\u0670]/g;       // fatha, damma, kasra, sukun, dagger alef
const TATWEEL_RE   = /\u0640/g;                       // ـ
const ZW_RE        = /[\u200B-\u200D\uFEFF]/g;        // zero-width
const PUNCT_RE     = /[.,،؟?!؛:"'()«»\-_–—…]/g;
const REPEAT_RE    = /([\u0621-\u064A])\1{2,}/g;      // 3+ repeats → 2

const AR_DIGITS    = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS    = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Aggressive Arabic normalization. Handles dialect variants, typos like
 * stretched letters ("ازاااايك"), tatweel, alef/yaa/taa-marbuta variants,
 * arabic + persian digits → western, casing, whitespace.
 *
 * Idempotent. Safe on any string. Returns "" for falsy input.
 */
export function normalizeAr(s: string): string {
  if (!s) return "";
  let out = s.normalize("NFKC");

  // arabic + persian digits → 0-9
  out = out.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  out = out.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));

  out = out
    .replace(ZW_RE, "")
    .replace(TATWEEL_RE, "")
    .replace(TASHKEEL_RE, "")
    .replace(/[إأآٱا]/g, "ا")  // alef variants
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .replace(/گ/g, "ك")        // persian kaf
    .replace(/ڤ/g, "ف")
    .replace(/پ/g, "ب")
    .replace(/چ/g, "ج")
    .replace(REPEAT_RE, "$1$1") // "ازاااي" → "ازاي"
    .replace(PUNCT_RE, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return out;
}

// ---------------------------------------------------------------------------
// Tokenizer + tiny stopword filter. We avoid stripping every short word
// because Arabic legitimate words can be 2 chars ("لي", "كم").
// ---------------------------------------------------------------------------

const STOP = new Set([
  "في", "من", "الى", "إلى", "على", "عن", "هو", "هي", "انت", "أنت", "انتم", "أنا",
  "احنا", "نحن", "هل", "ولا", "أو", "او", "ثم", "لكن", "اذا", "إذا", "لو",
  "ان", "أن", "إن", "كان", "كانت", "يكون", "تكون",
  "هذا", "هذه", "ذلك", "تلك", "كذا",
  "the", "a", "an", "of", "and", "or", "in", "on", "is", "are", "to", "for", "with",
]);

export function tokenize(s: string): string[] {
  const n = normalizeAr(s);
  if (!n) return [];
  const out: string[] = [];
  for (const w of n.split(/\s+/)) {
    if (!w || w.length < 2) continue;
    if (STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// TF-cosine similarity (lightweight, no IDF, no embeddings).
// Suitable for short FAQ-style strings. Returns score in [0, 1].
// ---------------------------------------------------------------------------

type TfVec = Map<string, number>;

export function tfVector(tokens: string[]): TfVec {
  const v = new Map<string, number>();
  for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

export function cosine(a: TfVec, b: TfVec): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  // iterate the smaller map
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  small.forEach((va, k) => {
    const vb = big.get(k);
    if (vb) dot += va * vb;
  });
  a.forEach((v) => { na += v * v; });
  b.forEach((v) => { nb += v * v; });
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  sa.forEach((x) => { if (sb.has(x)) inter++; });
  return inter / (sa.size + sb.size - inter);
}

/**
 * Similarity score combining cosine + jaccard. cosine handles repeated
 * keywords, jaccard handles set overlap (typo-tolerant when fed normalized
 * tokens). Returns [0,1].
 */
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const c = cosine(tfVector(ta), tfVector(tb));
  const j = jaccard(ta, tb);
  // Weighted: cosine carries more signal for short FAQ strings
  return 0.7 * c + 0.3 * j;
}

// ---------------------------------------------------------------------------
// Fuzzy FAQ matcher — operates on existing QuickReply rules.
// Returns the best match above threshold, or null.
// ---------------------------------------------------------------------------

export interface FuzzyRule {
  id: string;
  triggers: string;   // JSON array OR comma-separated
  reply: string;
}

export interface FuzzyMatch {
  id: string;
  reply: string;
  score: number;
}

/**
 * Try to match a customer question against a rule's triggers using cosine
 * similarity. Each trigger is treated as a candidate FAQ question; we take
 * the best trigger's score.
 */
export function fuzzyMatchQuickReplies(
  question: string,
  rules: FuzzyRule[],
  threshold = 0.62
): FuzzyMatch | null {
  if (!question || !rules?.length) return null;
  const qTokens = tokenize(question);
  if (qTokens.length < 1) return null;
  const qVec = tfVector(qTokens);

  let best: FuzzyMatch | null = null;
  for (const r of rules) {
    let triggers: string[] = [];
    try {
      triggers = JSON.parse(r.triggers);
    } catch {
      triggers = String(r.triggers || "").split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(triggers) || !triggers.length) continue;

    for (const trig of triggers) {
      const tTokens = tokenize(trig);
      if (!tTokens.length) continue;
      const c = cosine(qVec, tfVector(tTokens));
      const j = jaccard(qTokens, tTokens);
      const score = 0.7 * c + 0.3 * j;
      if (score >= threshold && (!best || score > best.score)) {
        best = { id: r.id, reply: r.reply, score };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Adaptive history depth.
// Cheap heuristic — no LLM call. Returns the recommended number of past
// turns to include in the prompt.
// ---------------------------------------------------------------------------

const NEGOTIATION_KEYS = [
  "خصم","تخفيض","عرض","سعر","افضل سعر","اقل","تنزل","ميزانيه","ميزانية",
  "نهائي","اخر سعر","أخر سعر","اخر كلمه","تفاوض","غالي","رخيص","ارخص",
  "discount","price","cheaper","negotiate","best price","final",
];

const COMPLEX_KEYS = [
  "مقارنه","مقارنة","فرق","الفرق","ايهما","ايه افضل","ايه الافضل",
  "هل تنصحني","اقترح","تفاصيل","شرح","موصفات","مواصفات","compare","details",
];

export type Complexity = "simple" | "medium" | "complex";

export function classifyComplexity(text: string, leadScore = 0): Complexity {
  const norm = normalizeAr(text);
  if (!norm) return "simple";

  const wc = norm.split(/\s+/).length;
  const isNegotiating = NEGOTIATION_KEYS.some((k) => norm.includes(normalizeAr(k)));
  const isComplex     = COMPLEX_KEYS.some((k) => norm.includes(normalizeAr(k)));

  // Hot leads negotiating need full context
  if (isNegotiating && leadScore >= 50) return "complex";
  if (isComplex || wc > 22)             return "complex";
  if (isNegotiating || wc > 10)         return "medium";
  return "simple";
}

export function depthForComplexity(c: Complexity): number {
  return c === "complex" ? 16 : c === "medium" ? 8 : 4;
}

// ---------------------------------------------------------------------------
// History compressor.
//
// Drops low-information turns (pure greetings, near-empty acknowledgements)
// and de-duplicates consecutive identical-or-near-identical assistant
// replies. Preserves chronological order. Pure function — never mutates input.
// ---------------------------------------------------------------------------

const GREETING_RE = /^(السلام|سلام|اهلا|أهلا|hi|hello|مرحب|صباح|مساء)[\s,!.؟?]*$/i;
const ACK_RE      = /^(ok|okay|تمام|طيب|ماشي|حاضر|تمت|تم|شكرا|شكراً|thanks|thx|👍|🙏|✅|نعم|اه|لا)[\s,!.؟?]*$/i;

interface Msg { role: string; content: string }

export function compressHistory(messages: Msg[]): Msg[] {
  if (!messages?.length) return [];
  const out: Msg[] = [];
  let lastAssistantNorm = "";

  for (const m of messages) {
    if (!m?.content) continue;
    const trimmed = m.content.trim();
    if (!trimmed) continue;

    // Drop pure greetings unless first message
    if (out.length > 1 && GREETING_RE.test(trimmed)) continue;
    // Drop acknowledgements (low information)
    if (ACK_RE.test(trimmed)) continue;

    if (m.role === "assistant") {
      const n = normalizeAr(trimmed);
      // Skip if near-identical to the last assistant reply (avoid loops)
      if (n === lastAssistantNorm) continue;
      if (lastAssistantNorm && similarity(n, lastAssistantNorm) > 0.92) continue;
      lastAssistantNorm = n;
    } else {
      // user / system / tool messages reset the dedupe ref
      lastAssistantNorm = "";
    }
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalized cache key — superset of llm-cache.normalizeQuestion. Used for
// the secondary semantic-cache lookup (defined elsewhere). Idempotent.
// ---------------------------------------------------------------------------

export function semanticCacheKey(s: string): string {
  // Keep deterministic token order so paraphrases collapse less aggressively
  // (we want NEAR-exact, not semantic equivalence — quality safety first).
  return normalizeAr(s);
}
