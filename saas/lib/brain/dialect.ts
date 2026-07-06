/**
 * lib/brain/dialect.ts — Arabic dialect detection + normalized meaning layer.
 *
 * Deterministic, marker-based (no LLM): scores text against distinctive markers
 * for 10 dialects and returns the best match with a confidence, plus a
 * normalized-to-MSA rendering used downstream so retrieval/classification is
 * dialect-agnostic.
 */

export type DialectCode = "eg" | "sa" | "ae" | "kw" | "jo" | "sy" | "iq" | "ma" | "dz" | "tn";

export const DIALECT_LABELS: Record<DialectCode, { ar: string; en: string }> = {
  eg: { ar: "مصري", en: "Egyptian" },
  sa: { ar: "سعودي", en: "Saudi" },
  ae: { ar: "إماراتي", en: "Emirati" },
  kw: { ar: "كويتي", en: "Kuwaiti" },
  jo: { ar: "أردني", en: "Jordanian" },
  sy: { ar: "سوري", en: "Syrian" },
  iq: { ar: "عراقي", en: "Iraqi" },
  ma: { ar: "مغربي", en: "Moroccan" },
  dz: { ar: "جزائري", en: "Algerian" },
  tn: { ar: "تونسي", en: "Tunisian" },
};

// Distinctive markers per dialect (weighted: 2 = strongly distinctive, 1 = common-in).
const MARKERS: Record<DialectCode, Array<[string, number]>> = {
  eg: [["إزيك", 2], ["ازيك", 2], ["عايز", 2], ["عاوز", 2], ["مفيش", 2], ["كده", 2], ["اوي", 2], ["خالص", 1], ["ايه", 1], ["ده", 1], ["دي", 1], ["معلش", 2]],
  sa: [["وش", 2], ["ابغى", 2], ["أبغى", 2], ["كذا", 1], ["زين", 1], ["تكفى", 2], ["مره", 1], ["يالغالي", 2], ["باقصد", 1]],
  ae: [["شحالك", 2], ["وايد", 1], ["يبا", 2], ["چذي", 2], ["عيل", 1], ["ماعليه", 1], ["ابا", 2]],
  kw: [["شنو", 1], ["شلونك", 2], ["چنه", 2], ["ابي", 1], ["وايد", 1], ["عيل", 1], ["شكو", 1]],
  jo: [["بدي", 2], ["هيك", 1], ["كتير", 1], ["زلمة", 2], ["عنجد", 2], ["كيفك", 1], ["اشي", 2]],
  sy: [["بدي", 2], ["هيك", 1], ["كتير", 1], ["منيح", 2], ["كرمال", 2], ["شلون", 1], ["لك", 1]],
  iq: [["شنو", 1], ["اريد", 2], ["أريد", 2], ["هواي", 2], ["اكو", 2], ["ماكو", 2], ["خوش", 2], ["شلونك", 1]],
  ma: [["بزاف", 1], ["واخا", 2], ["دابا", 2], ["بغيت", 2], ["ديال", 2], ["مزيان", 2], ["لاباس", 2]],
  dz: [["واش", 2], ["راني", 2], ["كيفاش", 2], ["بصح", 2], ["نتاع", 2], ["بزاف", 1], ["نروح", 1]],
  tn: [["برشة", 2], ["ياسر", 2], ["باهي", 2], ["شنية", 2], ["فمة", 2], ["نحب", 1], ["تو", 1]],
};

// Dialect words → MSA equivalents for the normalized meaning layer.
const NORMALIZE_MAP: Array<[RegExp, string]> = [
  [/عاي?وز|عايز|ابغى|أبغى|بدي|بغيت|اريد|أريد|ابي|ابا/g, "أريد"],
  [/وش|شنو|شو|واش|شنية|ايه|إيه/g, "ماذا"],
  [/كتير|وايد|بزاف|برشة|ياسر|هواي|اوي|مره/g, "كثير"],
  [/كده|هيك|چذي|كذا|چنه/g, "هكذا"],
  [/ازيك|إزيك|شلونك|كيفك|شحالك|كيفاش/g, "كيف حالك"],
  [/مفيش|ماكو/g, "لا يوجد"],
  [/اكو|فمة/g, "يوجد"],
  [/زين|منيح|مزيان|باهي|خوش/g, "جيد"],
];

const DIACRITICS = /[ً-ْٰـ]/g; // tashkeel + tatweel

/** Strip diacritics + collapse alef/ya/ta-marbuta variants for matching. */
export function normalizeArabic(text: string): string {
  return (text || "")
    .replace(DIACRITICS, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DialectResult {
  dialect: DialectCode | "";
  confidence: number; // 0-1
  scores: Partial<Record<DialectCode, number>>;
  normalized: string;
}

/** Detect dialect + return the MSA-normalized meaning layer. */
export function detectDialect(text: string): DialectResult {
  const norm = normalizeArabic(text);
  const scores: Partial<Record<DialectCode, number>> = {};
  let total = 0;
  for (const [code, markers] of Object.entries(MARKERS) as Array<[DialectCode, Array<[string, number]>]>) {
    let s = 0;
    for (const [word, weight] of markers) {
      if (norm.includes(normalizeArabic(word))) s += weight;
    }
    if (s > 0) { scores[code] = s; total += s; }
  }
  let best: DialectCode | "" = "";
  let bestScore = 0;
  for (const [code, s] of Object.entries(scores) as Array<[DialectCode, number]>) {
    if (s > bestScore) { bestScore = s; best = code; }
  }
  const confidence = total > 0 ? Math.min(1, bestScore / Math.max(total, 2)) : 0;
  return { dialect: best, confidence: Math.round(confidence * 100) / 100, scores, normalized: normalizeMeaning(norm) };
}

/** Render a dialect string into a normalized MSA meaning layer. */
export function normalizeMeaning(text: string): string {
  let out = normalizeArabic(text);
  for (const [re, msa] of NORMALIZE_MAP) out = out.replace(re, msa);
  return out.replace(/\s+/g, " ").trim();
}
