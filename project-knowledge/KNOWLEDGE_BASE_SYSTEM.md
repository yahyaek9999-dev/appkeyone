# Knowledge Base System

> Code: `saas/lib/kb-cache.ts` (218 lines).
> DB: `Document` (per-user uploaded content).
> Callers: `app/api/whatsapp/incoming/route.ts:324` (`retrieveRelevantKb`), `app/api/chat/route.ts` (`loadKnowledgeBaseCached`).

## Two retrieval modes

### `loadKnowledgeBaseCached(userId)` — full KB (legacy)
Returns the entire concatenated KB. Used by `/api/chat` playground and the
onboarding preview where the customer's message isn't known yet.

### `retrieveRelevantKb(userId, question, opts)` — top-K (default for prod)
Returns only the chunks most relevant to `question`. **This is what runs on the
hot path** since the May 2026 fix. Stuffing 12 KB of merchant documents into
every system prompt drowns the LLM in noise and increases token cost.

## Chunking

`chunkDocument(title, content)` splits each `Document.content` into
paragraph-first chunks (`CHUNK_TARGET=600` chars). Long paragraphs are
further split on sentences (`.!?؟。`). Tiny fragments (<80 chars) are
merged into the previous chunk.

Each chunk carries:
```ts
interface Chunk {
  text: string;
  docTitle: string;
  tfv: Map<string, number>;   // precomputed TF vector
  tokens: string[];           // precomputed token list
}
```

## Scoring

```ts
score = 0.7 * cosine(qVec, chunk.tfv) + 0.3 * jaccard(qTokens, chunk.tokens)
```

- **Cosine** rewards rare-word overlap (good for distinguishing products).
- **Jaccard** rewards generic overlap (good for short queries).
- Weights `(0.7, 0.3)` chosen empirically; haven't been tuned recently.

Functions live in `lib/semantic-match.ts`:
- `tokenize(text)` — Arabic+English normalizer + word split
- `tfVector(tokens)` — `Map<token, count>`
- `cosine(a, b)`, `jaccard(a, b)` — pure JS

**No embeddings. No vector DB. Pure rule-based scoring.**

## Fallback behavior

`retrieveRelevantKb` falls back to **head-of-KB** (`kb.slice(0, charBudget)`)
when:
- The question has fewer than 2 tokens (e.g. "اهلا") — low signal, don't bias
- The merchant has fewer than 3 chunks total — retrieval has no value
- The top chunk's score is below `minScore` (default 0.05) — model still
  needs SOME grounding instead of empty context

## Budget

The hot path calls:
```ts
retrieveRelevantKb(userId, messageText, { k: 4, charBudget: 3500 })
```
- `k=4` chunks max
- 3500 char total injection budget
- Stops adding chunks once cumulative size exceeds budget (after at least one chunk)

## Cache

Per-user cache with 60-second TTL (`KB_CACHE_TTL_MS` env). LRU-evicted at
`KB_CACHE_MAX_ENTRIES` (default 256 — one slot per active merchant).

**Cache key:** just `userId`. Both `loadKnowledgeBaseCached` and
`retrieveRelevantKb` share the same cache entry (built once, both consumers
read from it).

**Invalidation:** `invalidateKnowledgeCache(userId)` is called from the
knowledge upload endpoints (`/api/knowledge/...`).

## Performance characteristics

- **First call per merchant (cold cache):** DB read + chunk + tokenize. For 20 docs avg → ~30-80 ms.
- **Subsequent calls (hot cache):** scoring only → ~5-15 ms for 100 chunks.
- The hot path runs `retrieveRelevantKb` in parallel with `loadMemory` (`Promise.all`) so this is overlapped with the memory lookup.

## How to add a feature without breaking retrieval

- **DO NOT** lower `minScore` below 0.05 — too noisy.
- **DO NOT** raise `k` above 8 — that's the hard clamp in the function.
- **DO NOT** increase `charBudget` above ~5000 — you'll drown the LLM context.
- **DO NOT** add an embedding call without first migrating to a vector store. The current architecture is sync + zero-dep on purpose.
- If you add a new doc source (e.g. image OCR), it just needs to land as a `Document` row. The chunker handles arbitrary text.

## Known gaps

- **No reranking.** The top-K may include marginal chunks if there's a tie. Acceptable today.
- **No multilingual normalization beyond Arabic.** English/Arabic mixed queries work because both pass through `tokenize`. Other languages may underperform.
- **No semantic similarity beyond TF-IDF.** Real RAG with embeddings would beat this — but at ~$0.0001/embedding and 50 merchants × 100 docs, that's manageable if we want to upgrade.
