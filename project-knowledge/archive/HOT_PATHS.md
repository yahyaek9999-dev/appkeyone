# Hot Paths

> Files that run on **every customer message** or **every broadcast send**.
> Mistakes here cause user-visible regressions, ban-risk, or merchant outages.

## ⚡ The hottest path: `app/api/whatsapp/incoming/route.ts`

**874 lines, single exported `POST` handler.** Runs on every inbound customer message.

### Why it's hot
- Called from `whatsapp-service` for every text/voice/image the customer sends
- Wall-time budget: 1-4 seconds (longer = customer sees "typing…" too long)
- If this crashes, the customer message is lost / the bot looks broken
- Touches: SaaS DB (Prisma), LLM, memory engine, sales engine, safety engine, KB cache, order extractor

### Concurrency-sensitive sections
- `prisma.customer.upsert` (line 138-142) — race with another concurrent message
- `prisma.subscription.update` increment (line 258-260, 453-455) — atomic via Prisma but still write contention
- `prisma.bot.update` daily counter (line 459-461) — same
- LLM call (line 396) — semaphore-bound (`LLM_MAX_CONCURRENT`)

### Never put on this path
- Synchronous external HTTP calls (other than the LLM, which is already concurrency-bounded)
- Synchronous DB writes that cross merchant boundary
- `console.log` inside loops (logs explode)
- Heavy regex on long strings (the `normalizeAr` + tokenizers are already O(n))

---

## ⚡ Broadcast worker: `app/api/cron/broadcasts/route.ts`

**Runs every 60 seconds.** Sends up to 20 WhatsApp messages per tick.

### Why it's hot
- Duplicates here = customer gets the same broadcast twice. Eroded trust.
- 2.5s delay × 20 sends = 50s — **overlap with next tick is guaranteed**
- Touches: DB (BroadcastItem claim), LLM (personalize), WA gateway

### Critical invariant
```ts
const claim = await prisma.broadcastItem.updateMany({
  where: { id: it.id, status: "pending" },
  data:  { status: "sending" },
});
if (claim.count === 0) continue;  // **DO NOT REMOVE**
```

### Never on this path
- Send-without-claim (the May 2026 fix specifically prevents this)
- Bumping `Broadcast.sent` outside the per-item update (use `increment`)
- LLM personalize without try/catch + audit on failure

---

## ⚡ Safety engine: `lib/safety/engine.ts:assessAndShape()`

**Runs on every outbound reply.** Persists state to `SafetyState`/`SafetyEvent`.

### Why it's hot
- 6 sub-steps (warmup, aggregate, patterns, risk, humanize, kill check) per call
- Writes 1 row to `SafetyEvent` per send
- Touches `SafetyState` (UPDATE)

### Never on this path
- LLM calls (engine is pure logic by design)
- Long-running DB queries — `aggregateRecent` already has indexes (`SafetyEvent.userId+kind+createdAt`)

---

## ⚡ Provider router: `lib/providers/provider-router.ts:routeProviderChat()`

**Runs on every LLM call when merchant uses a non-keyone provider.**

### Why it's hot
- Single external HTTPS call to the provider's `/chat/completions`
- Retry × 3 with exponential backoff — failures can compound to 5s+ added latency

### Never on this path
- Synchronous file IO
- Logging the request body (PII)
- Retrying on 4xx (terminal — would burn quota for no benefit)

---

## 🟡 Warm paths (called frequently but not on every msg)

| Path | Frequency | Notes |
|---|---|---|
| `lib/memory.ts:triggerMemoryUpdate` | every msg, but LLM extract every ~20 msgs | Fire-and-forget |
| `extractAndStoreOrder` (in incoming/route.ts) | every msg, persists only if confident | Pure regex |
| `classifyAndScore` (in incoming/route.ts) | every msg, background | DB-only |
| `notifyMerchant` / `notifyAdmin` | conditional | Background |
| `lib/safety/trust.ts:onInbound` | every inbound | Background |
| `app/api/cron/follow-ups/route.ts` | every 30 min | Bulk processing |
| `app/api/cron/daily-report/route.ts` | every hour | Bulk processing, filters by `dailyReportHour` |

---

## 🟢 Cold paths (per merchant action, not per message)

- All `/api/auth/*`, `/api/onboarding/*`, `/api/settings/*`
- Knowledge upload (`/api/knowledge/*`) — invalidates KB cache
- Broadcast creation (`/api/broadcasts/create`)
- Admin pages (`/admin/*`)
- Dashboard reads (`/dashboard/*`)

---

## CPU-heavy operations

Listed here so future code reviews can flag accidentally re-running them in hot paths:

1. **`normalizeAr(text)`** — Arabic normalization. O(n). Cached per call in some places.
2. **`tokenize(text)` + `tfVector(tokens)`** — for KB chunks, **precomputed once at chunk-build time** and stored on the `Chunk` object. NEVER recompute per-message.
3. **`cosine(a, b)` + `jaccard(a, b)`** — O(unique tokens). Cheap, but called K times during KB retrieval.
4. **`sha256(normalized)`** — for `LlmCache` key. ~1 ms.
5. **PDF/DOCX parse** — `pdf-parse` / `mammoth` are heavy. Only run on knowledge upload, NEVER on messages.
6. **AES-256-GCM encrypt** — only on provider key save. Decrypt happens per LLM call but is fast.

---

## Lock-free atomic operations to NOT break

| Operation | Code | Why atomic matters |
|---|---|---|
| `BroadcastItem.updateMany({status:"pending"} → "sending")` | `cron/broadcasts/route.ts:104` | Prevents duplicate sends |
| `prisma.subscription.update({msgsUsed: {increment:1}})` | `incoming/route.ts:258` | Quota accounting |
| `prisma.bot.update({dailyMsgsUsed: {increment:1}})` | `incoming/route.ts:459` | Daily cap |
| `prisma.metricEvent.upsert(... {count: {increment:1}})` | `lib/metrics.ts:bump` | Observability counters |
| `prisma.quickReply.update({hits: {increment:1}})` | `incoming/route.ts:253` | QR analytics |

---

## Latency budget per phase (typical)

```
Customer sends msg
  ↓
[wa-service]            ~50 ms  protocol decode + forward
  ↓
[POST /api/whatsapp/incoming]
  Auth + body parse     <1 ms
  Tenant load           ~20 ms
  Gates                 <1 ms
  Media decode          0 / 200-2000 ms
  Customer upsert       ~10 ms
  Trust + safetyEvent   <1 ms (background)
  Conv + message write  ~15 ms
  Working hours check   <1 ms
  Quick reply match     <1 ms
  Fuzzy match           ~10 ms
  Cache lookup          ~10 ms
  KB + memory load      ~30 ms (parallel)
  Sales engine          <1 ms
  buildMessages         ~5 ms
  LLM call              1000-3000 ms ⬅️ dominant
  humanize+realism      <1 ms
  persist reply         ~10 ms
  safety assess         ~20 ms
  TOTAL                ~1100-3100 ms
```

Cache/quick-reply hits skip the LLM and bring TOTAL down to ~100 ms.
