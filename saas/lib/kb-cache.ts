// Knowledge-base cache + top-K retrieval.
//
// Two layers:
//   1. loadKnowledgeBaseCached()   — full KB (legacy callers, /api/chat, etc).
//   2. retrieveRelevantKb()        — top-K relevant chunks for a question.
//
// Why retrieval matters: stuffing 12 KB of merchant documents into every
// system prompt drowns the LLM in noise. Most merchants store FAQs,
// product lists, and policies in long titles — only a couple of those are
// relevant to any given customer question. We chunk the KB into paragraphs
// and rank chunks by lightweight TF-cosine similarity (no embeddings, no
// vector DB), then inject only the top hits.
//
// Both layers share the same per-user cache + invalidation contract.

import { prisma } from "./db";
import { tokenize, tfVector, cosine, jaccard, normalizeAr } from "./semantic-match";

const KB_TTL_MS = Math.max(5_000, Number(process.env.KB_CACHE_TTL_MS || 60_000));
const KB_MAX_ENTRIES = Math.max(32, Number(process.env.KB_CACHE_MAX || 256));

interface Chunk {
  /** the text shown to the LLM */
  text: string;
  /** owning document title — kept as the chunk header for context */
  docTitle: string;
  /** precomputed TF vector for fast scoring */
  tfv: Map<string, number>;
  /** precomputed token list for jaccard scoring */
  tokens: string[];
}

interface CacheEntry {
  /** legacy concatenated KB used by callers that still want the whole thing */
  kb: string;
  /** ranked chunk index used by retrieveRelevantKb() */
  chunks: Chunk[];
  expiresAt: number;
}

const kbCache = new Map<string, CacheEntry>();

/** Approximate target chunk size in characters (paragraphs longer than this are split). */
const CHUNK_TARGET = 600;
/** A chunk smaller than this gets merged into the next sibling. */
const CHUNK_MIN = 80;

/** Split a doc's text into searchable chunks. Paragraph-first, with a fallback line-window. */
function chunkDocument(title: string, content: string): Chunk[] {
  if (!content?.trim()) return [];
  // Split on blank lines first; each paragraph is a candidate chunk.
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (p.length >= CHUNK_TARGET) {
      // long paragraph — emit any buffered piece, then split this one by sentence.
      if (buf) { out.push(buf); buf = ""; }
      const sentences = p.split(/(?<=[.!?؟。])\s+/);
      let s = "";
      for (const sent of sentences) {
        if ((s + " " + sent).length > CHUNK_TARGET && s) {
          out.push(s.trim());
          s = sent;
        } else {
          s = s ? `${s} ${sent}` : sent;
        }
      }
      if (s.trim()) out.push(s.trim());
      continue;
    }
    // small paragraph — coalesce with buf until target.
    const next = buf ? `${buf}\n${p}` : p;
    if (next.length >= CHUNK_TARGET) {
      out.push(buf || next);
      buf = buf ? p : "";
    } else {
      buf = next;
    }
  }
  if (buf) out.push(buf);

  // Drop tiny fragments by merging with previous.
  const merged: string[] = [];
  for (const c of out) {
    if (c.length < CHUNK_MIN && merged.length) {
      merged[merged.length - 1] += "\n" + c;
    } else {
      merged.push(c);
    }
  }

  return merged.map((text) => {
    const tokens = tokenize(text);
    return {
      text,
      docTitle: title,
      tfv: tfVector(tokens),
      tokens,
    };
  });
}

async function buildEntry(userId: string): Promise<CacheEntry> {
  const docs = await prisma.document.findMany({
    where: { userId },
    select: { title: true, content: true },
  });
  const chunks: Chunk[] = [];
  const kbParts: string[] = [];
  for (const d of docs) {
    kbParts.push(`# ${d.title}\n${d.content}`);
    for (const c of chunkDocument(d.title, d.content)) chunks.push(c);
  }
  return {
    kb: kbParts.join("\n\n---\n\n"),
    chunks,
    expiresAt: Date.now() + KB_TTL_MS,
  };
}

async function getEntry(userId: string): Promise<CacheEntry> {
  const now = Date.now();
  const hit = kbCache.get(userId);
  if (hit && hit.expiresAt > now) {
    // refresh LRU recency
    kbCache.delete(userId);
    kbCache.set(userId, hit);
    return hit;
  }
  const fresh = await buildEntry(userId);
  kbCache.set(userId, fresh);
  if (kbCache.size > KB_MAX_ENTRIES) {
    const oldestKey = kbCache.keys().next().value;
    if (oldestKey) kbCache.delete(oldestKey);
  }
  return fresh;
}

/** Legacy: full concatenated KB (used by /api/chat playground + onboarding). */
export async function loadKnowledgeBaseCached(userId: string): Promise<string> {
  const e = await getEntry(userId);
  return e.kb;
}

export interface RetrievalOptions {
  /** how many chunks to return — clamps to [1, 8]. */
  k?: number;
  /** minimum cosine+jaccard score to accept a chunk; below this we drop it. */
  minScore?: number;
  /** soft character cap on the joined output. */
  charBudget?: number;
}

/**
 * Return the top-K KB chunks most relevant to `question`. Falls back to the
 * full KB (truncated) when:
 *   - the question is too short to score reliably (e.g. "اهلا"),
 *   - no chunk clears the score floor,
 *   - the merchant has < 3 chunks total (retrieval brings no value).
 *
 * Always returns a string ready to drop into the system prompt under a
 * "## معلومات الشركة" heading. Empty string when the merchant has no docs.
 */
export async function retrieveRelevantKb(
  userId: string,
  question: string,
  opts: RetrievalOptions = {}
): Promise<string> {
  const e = await getEntry(userId);
  if (e.chunks.length === 0) return "";

  const k = Math.max(1, Math.min(8, opts.k ?? 4));
  const minScore = opts.minScore ?? 0.05;
  const charBudget = Math.max(500, opts.charBudget ?? 3500);

  const qTokens = tokenize(question);
  // Short / low-signal questions: skip ranking, fall back to the head of KB.
  // (Greetings and acknowledgements shouldn't bias retrieval.)
  if (qTokens.length < 2 || e.chunks.length < 3) {
    return e.kb.slice(0, charBudget);
  }
  const qVec = tfVector(qTokens);

  const scored = e.chunks.map((c) => {
    const cs = cosine(qVec, c.tfv);
    const js = jaccard(qTokens, c.tokens);
    const titleBonus = qTokens.some((t) => normalizeAr(c.docTitle).includes(t)) ? 0.1 : 0;
    return { chunk: c, score: Math.min(1, 0.7 * cs + 0.3 * js + titleBonus) };
  });
  scored.sort((a, b) => b.score - a.score);

  // If even the top chunk is uninformative, fall back to head-of-KB so the
  // model still has SOME grounding instead of an empty context.
  if (scored[0].score < minScore) {
    return e.kb.slice(0, charBudget);
  }

  const picked: string[] = [];
  let used = 0;
  for (const s of scored.slice(0, k)) {
    if (s.score < minScore) break;
    const piece = `### ${s.chunk.docTitle}\n${s.chunk.text}`;
    if (used + piece.length > charBudget && picked.length > 0) break;
    picked.push(piece);
    used += piece.length + 4;
  }
  return picked.join("\n\n");
}

/** Drop a user's cached KB after a knowledge mutation. Safe no-op if absent. */
export function invalidateKnowledgeCache(userId: string): void {
  kbCache.delete(userId);
}
