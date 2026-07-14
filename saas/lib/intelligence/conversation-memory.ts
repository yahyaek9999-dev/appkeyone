// AI Intelligence Layer — Conversation Semantic Memory.
//
// THE GAP THIS CLOSES: CustomerMemory carries exactly one rolling text summary
// per customer — there is no way to semantically recall an OLDER summary once
// it's been overwritten by a newer one, and no ranking when multiple memory
// signals could be relevant. This module snapshots each rolling-summary write
// into an append-only, embedded chunk store (reusing the same deterministic
// term-frequency vector engine the Knowledge Brain already uses — no new
// dependency, no dense-vector infra) so past summaries stay searchable.
//
// Sibling of lib/intelligence/memory-graph.ts: called from the SAME
// background cycle right after CustomerMemory.summary is written, never
// touches that write path, the send pipeline, or billing. Fully fail-closed —
// any error here can never affect the memory cycle or a reply.
import { prisma } from "@/lib/db";
import { embedLocal, cosine } from "@/lib/knowledge-brain/vector";
import { intelFlag } from "./flags";

/** Cap chunks retained per customer — bounds storage + search cost regardless of tenure. */
const MAX_CHUNKS_PER_CUSTOMER = 20;
/** Chunks scanned per search — bounded, no pagination needed at this scale. */
const SEARCH_SCAN_LIMIT = 50;
const MIN_SIMILARITY = 0.12;

export async function recordConversationMemoryChunk(args: {
  userId: string;
  customerId: string;
  content: string;
}): Promise<void> {
  if (!intelFlag("INTEL_CONVERSATION_MEMORY_SEARCH")) return;
  const content = (args.content || "").trim();
  if (content.length < 10) return;

  try {
    const { vec, norm, tokens } = embedLocal(content);
    if (!tokens) return;
    await (prisma as any).conversationMemoryChunk.create({
      data: {
        userId: args.userId,
        customerId: args.customerId,
        content: content.slice(0, 1000),
        vec: JSON.stringify(vec),
        norm,
        tokens,
      },
    });

    // Prune beyond the cap (oldest first) — keep storage/search cost bounded.
    const extra = await (prisma as any).conversationMemoryChunk.findMany({
      where: { userId: args.userId, customerId: args.customerId },
      orderBy: { createdAt: "desc" },
      skip: MAX_CHUNKS_PER_CUSTOMER,
      select: { id: true },
    });
    if (extra.length) {
      await (prisma as any).conversationMemoryChunk.deleteMany({
        where: { id: { in: extra.map((e: { id: string }) => e.id) } },
      });
    }
  } catch {
    // never break the memory cycle
  }
}

export type ConversationMemoryHit = { content: string; score: number; createdAt: Date };

/** Ranked semantic search over a customer's past memory snapshots. Returns [] when
 *  the feature is off, nothing matches, or any error occurs (fail-closed — callers
 *  treat an empty result exactly like "no extra context available"). */
export async function searchConversationMemory(
  userId: string,
  customerId: string,
  query: string,
  topK = 3,
): Promise<ConversationMemoryHit[]> {
  if (!intelFlag("INTEL_CONVERSATION_MEMORY_SEARCH")) return [];
  const q = (query || "").trim();
  if (!q) return [];

  try {
    const chunks = await (prisma as any).conversationMemoryChunk.findMany({
      where: { userId, customerId },
      orderBy: { createdAt: "desc" },
      take: SEARCH_SCAN_LIMIT,
      select: { content: true, vec: true, norm: true, createdAt: true },
    });
    if (!chunks.length) return [];

    const { vec: qVec, norm: qNorm } = embedLocal(q);
    if (!qNorm) return [];

    const scored = chunks
      .map((c: { content: string; vec: string; norm: number; createdAt: Date }) => {
        let dVec: Record<string, number> = {};
        try { dVec = JSON.parse(c.vec || "{}"); } catch { /* skip malformed row */ }
        const score = cosine(qVec, qNorm, dVec, c.norm);
        return { content: c.content, score, createdAt: c.createdAt };
      })
      .filter((c: { score: number }) => c.score >= MIN_SIMILARITY)
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, topK);

    return scored;
  } catch {
    return [];
  }
}
