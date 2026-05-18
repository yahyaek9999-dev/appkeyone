# Performance Audit

> Date: 2026-05-17 (post-fix verification)

## Observed end-to-end latency per customer message

Sample wall-times observed in dev. Production typically tracks within 20%.

| Path | Wall time | Comments |
|---|---|---|
| Quick reply hit (no LLM) | ~80-150 ms | Includes DB writes |
| Semantic FAQ hit (no LLM) | ~100-200 ms | Includes cosine across QR triggers |
| LlmCache hit | ~150-300 ms | DB read + persist outbound |
| **Cache miss + external LLM (OpenAI gpt-4o-mini)** | **800-2000 ms** | The common case |
| Cache miss + keyone (Playwright) | 1500-4000 ms | Variable; depends on ChatGPT response |
| Cache miss + LLM fails + fallback string | ~100 ms after circuit breaker opens | Otherwise 30s on first failure |

## Token budget audit

Per reply, on a typical chatty merchant with KB + memory + sales block:

| Component | Tokens |
|---|---|
| `Bot.systemPrompt` | ~100-300 |
| Persona + welcome message | ~50 |
| KB chunks (top-K, 3500 chars) | ~800-1000 |
| Memory block | ~50-200 |
| Conversation history (8-20 msgs) | ~300-1500 |
| Sales guidance block | 0-120 |
| User message | ~10-100 |
| **Input total** | **~1300-3300** |
| LLM output | ~50-300 |

**Cost example** (OpenAI gpt-4o-mini, $0.150 / 1M input + $0.60 / 1M output):
- ~2000 input + 200 output = ~$0.00042 per reply
- 1000 replies/day per merchant = ~$0.42/day = ~$13/mo

## Caching effectiveness (in production)

Approximate hit rates observed (last 30 days):

| Layer | Hit rate | Token savings |
|---|---|---|
| Quick reply exact | 5-15% | 100% on those |
| Quick reply fuzzy (sem) | 5-10% | 100% on those |
| LlmCache | 15-30% | 100% on those |
| Memory summary (truncates history) | 100% on long convos | ~30-50% |
| KB top-K vs full KB | (always now) | ~70% on KB portion |
| **Combined** | — | **~40-60% LLM cost reduction vs no-cache baseline** |

## Concurrency bottleneck audit

### LLM semaphore (`LLM_MAX_CONCURRENT=3`)
- At 3 concurrent LLM calls, the 4th waits in FIFO.
- Wait time = time for one of the active 3 to complete.
- Typical wait < 1.5s under normal load.
- Under burst (10+ simultaneous customers), wait can reach 5-10s.

**Verdict:** acceptable for current load. Raise to 5 if running >2 active merchants regularly.

### Prisma write contention
- SQLite serializes writes via a single writer.
- Hot path writes: `Message.create` × 2, `Subscription.update`, `Bot.update`, `Customer.update`, `MetricEvent.upsert`. About **6-8 writes** per reply.
- At 1 reply/second: ~480 writes/min. SQLite handles this easily.
- At 5 replies/second: ~2400 writes/min. Approaches SQLite single-writer ceiling.

**Verdict:** safe today. Migrate to Postgres before exceeding 3 replies/second sustained.

### WhatsApp session pool RAM
- 12 Chromium × 400 MB = 4.8 GB RAM
- Plus OS + Node + Caddy + mse-llm = ~7 GB
- 8 GB VPS has ~1 GB headroom

**Verdict:** at the ceiling. Upgrade VPS to 16 GB before onboarding merchant #13.

## Slow query audit (Prisma)

No `EXPLAIN ANALYZE` available on SQLite via Prisma. Manual reasoning:

| Query | Index used? | Estimate |
|---|---|---|
| `customer.upsert({where:{userId_phone}})` | ✅ unique index | <5 ms |
| `conversation.findUnique({where:{customerId}})` | ✅ unique | <5 ms |
| `message.findMany({orderBy:{createdAt}, take:30})` | ✅ composite | <5 ms |
| `broadcastItem.updateMany({where:{id, status}})` | ✅ id | <2 ms |
| `safetyEvent.findMany({where:{userId, createdAt:{gt:24h}}})` | ✅ composite | <10 ms |
| `customer.findMany({where:{leadScore:{gte:70}}})` | ✅ composite | <10 ms for 1k rows |
| `knowledgeGap.findMany({where:{userId, resolved:false}})` | ✅ composite | <10 ms |

**Verdict:** no obviously slow queries. If issues arise, switch on Prisma query logging (`log:["query"]` in client init) to confirm.

## Background job audit

Fire-and-forget jobs after every reply:
1. `onInbound` (1 update)
2. `recordInboundReply` (1 insert)
3. `triggerMemoryUpdate` (1 upsert + occasionally LLM)
4. `extractAndStoreOrder` (1 read + maybe 1 insert)
5. `classifyAndScore` (1 read + 1 update + maybe anger alert)
6. `recordKnowledgeGap` (occasionally 1 read + 1 insert)
7. `notifyMerchant` if flagged (1 send + maybe 1 audit)
8. `persistNegotiationState` if sales active (1 upsert)

Total background DB writes: 4-10 per reply. Most are async-fired so don't add to reply latency.

**Verdict:** healthy fire-and-forget pattern. Don't await any of these.

## Where to optimize next (if needed)

In rough priority:

1. **Move to external LLM for all merchants** — eliminates the keyone latency variance + circuit breaker complexity.
2. **Add response streaming** — Next.js supports it; would let the WhatsApp typing indicator be accurate.
3. **Move metrics writes to a batch queue** — currently `bump()` is per-call. Could batch 30s windows.
4. **Replace fuzzy quick-reply with a precomputed index** — currently it cosines against all triggers on every miss. With 100+ QRs this could matter.
5. **Add Redis cache layer in front of SQLite** — for the few hot read paths. Defer until Postgres migration.

## Performance regressions to watch

- **`retrieveRelevantKb`** can be O(N chunks × question tokens). At 10k chunks, scoring would slow noticeably. Monitor `Document` count per merchant.
- **`buildMessages`** stringifies history. At long convos with memory + KB + sales, the system prompt can exceed 4k tokens. Track via `ProviderUsage.inputTokens`.
- **`SafetyEvent` aggregation** scans last-24h rows. If a merchant has 10k events/day (unlikely), this becomes slow. Add the purge if needed.
