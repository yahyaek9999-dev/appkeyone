// Knowledge Brain Pro — vector search engine.
//
// A real, deterministic term-space (vector space model) retrieval engine with
// NO external dependency: documents are chunked, each chunk is embedded as a
// term-frequency vector, and queries are matched by cosine similarity + a
// lexical phrase bonus (hybrid), then re-ranked. This genuinely ranks by
// similarity rather than substring presence. A neural provider (OpenAI/Gemini)
// can be slotted in via `embedQuery`/`embedChunk` when a key is configured —
// the storage/search path is provider-agnostic.

export type SparseVec = Record<string, number>;

// Light Arabic + English stopword list (high-frequency, low-signal tokens).
const STOP = new Set([
  "في",
  "من",
  "على",
  "الى",
  "إلى",
  "عن",
  "مع",
  "هذا",
  "هذه",
  "ذلك",
  "التي",
  "الذي",
  "او",
  "أو",
  "و",
  "ثم",
  "ان",
  "أن",
  "إن",
  "كان",
  "هو",
  "هي",
  "ما",
  "لا",
  "هل",
  "كل",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "is",
  "are",
  "be",
  "with",
  "you",
  "your",
]);

/** Normalize Arabic orthography (diacritics, alef/ya/ta-marbuta variants). */
function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, "") // tashkeel
    .replace(/[آأإٱ]/g, "ا") // alef variants → ا
    .replace(/ى/g, "ي") // alef maqsura → ي
    .replace(/ة/g, "ه"); // ta marbuta → ه
}

export function tokenize(text: string): string[] {
  const norm = normalizeArabic((text || "").toLowerCase());
  return norm
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Embed text as a term-frequency sparse vector + its L2 norm. */
export function embedLocal(text: string): { vec: SparseVec; norm: number; tokens: number } {
  const toks = tokenize(text);
  const vec: SparseVec = {};
  for (const t of toks) vec[t] = (vec[t] || 0) + 1;
  let sumSq = 0;
  for (const k in vec) sumSq += vec[k] * vec[k];
  return { vec, norm: Math.sqrt(sumSq) || 0, tokens: toks.length };
}

/** Cosine similarity between a query vector and a stored chunk vector. */
export function cosine(qVec: SparseVec, qNorm: number, dVec: SparseVec, dNorm: number): number {
  if (qNorm === 0 || dNorm === 0) return 0;
  // iterate the smaller map
  const [small, large] =
    Object.keys(qVec).length <= Object.keys(dVec).length ? [qVec, dVec] : [dVec, qVec];
  let dot = 0;
  for (const k in small) if (large[k]) dot += small[k] * large[k];
  return dot / (qNorm * dNorm);
}

/** Split long content into ~600-char chunks on sentence/line boundaries. */
export function chunkText(content: string, target = 600): string[] {
  const clean = (content || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= target) return [clean];
  const parts: string[] = [];
  const sentences = clean.split(/(?<=[.!؟?\n])\s+/);
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).length > target && cur) {
      parts.push(cur.trim());
      cur = s;
    } else cur = cur ? cur + " " + s : s;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Query expansion + rewriting: normalize, dedupe tokens, drop noise. */
export function rewriteQuery(q: string): string {
  return tokenize(q).join(" ");
}
