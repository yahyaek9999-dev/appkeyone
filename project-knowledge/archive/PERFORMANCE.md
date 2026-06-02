# Performance

## Layers (in execution order on the hot path)

For each customer message, the bot runs these layers **in this order** in
`app/api/whatsapp/incoming/route.ts`. Total budget ~1-4 seconds wall time
(dominated by the LLM call).

| # | Layer | Cost | Skips remaining layers? |
|---|---|---|---|
| 1 | Subscription gates | 1 DB read | yes (returns `blocked:...`) |
| 2 | Daily cap check | 1 DB write maybe | yes (returns `daily_cap_exhausted`) |
| 3 | Media decode (voice/image) | 1-3s external call | no |
| 4 | Customer upsert | 1 DB write | no |
| 5 | Trust accrual | 1 DB write (background) | no |
| 6 | Manual-takeover check | 0 ms (already loaded) | yes |
| 7 | Working-hours check | <1 ms | yes (sends OOO) |
| 8 | **Quick-reply exact match** | <1 ms | **yes (no LLM)** |
| 9 | **Quick-reply fuzzy** (cosine ≥0.62) | ~5-20 ms | **yes (no LLM)** |
| 10 | **LLM cache lookup** (sha256 of normalized question) | 1 DB read | **yes (no LLM)** |
| 11 | KB retrieval + memory load (parallel) | ~10-50 ms | no |
| 12 | Sales engine (gated) | <1 ms | no |
| 13 | **LLM call** | 1-3s | the expensive bit |
| 14 | Humanize + realism | <1 ms | no |
| 15 | Order extraction (background) | ~5-30 ms | no (fire-and-forget) |
| 16 | classifyAndScore + alert (background) | LLM-free, ~10ms | no (fire-and-forget) |
| 17 | Safety engine `assessAndShape` | ~10-30 ms | maybe (cooldown → null reply) |
| 18 | Response with delays | — | — |

## Cache layers (in priority order)

1. **Quick replies (exact)** — `bot.quickReplies` matched as substring. 0 LLM cost. Hit-rate ~5-15% in production.
2. **Quick replies (fuzzy)** — `lib/semantic-match.ts:fuzzyMatchQuickReplies()` with threshold 0.62. Catches typos and dialect variation. 0 LLM cost.
3. **LlmCache** — exact-text 24h cache per bot. `sha256(normalizeAr(question))` as key. Hit-rate strongly depends on bot/audience (~20-40% in retail merchant chats).
4. **KB cache** — in-memory per-user, 60s TTL. NOT a reply cache — caches the chunked KB so retrieval doesn't re-tokenize on every message.

## Concurrency

| Resource | Limit | Behavior over limit |
|---|---|---|
| LLM (keyone or any provider) | `LLM_MAX_CONCURRENT=3` | FIFO queue (`waiters[]` in `lib/llm.ts:50`) |
| WhatsApp sessions | `WA_MAX_SESSIONS=12` | LRU evict oldest idle session |
| KB cache entries | `KB_CACHE_MAX=256` | LRU evict oldest entry |
| SQLite writers | implicit (driver level) | serialized |

## Background jobs (`.catch(() => {})`)

These run in parallel with the reply and never block it:
- `onInbound` (trust accrual)
- `recordInboundReply` (safety event)
- `triggerMemoryUpdate` (memory engine extraction, every ~20 msgs)
- `notifyMerchant` / `notifyAdmin` (order/anger alerts)
- `extractAndStoreOrder` (order pipeline)
- `classifyAndScore` (intent/sentiment/score/anger-alert/follow-up scheduling)
- `recordKnowledgeGap` (gap detection)
- `persistNegotiationState` (sales engine deltas)

## Bottlenecks (in current production, ranked)

1. **LLM latency** (1-3s typical for keyone, 600-2000ms for openai gpt-4o-mini). Mitigations: cache, quick replies, semantic FAQ, fast-path coalescing.
2. **SQLite write contention** on `Bot.dailyMsgsUsed` increments + `MetricEvent` upserts. Today: fine. At 50+ concurrent merchants: monitor.
3. **Chromium per merchant** — RAM-bound at ~400 MB each. At 12 sessions = 4.8 GB. Budget on 8 GB VPS is tight.
4. **Prisma query plans** — `findFirst` without index can be slow. Most hot-path queries are indexed; see `DATABASE_SCHEMA.md`.

## What's already optimized

- `Promise.all` for memory + KB retrieval
- `buildMessages` aggressively trims history when summary exists
- KB retrieval is top-K not full-dump (since May 2026)
- Cache lookup BEFORE prompt assembly (Audit fix #6)
- Notifications fire-and-forget
- Order extraction sync but regex-only (no LLM)

## Things to NOT do

- **DO NOT** add `await` to background jobs in `incoming/route.ts`. They were designed fire-and-forget.
- **DO NOT** add a synchronous LLM call inside the safety engine.
- **DO NOT** raise `LLM_MAX_CONCURRENT` above 5 without testing — keyone's chrome can OOM.
- **DO NOT** add new DB writes on every message without batching. The `bump("...")` calls already cluster via the metrics upsert helper.

## Monitoring

- `/admin/metrics` — daily counts for `llm_call`, `llm_fail`, `cache_hit`, `semantic_hit`, `quick_reply_hit`, `realism_active`, etc.
- WA pool: `GET /sessions/stats` (returns idle/active counts).
- Provider latency: `ProviderUsage.totalLatencyMs / calls` per day.
