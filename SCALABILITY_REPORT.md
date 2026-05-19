# KEYONE Production Scalability Report

**Generated:** May 19, 2026
**Scope:** Current production architecture ONLY — no future plans assumed
**Environment:** Windows VPS (8 GB RAM), single-server deployment

---

## 1. Executive Scores

| Metric | Score | Notes |
|---|---|---|
| **Production Readiness** | **7.2 / 10** | Stable for small-scale SaaS; safety engine is mature; SQLite is the ceiling |
| **Stability** | **7.5 / 10** | Fail-open safety, graceful shutdown, Sentry instrumentation, session auto-restore |
| **Scalability** | **4.0 / 10** | Hard-limited by SQLite single-writer lock, Chromium RAM per session, single-server SSE |

---

## 2. Architecture Summary (Current Production)

| Component | Technology | Status |
|---|---|---|
| Web Framework | Next.js (standalone, Node.js runtime) | **Active** |
| Database | **SQLite** via Prisma (`file:./prisma/dev.db`) | **Active — single writer** |
| Cache / KV | Upstash Redis (REST HTTP client) | **Active** |
| Queue System | BullMQ code exists, **gated behind `ENABLE_BULLMQ=1`** | **Disabled in production** |
| Broadcast Processing | Cron route (`/api/cron/broadcasts`) — 1-minute scheduled task | **Active** |
| WhatsApp Runtime | whatsapp-web.js (Puppeteer/Chromium, `LocalAuth`) | **Active** |
| Realtime Dashboard | SSE stream (`/api/realtime/stream`), 5s tick, max 10 min | **Active** |
| Safety Engine | Persistent V2 (SafetyState + SafetyEvent tables, warmup, kill-switch) | **Active** |
| Rate Limiting | In-memory token bucket (per-process `Map`) | **Active** |
| Monitoring | Sentry (client + server + edge configs, source maps, tunnel route) | **Active** |
| OS / Hosting | Windows VPS, 8 GB RAM, NSSM service management | **Active** |

---

## 3. Realistic Capacity Estimates

### 3.1 WhatsApp Sessions (Chromium Instances)

Each `whatsapp-web.js` session spawns a headless Chromium process consuming **~380–450 MB RAM**.

On an 8 GB VPS, after OS + Node.js (Next.js ~300 MB) + whatsapp-service + Caddy/CloakBrowser:
- **Available RAM for Chromium:** ~5 GB
- **Hard cap in code:** `WA_MAX_SESSIONS = 12` (default; env-overridable)
- **Idle eviction:** Sessions idle > 6 hours are auto-closed (auth kept on disk)

| Tier | Concurrent Sessions | Rationale |
|---|---|---|
| **Safe** | **5–6** | Comfortable headroom, no swap pressure |
| **Moderate** | **8–10** | Occasional swap possible under burst |
| **Aggressive** | **12** | Matches hard cap; risks OOM if all sessions are active + broadcast + SSE |

### 3.2 Businesses (Tenants)

A "business" = 1 User row + 1 Bot + 1 WhatsApp session. Not all businesses are concurrently active.

| Tier | Total Businesses | Concurrently Active | Rationale |
|---|---|---|---|
| **Safe** | **15–20** | 5–6 | Most businesses idle at any given time; idle-evict reclaims RAM |
| **Moderate** | **25–35** | 8–10 | Requires healthy idle rotation; some businesses only active during business hours |
| **Aggressive** | **50** | 12 max | Only viable if most tenants are dormant; LRU eviction handles overflow |

**Key constraint:** The number of *registered* businesses can exceed 50 because not all need a live Chromium process simultaneously. The bottleneck is *concurrent active sessions*, not total accounts.

### 3.3 Active Chats Per Day

Each incoming WhatsApp message triggers:
1. Prisma read (user + bot + subscription + quickReplies)
2. Customer upsert
3. Conversation + message write
4. LLM API call (~1–5s)
5. Safety engine assessment (2–4 DB reads + 1–2 writes)
6. Response write

**SQLite bottleneck:** Single-writer lock means all writes across all tenants serialize. Each incoming message cycle involves ~4–8 write operations.

| Tier | Chats/Day (all tenants combined) | Rationale |
|---|---|---|
| **Safe** | **300–500** | ~1 msg every 3–5 seconds avg; SQLite handles comfortably |
| **Moderate** | **800–1,200** | ~1 msg/sec avg; occasional WAL contention under burst |
| **Aggressive** | **2,000** | Requires spread load; concurrent burst of 5+ msg/sec will cause `SQLITE_BUSY` |

### 3.4 Concurrent Dashboard Users (SSE)

Each SSE connection runs `buildSnapshot()` every 5 seconds, executing **9+ Prisma queries** per tick (counts, findFirst, aggregates).

| Tier | Concurrent SSE Streams | Rationale |
|---|---|---|
| **Safe** | **5–8** | ~40–64 queries/5s on SQLite — tolerable |
| **Moderate** | **10–15** | ~80–120 queries/5s — read contention with writes |
| **Aggressive** | **20** | SQLite read throughput degrades; API latency spikes |

### 3.5 Broadcasts Per Day

Current cron-based system: 1 tick/minute, batch of 20 items, 2.5s delay per send.
- **Throughput:** ~8 messages/minute = ~480 messages/hour (theoretical max)
- **Practical:** Anti-ban safety limits to 12/min burst, 80/10min, 600/day soft cap per bot

| Tier | Broadcasts/Day | Recipients/Broadcast | Rationale |
|---|---|---|---|
| **Safe** | **2–3** | 50–100 each | Fits within daily soft cap (600); minimal SQLite write pressure |
| **Moderate** | **5–8** | 100–200 each | Multiple tenants broadcasting; may queue for hours |
| **Aggressive** | **10+** | 200+ each | Cron-only processing becomes a severe bottleneck; broadcasts back up |

### 3.6 Summary Table

| Metric | Safe | Moderate | Aggressive |
|---|---|---|---|
| **Total Businesses** | 15–20 | 25–35 | 50 |
| **Concurrent WA Sessions** | 5–6 | 8–10 | 12 |
| **Active Chats/Day** | 300–500 | 800–1,200 | 2,000 |
| **Concurrent Dashboard Users** | 5–8 | 10–15 | 20 |
| **Broadcasts/Day** | 2–3 | 5–8 | 10+ |
| **Broadcast Recipients/Day** | 200–400 | 800–1,500 | 3,000+ |

---

## 4. Bottleneck Analysis

### 4.1 What Breaks First

1. **SQLite single-writer lock** — This is the #1 bottleneck. Every write from every tenant (messages, safety events, metric upserts, broadcast item updates, order extraction) contends on a single file-level lock. Under concurrent load from multiple active WhatsApp sessions + SSE dashboard queries + broadcast processing, you will see:
   - `SQLITE_BUSY` errors
   - Increased P95 latency on the `/api/whatsapp/incoming` hot path
   - Dashboard SSE snapshots timing out or returning stale data
   - **Estimated breaking point:** 3–5 concurrent write-heavy operations/second sustained

2. **Chromium RAM exhaustion** — Each new active WhatsApp session adds ~400 MB. Beyond 10–12 concurrent sessions, the VPS enters swap territory, degrading everything: Node.js GC pauses, Chromium tab crashes, SSE tick delays.

### 4.2 What Slows First

1. **SSE `buildSnapshot()` under write contention** — 9+ queries every 5 seconds per connected dashboard. When SQLite is busy with writes, these reads queue behind the write lock (WAL mode helps but doesn't eliminate it). Dashboard will feel "laggy" before anything actually breaks.

2. **Broadcast cron throughput** — At 8 msgs/min with a 1-minute cron interval, a 500-recipient broadcast takes ~62 minutes. Multiple tenants broadcasting simultaneously share this single cron pipeline. There is no parallelism.

3. **LLM API latency amplified by safety engine** — Each incoming message triggers the LLM call (~1–5s) PLUS safety engine DB reads/writes. The safety engine's `aggregateRecent()` queries SafetyEvent rows with time-range filters on SQLite — these get slower as the table grows.

### 4.3 What Is Already Stable

- **Safety Engine V2** — Well-architected. Persistent state (SafetyState), rolling-window events (SafetyEvent), warmup stages, kill-switch, fail-open design. This is production-grade and protects against WhatsApp bans effectively.
- **Anti-ban layer** — Dual-layer (in-memory `anti-ban.ts` + persistent `safety/engine.ts`). Circadian modulation, burst detection, repetition detection, contact trust scoring, cooldown softening for inbound replies. Mature and well-tuned.
- **Session management** — LRU eviction, idle sweep, auth persistence on disk, auto-restore on boot. Handles the Chromium RAM constraint gracefully.
- **Rate limiting** — In-memory token bucket with GC. Fast, zero external dependency. Adequate for single-process.
- **Sentry integration** — Full coverage: client, server, edge configs. Source map upload, tunnel route for ad-blocker bypass, `autoInstrumentServerFunctions`. Good observability.
- **Graceful degradation** — Redis client returns no-op stubs in dev. BullMQ gated behind feature flag. Safety engine falls back to "low risk" on DB errors.

### 4.4 What Is Risky

| Risk | Severity | Detail |
|---|---|---|
| **SQLite data loss on crash** | **High** | Single `.db` file. No replication. A corrupt write or disk failure loses all business data. WAL mode helps integrity but doesn't replace backups. |
| **Single server = single point of failure** | **High** | VPS goes down → everything goes down. No failover, no load balancer, no health-check restart from outside. |
| **In-memory rate limiter resets on restart** | **Medium** | Rate limit state is in a `Map`. Server restart (deploy, crash, NSSM restart) clears all buckets — brief window of no rate limiting. |
| **No DB connection pooling** | **Medium** | Prisma's SQLite driver has no pool. Under concurrent load, Prisma serializes internally but provides no backpressure — callers block or timeout. |
| **SSE connection leak potential** | **Medium** | Each SSE stream holds a `setInterval`. If the client disconnects without firing `abort`, the interval runs until `MAX_TICKS` (10 min). Under many disconnects, orphaned intervals stack up. |
| **Broadcast cron overlap** | **Medium** | If a cron tick takes >60s (large batch + slow LLM personalization), the next tick fires while the first is still running. The atomic-claim `updateMany` prevents duplicates but wastes DB round-trips. |
| **Windows VPS limitations** | **Medium** | Puppeteer on Windows has known stability issues vs Linux. `--no-sandbox` flag required. File descriptor limits differ. NSSM is reliable but less standard than systemd. |

---

## 5. Detailed Component Analysis

### 5.1 Frontend Realtime Performance

- **SSE with 5s tick** — Reasonable cadence. Client (`use-realtime.ts`) auto-falls back to 30s polling if SSE fails. Good resilience.
- **`buildSnapshot()` cost** — 9 parallel Prisma queries + 2 sequential follow-ups per tick. On SQLite, "parallel" `Promise.all` queries actually serialize at the driver level. **Real cost: ~9 sequential DB queries every 5 seconds per user.**
- **Scaling ceiling:** Beyond ~15 concurrent dashboard users, the SSE tick queries dominate SQLite read bandwidth and start interfering with write operations.

### 5.2 Backend Concurrency

- **Single Node.js process** — Next.js standalone mode. No clustering. One event loop handles all API routes, SSE streams, and cron endpoints.
- **CPU-bound work:** Minimal — most compute is offloaded to LLM API and Chromium. Node.js event loop stays responsive as long as SQLite isn't blocking.
- **Memory:** Next.js process ~300 MB + per-request allocations. No significant memory leaks observed in code review.

### 5.3 SQLite Limitations (Critical)

| Concern | Impact |
|---|---|
| **Single-writer** | All tenants' writes serialize. Message saves, safety event logs, metric upserts, broadcast item updates — all compete for one lock. |
| **No concurrent reads during write** | In WAL mode, reads can proceed during writes, but long-running writes still block other writes. |
| **File size growth** | 25+ models, many with `@@index`. As data grows (messages, safety events, metrics), query planning degrades without `ANALYZE`. |
| **No `busy_timeout` configured** | Prisma SQLite driver does not expose `busy_timeout` by default. Under contention, writes fail immediately with `SQLITE_BUSY` instead of retrying. |
| **Schema: 753 lines, 25+ models** — This is a lot of relational complexity for SQLite. Joins across Customer → Conversation → Message → Order with aggregates are expensive without a query planner as sophisticated as Postgres. |

### 5.4 Redis Runtime Impact

- **Upstash REST client** — HTTP-based, not persistent TCP. Each Redis operation is an HTTPS round-trip (~10–50ms depending on region). Not suitable for sub-millisecond caching.
- **Current usage:** Cache keys for bot config, customer lookups, KB docs, analytics, rate-limit counters, site config. **All gracefully degrade** — Redis failure doesn't crash the app.
- **BullMQ (gated):** ioredis TCP connection is configured but `ENABLE_BULLMQ !== "1"` means it never connects. Broadcasts run via cron, not queues.

### 5.5 WhatsApp Session Scaling

- **whatsapp-web.js + Puppeteer** — Each session = 1 Chromium process. This is the heaviest resource consumer on the VPS.
- **Memory per session:** 380–450 MB (measured in code comments and audit reports)
- **Hard cap:** `WA_MAX_SESSIONS = 12` (8 GB VPS calibration)
- **Idle eviction:** 6 hours default. Frees RAM but requires ~15s reconnect on next message.
- **Auto-resume on send:** If a session was idle-evicted and a broadcast/send targets it, the code auto-restarts and waits up to 15s for reconnect.
- **Restore on boot:** All `session-*` folders are re-initialized on service start. If 12 sessions exist on disk, all 12 Chromium instances launch simultaneously — **potential OOM spike at boot**.

### 5.6 Broadcast Limitations

| Aspect | Current State |
|---|---|
| **Processing model** | Cron route, called every 60s by Windows Scheduled Task |
| **Batch size** | 20 items per tick |
| **Send delay** | 2.5s between messages |
| **Throughput** | ~8 msgs/min → ~480 msgs/hour (theoretical) |
| **Concurrency** | **None** — one broadcast at a time (oldest first) |
| **Multi-tenant** | All tenants share one cron pipeline; no priority queue |
| **Personalization** | Optional LLM call per recipient — adds ~1–5s per message if enabled |
| **With personalization** | ~3–4 msgs/min → ~200 msgs/hour |
| **Stale claim recovery** | Self-healing: items stuck in `sending` for >5 min reset to `pending` |
| **Cancel support** | Mid-run cancellation checked between every item send |

**Practical example:** A 500-recipient broadcast with personalization takes ~2–4 hours. During that time, no other tenant's broadcast can run.

### 5.7 SSE Realtime Scalability

- **One stream per dashboard page** — Good design; not one per widget.
- **`MAX_TICKS = 120`** — 10-minute max lifespan; EventSource auto-reconnects.
- **No pub/sub** — Each stream polls the DB independently. 10 users = 10× the queries. There's no shared snapshot cache or Redis pub/sub fan-out.
- **Scaling fix needed:** A shared snapshot cache (compute once per user per 5s, serve to all their connections) would dramatically reduce DB load.

### 5.8 Memory/CPU Pressure

| Process | Estimated RAM | Notes |
|---|---|---|
| Windows OS | ~1.5 GB | Base Windows Server |
| Node.js (Next.js) | ~300–500 MB | Grows with request load |
| Node.js (whatsapp-service) | ~100 MB | Plus Chromium sessions |
| Chromium × N sessions | N × 400 MB | Dominant consumer |
| Caddy / CloakBrowser | ~50–100 MB | Reverse proxy |
| **Total at 6 sessions** | **~4.5–5.5 GB** | Comfortable |
| **Total at 10 sessions** | **~6.5–7.5 GB** | Tight, possible swap |
| **Total at 12 sessions** | **~7.5–8.5 GB** | Exceeds physical RAM |

**CPU:** Not typically a bottleneck. Node.js event loop handles I/O-bound work well. Chromium is the biggest CPU consumer during page load / QR generation, but idles afterward.

### 5.9 VPS Limitations

- **8 GB RAM** — Hard ceiling for all processes. No vertical scaling without VPS upgrade.
- **Windows** — Puppeteer is less stable on Windows than Linux. `--no-sandbox` is required (already configured). Signal handling differs (NSSM translates).
- **Disk I/O** — SQLite performance depends heavily on disk speed. If the VPS uses spinning disk, write contention is worse. SSD is strongly recommended.
- **No auto-scaling** — Single fixed server. No horizontal scaling possible without architecture changes.

### 5.10 Runtime Stability

- **Fail-open safety engine** — If any DB query in the safety engine fails, it returns "low risk + small delay" rather than blocking the bot. Excellent design for availability.
- **Graceful shutdown** — Worker process handles SIGTERM/SIGINT, stops BullMQ workers, closes queues, closes health server. Well-implemented.
- **Unhandled rejection safety net** — Workers catch unhandled rejections without crashing. Next.js process relies on Sentry for error capture.
- **Session auto-restore** — WhatsApp sessions persist to disk and auto-restore on boot. No manual intervention needed after a restart.

### 5.11 Production Safety

- **Env validation at startup** — Hard errors on missing required vars in production. Warnings for placeholders. Good.
- **Internal secret authentication** — All inter-service calls (`whatsapp-service` ↔ `saas`) require `X-Internal-Secret` header. Enforced.
- **API key encryption** — Merchant AI provider keys encrypted with AES-256-GCM at rest.
- **Input validation** — Zod schemas on all API route bodies.
- **Rate limiting** — Per-endpoint limits (auth: 10/min, chat: 30/min, API: 60/min, WA webhooks: 300/min).

---

## 6. Current Strengths

1. **Safety engine is production-grade** — Warmup stages, rolling risk scores, pattern detection, kill-switch, trust scoring, cooldown softening for real conversations. This is the most mature subsystem.
2. **WhatsApp session management** — LRU eviction, idle sweep, auto-resume, boot restore, hard cap. Well-calibrated for the 8 GB VPS constraint.
3. **Graceful degradation everywhere** — Redis falls back to no-op stubs, BullMQ is gated, safety engine is fail-open, SSE falls back to polling.
4. **Sentry observability** — Full stack instrumentation (client + server + edge), tunnel route, auto-instrumented server functions, source maps in production.
5. **Anti-ban dual layer** — In-memory fast path (`anti-ban.ts`) + persistent DB-backed engine (`safety/engine.ts`). Belt-and-suspenders approach.
6. **Human simulation** — Typing delays, reading pauses, circadian modulation, emoji variations, reply variability. Makes the bot behavior realistic to WhatsApp.
7. **Drift guard on broadcasts** — LLM personalization output is validated for length ratio, number preservation, and refusal detection before sending.
8. **Atomic broadcast claims** — `updateMany` with `status: "pending"` prevents duplicate sends even if cron ticks overlap.

---

## 7. Highest Risks

| # | Risk | Likelihood | Impact | Mitigation Available? |
|---|---|---|---|---|
| 1 | **SQLite `SQLITE_BUSY` under multi-tenant load** | **High** (>10 active businesses) | Service degradation, lost messages | Migrate to Postgres |
| 2 | **VPS RAM exhaustion** | **High** (>10 concurrent sessions) | OOM kills, cascading failures | Reduce `WA_MAX_SESSIONS` or upgrade VPS |
| 3 | **Single server failure** | **Medium** | Total platform outage | Add health-check + auto-restart from external monitor |
| 4 | **SQLite data loss** | **Low** (but catastrophic) | Complete business data loss | Automated backups of `.db` file |
| 5 | **Broadcast queue starvation** | **Medium** (>5 tenants broadcasting) | Hours-long broadcast delays | Enable BullMQ or add parallel cron workers |
| 6 | **SSE DB overload** | **Medium** (>15 dashboard users) | Dashboard unresponsive | Add snapshot caching layer |
| 7 | **Boot OOM spike** | **Medium** | Service fails to start | Stagger session restoration |

---

## 8. Safe Scaling Recommendations

### Immediate (Before Onboarding More Customers)

1. **Automated SQLite backups** — Schedule daily `.db` file copy to an off-server location. This is the single most important operational task.
2. **Set `WA_MAX_SESSIONS` conservatively** — Keep at 8 or lower if running broadcasts. Monitor RAM with a simple cron script.
3. **Add external health monitoring** — Use an uptime monitor (UptimeRobot, Hetrixtools) to ping `/health` and alert on downtime.
4. **Stagger session restore on boot** — Current code restores all sessions sequentially, but all Chromium instances launch nearly simultaneously. Add a 5–10s delay between each.

### Short-Term (Next 1–3 Months)

5. **Migrate to PostgreSQL** — This is the single highest-impact change. Eliminates the write serialization bottleneck, enables connection pooling, concurrent reads/writes, and proper `ANALYZE`. The Prisma schema already has `postgresUrl` and `postgresDirectUrl` env vars defined — the migration path is partially prepared.
6. **Enable BullMQ** — The infrastructure is fully built (queues, workers, dead-letter, health checks, graceful shutdown). Flip `ENABLE_BULLMQ=1` and run the worker process to get parallel broadcast processing and retry semantics.
7. **Add SSE snapshot caching** — Compute the snapshot once per user per 5 seconds, store in memory or Redis, serve to all their SSE connections. Reduces DB queries by 90% for multi-tab/multi-device users.

### Medium-Term (3–6 Months)

8. **Migrate to Linux VPS** — Better Puppeteer stability, lower OS overhead (~500 MB less RAM), systemd service management, better monitoring tooling.
9. **Consider Meta Cloud API for high-volume tenants** — The schema and feature flags are already in place. Meta Cloud eliminates Chromium entirely for those sessions, dramatically reducing RAM.
10. **Separate whatsapp-service to its own VPS** — Isolates Chromium RAM from the Next.js process. Allows independent scaling.

---

## 9. What Must Be Done BEFORE Onboarding More Customers

| Priority | Action | Effort | Why |
|---|---|---|---|
| **P0** | Automated daily SQLite backup | 1 hour | Data loss = business loss |
| **P0** | External uptime monitoring | 30 min | Know when the server is down before customers complain |
| **P1** | RAM monitoring + alerting | 1 hour | OOM kills are silent and catastrophic |
| **P1** | Set `WA_MAX_SESSIONS` to 8 | 1 min | Safety margin for current VPS |
| **P2** | PostgreSQL migration | 1–2 days | Removes the #1 scalability ceiling |
| **P2** | Enable BullMQ for broadcasts | 2 hours | Removes broadcast queue bottleneck |
| **P3** | SSE snapshot cache | 4 hours | Dashboard won't degrade under load |

---

## 10. Conclusion

**KEYONE's current architecture is stable and safe for a small-scale production deployment** — roughly **15–25 businesses with 5–8 concurrent WhatsApp sessions**. The safety engine, session management, and observability are production-grade.

**The hard ceiling is SQLite + single 8 GB VPS.** Beyond ~10 concurrent active tenants, write contention and RAM pressure will cause degradation. The platform has already laid the groundwork for the next tier (Postgres env vars, BullMQ infrastructure, Meta Cloud schema) — the migration path is clear and partially built.

**For the current customer base:** If you have <15 active businesses, the platform is solid. Monitor RAM and SQLite write latency. Back up the database daily.

**For growth beyond 25 businesses:** PostgreSQL migration and Linux VPS are prerequisites, not nice-to-haves.
