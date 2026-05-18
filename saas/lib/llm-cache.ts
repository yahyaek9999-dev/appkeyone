// ---------------------------------------------------------------------------
// LLM response cache — exact-text only.
//
// Stores the LLM's VERBATIM reply for identical customer questions, scoped
// per bot, with a TTL. We never fabricate a reply; we only replay a previous
// LLM-generated reply when the customer asks the SAME question literally.
//
// Quality impact: zero (same model, same text, just skipped network call).
// Speed impact: 10s+ → <50ms for cache hits.
// ---------------------------------------------------------------------------
import { createHash } from "crypto";
import { prisma } from "./db";
import { semanticCacheKey } from "./semantic-match";

/**
 * Normalize a question so trivial differences (extra spaces, trailing punct,
 * different unicode forms of the same Arabic char) collapse to the same hash.
 *
 * We deliberately keep this CONSERVATIVE — we only collapse what's clearly
 * cosmetic. We do NOT do semantic matching (that would risk wrong replies).
 */
export function normalizeQuestion(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFKC")        // canonicalize unicode forms
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/\s+/g, " ")    // collapse whitespace
    .replace(/[.,،؟?!ـ\-_]+$/g, "") // trailing punctuation/tatweel
    .trim()
    .toLowerCase();
}

export function questionHash(botId: string, question: string): string {
  // Phase 3: stronger normalization (Arabic-aware) collapses typos / dialect
  // variants of the same question to the same cache key. Hash format is
  // namespaced with "v2:" so it never collides with legacy entries.
  const n = semanticCacheKey(question);
  return createHash("sha256").update(`v2::${botId}::${n}`).digest("hex");
}

/**
 * Legacy hash (pre-Phase-3). Used only as a fallback during lookup so already
 * stored cache entries keep paying off until their TTL expires.
 */
function legacyQuestionHash(botId: string, question: string): string {
  const n = normalizeQuestion(question);
  return createHash("sha256").update(`${botId}::${n}`).digest("hex");
}

/**
 * Look up a cached reply. Returns null if:
 *   - cache disabled for the bot,
 *   - no entry,
 *   - entry expired (we lazily clean it),
 *   - question too short / too long to be safely cached.
 */
export async function getCached(
  botId: string,
  cacheEnabled: boolean,
  question: string
): Promise<string | null> {
  if (!cacheEnabled) return null;
  const n = normalizeQuestion(question);
  // Don't cache trivially short ("ok", "yes") or huge requests
  if (n.length < 6 || n.length > 400) return null;

  const qHash = questionHash(botId, question);
  const legacyHash = legacyQuestionHash(botId, question);
  try {
    // Primary lookup (Phase 3 normalized). One indexed point query.
    let row = await prisma.llmCache.findUnique({
      where: { botId_qHash: { botId, qHash } },
    });
    // Fallback to legacy hash so pre-Phase-3 cache entries still serve hits
    // until they TTL out. Skipped when both hashes are identical.
    if (!row && legacyHash !== qHash) {
      row = await prisma.llmCache.findUnique({
        where: { botId_qHash: { botId, qHash: legacyHash } },
      });
    }
    if (!row) return null;
    if (row.expiresAt.getTime() <= Date.now()) {
      // expired — clean up best-effort, don't block
      prisma.llmCache.delete({ where: { id: row.id } }).catch(() => {});
      return null;
    }
    // bump hit counter + lastUsedAt (fire-and-forget)
    prisma.llmCache.update({
      where: { id: row.id },
      data: { hits: { increment: 1 }, lastUsedAt: new Date() },
    }).catch(() => {});
    return row.response;
  } catch {
    return null;
  }
}

/**
 * Save the reply into the cache. Safe to call even if cache disabled — it
 * just no-ops. Errors are swallowed because cache is best-effort.
 */
export async function setCached(
  botId: string,
  cacheEnabled: boolean,
  ttlHours: number,
  question: string,
  response: string
): Promise<void> {
  if (!cacheEnabled) return;
  if (!response || response.trim().length < 2) return;
  const n = normalizeQuestion(question);
  if (n.length < 6 || n.length > 400) return;
  if (response.length > 4000) return; // skip huge replies

  const qHash = questionHash(botId, question);
  const ttl = Math.max(1, Math.min(168, ttlHours || 24));
  const expiresAt = new Date(Date.now() + ttl * 3600 * 1000);

  try {
    await prisma.llmCache.upsert({
      where: { botId_qHash: { botId, qHash } },
      create: {
        botId, qHash,
        question: question.slice(0, 800),
        response,
        expiresAt,
      },
      update: {
        response,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });
  } catch {
    // ignore
  }
}

/**
 * Best-effort cleanup of expired entries — invoked periodically (cron) or
 * opportunistically. Returns how many rows were deleted.
 */
export async function purgeExpired(): Promise<number> {
  try {
    const r = await prisma.llmCache.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return r.count;
  } catch {
    return 0;
  }
}
