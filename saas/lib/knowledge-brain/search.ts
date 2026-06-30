// Knowledge Brain Pro — indexer + hybrid semantic search + re-ranking.
import { prisma } from "@/lib/db";
import { embedLocal, cosine, chunkText, rewriteQuery, tokenize, type SparseVec } from "./vector";

export interface IndexResult {
  documents: number;
  chunks: number;
  provider: string;
}

/** Rebuild the entire vector index for a tenant (full reindex). Logs a job. */
export async function reindex(userId: string): Promise<IndexResult> {
  const job = await prisma.embeddingJob.create({
    data: { userId, kind: "reindex", status: "running", provider: "local" },
  });
  try {
    const docs = await prisma.document.findMany({
      where: { userId },
      select: { id: true, content: true },
    });
    await prisma.documentChunk.deleteMany({ where: { userId } });
    let chunks = 0;
    for (const d of docs) {
      const parts = chunkText(d.content);
      if (!parts.length) continue;
      const data = parts.map((content, i) => {
        const e = embedLocal(content);
        return {
          userId,
          documentId: d.id,
          position: i,
          content,
          vec: JSON.stringify(e.vec),
          norm: e.norm,
          tokens: e.tokens,
          provider: "local",
        };
      });
      await prisma.documentChunk.createMany({ data });
      chunks += data.length;
    }
    await prisma.embeddingJob.update({
      where: { id: job.id },
      data: { status: "done", documents: docs.length, chunks, finishedAt: new Date() },
    });
    return { documents: docs.length, chunks, provider: "local" };
  } catch (e: any) {
    await prisma.embeddingJob.update({
      where: { id: job.id },
      data: { status: "failed", error: String(e?.message || e), finishedAt: new Date() },
    });
    throw e;
  }
}

/** Incremental: only index documents that have no chunks yet. */
export async function incrementalIndex(userId: string): Promise<IndexResult> {
  const docs = await prisma.document.findMany({
    where: { userId },
    select: { id: true, content: true },
  });
  let chunks = 0,
    indexed = 0;
  for (const d of docs) {
    const has = await prisma.documentChunk.count({ where: { documentId: d.id } });
    if (has > 0) continue;
    const parts = chunkText(d.content);
    if (!parts.length) continue;
    const data = parts.map((content, i) => {
      const e = embedLocal(content);
      return {
        userId,
        documentId: d.id,
        position: i,
        content,
        vec: JSON.stringify(e.vec),
        norm: e.norm,
        tokens: e.tokens,
        provider: "local",
      };
    });
    await prisma.documentChunk.createMany({ data });
    chunks += data.length;
    indexed++;
  }
  return { documents: indexed, chunks, provider: "local" };
}

export interface SearchHit {
  documentId: string;
  title: string;
  snippet: string;
  similarity: number; // 0-1 cosine
  relevance: number; // 0-1 after hybrid + rerank
  confidence: number; // 0-100
  freshness: number; // 0-100
  quality: number; // 0-100
  sourceScore: number; // 0-100
}

function freshnessScore(createdAt: Date): number {
  const days = (Date.now() - createdAt.getTime()) / 86_400_000;
  if (days <= 7) return 100;
  if (days >= 365) return 20;
  return Math.round(100 - (days / 365) * 80);
}

export interface SearchIndex {
  chunks: { documentId: string; content: string; vec: string; norm: number; tokens: number }[];
  docMap: Map<string, { id: string; title: string; priorityScore: number; createdAt: Date }>;
}

/** Load the tenant's vector index ONCE (chunks + their documents). Reuse across
 *  many queries (e.g. the 120-scenario arena) to avoid re-hitting the DB per
 *  query — perf fix flagged by code review. */
export async function loadSearchIndex(userId: string): Promise<SearchIndex> {
  const chunks = await prisma.documentChunk.findMany({
    where: { userId },
    select: { documentId: true, content: true, vec: true, norm: true, tokens: true },
  });
  const docIds = Array.from(new Set(chunks.map((c) => c.documentId)));
  const docs = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, title: true, priorityScore: true, createdAt: true },
      })
    : [];
  return { chunks, docMap: new Map(docs.map((d) => [d.id, d])) };
}

/** Pure in-memory hybrid search over a pre-loaded index (no DB). */
export function searchIndex(
  index: SearchIndex,
  rawQuery: string,
  topK = 8,
): { query: string; rewritten: string; hits: SearchHit[]; scanned: number } {
  const rewritten = rewriteQuery(rawQuery);
  const q = embedLocal(rewritten);
  const qTokens = new Set(tokenize(rawQuery));
  const { chunks, docMap } = index;

  // Score every chunk; keep the best chunk per document.
  const best = new Map<string, { c: (typeof chunks)[number]; sim: number; rel: number }>();
  for (const c of chunks) {
    let dVec: SparseVec;
    try {
      dVec = JSON.parse(c.vec);
    } catch {
      continue;
    }
    const sim = cosine(q.vec, q.norm, dVec, c.norm);
    if (sim <= 0) continue;
    // hybrid lexical bonus: fraction of query tokens present in the chunk
    const lcContent = c.content.toLowerCase();
    let present = 0;
    for (const t of qTokens) if (lcContent.includes(t)) present++;
    const lexical = qTokens.size ? present / qTokens.size : 0;
    const rel = 0.75 * sim + 0.25 * lexical;
    const prev = best.get(c.documentId);
    if (!prev || rel > prev.rel) best.set(c.documentId, { c, sim, rel });
  }

  // Re-ranking layer: sort by hybrid relevance, take top-K.
  const ranked = Array.from(best.values())
    .sort((a, b) => b.rel - a.rel)
    .slice(0, topK);

  const hits: SearchHit[] = ranked.map(({ c, sim, rel }) => {
    const doc = docMap.get(c.documentId);
    const quality = Math.min(100, Math.round((c.tokens / 120) * 100));
    const fresh = doc ? freshnessScore(doc.createdAt) : 50;
    const sourceScore = Math.min(100, 50 + (doc?.priorityScore || 0));
    return {
      documentId: c.documentId,
      title: doc?.title || "—",
      snippet: c.content.slice(0, 220),
      similarity: Math.round(sim * 1000) / 1000,
      relevance: Math.round(rel * 1000) / 1000,
      confidence: Math.round(Math.min(1, rel) * 100),
      freshness: fresh,
      quality,
      sourceScore,
    };
  });

  return { query: rawQuery, rewritten, hits, scanned: chunks.length };
}

/** Convenience: load the index + run one query (single-query callers). */
export async function semanticSearch(
  userId: string,
  rawQuery: string,
  topK = 8,
): Promise<{ query: string; rewritten: string; hits: SearchHit[]; scanned: number }> {
  const index = await loadSearchIndex(userId);
  return searchIndex(index, rawQuery, topK);
}
