# Queue Map

> "Queue" here is informal — we have **no Redis / BullMQ / RabbitMQ**. Queues
> are emulated via:
> 1. **DB-backed work queues** (e.g. `BroadcastItem.status="pending"`)
> 2. **Scheduled DB columns** (e.g. `Customer.followUpAt`)
> 3. **In-memory semaphores** (e.g. LLM concurrency limit)

## Queue-like surfaces

### 1. Broadcast queue (`BroadcastItem`)

**Producer:** `POST /api/broadcasts` creates Broadcast + N items with `status="pending"`.

**Consumer:** `POST /api/cron/broadcasts` (every 60s).

**Claim mechanism:** atomic `updateMany({status:"pending"} → "sending")`.

**Failure handling:** stale `sending` rows are released to `pending` at the start of every tick.

**Backpressure:** none. The producer bulk-inserts up to `Customer.count` items per audience.

**Visibility:** `Broadcast.sent`, `failed`, `total`. Per-item status on `BroadcastItem`.

### 2. Follow-up queue (`Customer.followUpAt`)

**Producer:** `classifyAndScore` (background after incoming msg) schedules `followUpAt = now + bot.followUpHours` when the customer's intent is `buy` or `inquiry` and the message isn't `flagged`.

**Consumer:** `POST /api/cron/follow-ups` (every 30 min). Filters: `followUpAt <= now AND followUpSent = false`.

**Claim mechanism:** marks `followUpSent = true` after attempt (regardless of success). **No retry on failure.**

**Failure handling:** marks as sent even on failure to avoid duplicate spam. Failed sends visible in `mse-saas.err.log`.

**Visibility:** `Customer.followUpAt`, `followUpSent`.

### 3. Memory extraction queue (`CustomerMemory.pendingCount`)

**Producer:** every inbound user message increments `pendingCount` via `triggerMemoryUpdate`.

**Consumer:** the trigger itself fires an LLM extraction when `pendingCount >= MEMORY_EXTRACT_EVERY` (default 20).

**Claim mechanism:** in-process `Set<string>` (`inflight`) drops duplicate triggers for the same customer.

**Failure handling:** LLM timeout (25s) or invalid JSON → state stays. Next inbound msg retries.

**Visibility:** `CustomerMemory.pendingCount`, `messageCount`.

### 4. LLM call queue (semaphore in `lib/llm.ts`)

**Producer:** any caller of `chat()` (hot path, broadcasts, follow-ups, suggest-reply).

**Consumer:** `acquire()` / `release()` semaphore of `LLM_MAX_CONCURRENT` (default 3).

**Claim mechanism:** in-process FIFO via `waiters[]`.

**Failure handling:** if active count drops without release (caller crash), the semaphore leaks. **Process restart is the only fix today.** Acceptable because the slot eventually frees on restart and 3 leaked slots over a Node lifetime is negligible.

**Visibility:** none. **Suggested:** expose `{active, queued}` on an internal `/api/admin/health` endpoint.

### 5. WhatsApp session pool (`whatsapp-service/src/sessions.js`)

**Producer:** `POST /sessions/:userId/start` (from SaaS, on demand).

**Consumer:** internal LRU eviction every 5 min. Cap: `WA_MAX_SESSIONS` (default 12).

**Claim:** in-process `Map<userId, session>`.

**Failure:** evicted session retains LocalAuth on disk; reconnects on next `/start` without a fresh QR.

**Visibility:** `GET /sessions/stats`.

### 6. Safety events (`SafetyEvent`)

**Producer:** every send/failure/cooldown/kill writes a row.

**Consumer:** `aggregateRecent` reads rows from last 24h on every reply.

**Purging:** the engine purges rows older than 24h on every write (`store.ts`).

**Failure:** if purge fails, table grows. Marked uncertain — verify a periodic vacuum if hitting 100k rows.

### 7. Metric events (`MetricEvent`)

**Producer:** `bump(kind, userId)` everywhere.

**Consumer:** `/admin/metrics` reads daily aggregates.

**Claim:** upsert with `count: { increment: 1 }` — atomic.

**Purging:** none. Days accumulate. **Suggested:** monthly cleanup of rows older than 90 days.

## What we DON'T have (and when we'd need it)

- **Persistent job queue (Redis/BullMQ)** — useful if:
  - Cron tasks become unreliable
  - We want retry-with-backoff per job
  - We want job priority (e.g. anger alerts > daily reports)
  - We scale to >1 mse-saas instance (in-memory semaphores won't coordinate)

- **Pub/Sub** — would help with real-time inbox updates (today UI polls). Adding Server-Sent Events or WebSockets is the minimal step before adopting full pub/sub.

- **Dead-letter queue (DLQ)** — broadcasts with all items `failed` just sit there. A real DLQ would alert and offer retry / abandon.

## Concurrency gotchas

1. **`Bot.dailyMsgsUsed` increments are atomic** (`{increment: 1}`) — safe under concurrency.
2. **`Subscription.msgsUsed` likewise.**
3. **Broadcast atomic claim** — already covered.
4. **Customer upsert in hot path** — atomic at SQL level via Prisma's unique constraint.
5. **`SafetyState.riskScore` writes** are last-write-wins. Acceptable because the engine reads + writes within ~30 ms; race window is tiny.

## Future: when to introduce a real queue

Triggers:
- Cron task lateness (a tick takes > 60s consistently)
- Need to retry failed broadcasts with backoff
- Multi-instance SaaS deployment
- More than 20 different kinds of background jobs

Recommended stack:
- **Redis + BullMQ** (Node-native, well-supported)
- **Or:** pg-boss if we migrate to Postgres anyway
