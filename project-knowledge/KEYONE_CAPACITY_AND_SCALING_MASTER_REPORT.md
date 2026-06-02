# KEYONE — Production Capacity, Scalability & Growth Audit

**Date:** 2026-06-02  
**Status:** Read-only analysis. No code changes, no deploy.  
**Data sources:** Live VPS inspection (`217.154.163.16`), Prisma schema, source code audit, deployed build `f091d27-20260602`.

---

## Executive Summary

KEYONE currently runs on a **single 8GB/2vCPU Windows VPS** with **SQLite** as the database. The WhatsApp bridge runs `whatsapp-web.js` (Puppeteer-based, ~90MB per session) in a single `mse-wa` service. The Next.js app (`mse-saas`, ~150MB) serves all 99 API routes and 28 dashboard pages from one Node.js process.

**Safe today:** ~5–15 customers  
**Comfortable without changes:** ~25–50 customers  
**Realistic maximum without architecture changes:** ~50–100 customers  
**Scaling to 1,000+ requires:** PostgreSQL or SQLite read-replicas, horizontally-scaled WhatsApp nodes, queue infrastructure, and dedicated cron workers.

**Most critical bottlenecks (in order):**
1. **SQLite single-writer** — cannot scale past ~50 concurrent writes/second; 8 cron jobs + 99 API routes compete for the same write lock
2. **WhatsApp sessions** — each customer needs a Puppeteer browser (~100MB); 25–50 sessions exhaust 8GB RAM
3. **Single Node.js process** — 99 API routes, cron jobs, and dashboard rendering all in one thread
4. **AI cost** — at $0.15/1M tokens for gpt-4o-mini, 100 customers × 100 messages/day = ~$45/month in LLM costs

---

## 1. Current Capacity Analysis

### VPS Hardware

| Resource | Current | Available | Notes |
|----------|---------|-----------|-------|
| CPU | 2 vCPU (AMD EPYC-Milan @ 2GHz) | ~60% idle | Burstable, 2 logical processors |
| RAM | 8 GB | 5.1 GB free (64%) | Two Node processes = ~250MB |
| Disk | 128 GB SSD | 82 GB free (64%) | App = 7.6GB, data = tiny |
| Network | Unmeasured (assumed 1 Gbps) | Unmeasured | VPS-grade, likely shared |

### Compute Model

| Service | Tech | RAM | CPU Pattern | Bottleneck |
|---------|------|-----|-------------|------------|
| `mse-saas` | Next.js (Node) | ~151 MB | Event loop, I/O-bound | Single-threaded JS event loop |
| `mse-wa` | Express + puppeteer | ~93 MB | Per-session browser | RAM per WhatsApp session |
| `mse-caddy` | Caddy v2 | ~15 MB | Minimal | None |
| LLM API | CloakBrowser (Python) | ~1.5 GB | CPU-bound on inference | Runs on separate :7788 process |

### Per-Customer Volume Estimates (daily, realistic medium-volume)

| Activity | Per customer | 10 cust | 50 cust | 100 cust | 250 cust | 500 cust | 1,000 cust |
|----------|-------------|---------|---------|----------|----------|----------|------------|
| Inbound messages | 30–100 | 500 | 2,500 | 5,000 | 12,500 | 25,000 | 50,000 |
| Outbound replies | 30–100 | 500 | 2,500 | 5,000 | 12,500 | 25,000 | 50,000 |
| AI LLM calls | 30–100 | 500 | 2,500 | 5,000 | 12,500 | 25,000 | 50,000 |
| Dashboard page views | 10–30 | 200 | 1,000 | 2,000 | 5,000 | 10,000 | 20,000 |
| Broadcasts (monthly) | 5–50 | 250 | 1,250 | 2,500 | 6,250 | 12,500 | 25,000 |
| Broadcast items (monthly) | 500–5,000 | 25K | 125K | 250K | 625K | 1.25M | 2.5M |
| Orders extracted | 5–30 | 150 | 750 | 1,500 | 3,750 | 7,500 | 15,000 |
| Cron job executions | 8/day (shared) | 8 | 8 | 8 | 8 | 8 | 8 |
| Real-time SSE connections | 1–3 | 20 | 100 | 200 | 500 | 1,000 | 2,000 |

### Load by Customer Tier

| Scenario | Msgs/day | LLM calls/day | SQLite writes/sec (peak) | WhatsApp sessions | RAM estimate |
|----------|----------|---------------|------------------------|-------------------|-------------|
| **5 customers** | 300 | 300 | ~2 | 5 | ~3.5 GB free |
| **10 customers** | 600 | 600 | ~4 | 10 | ~2.5 GB free |
| **25 customers** | 1,500 | 1,500 | ~10 | 25 | ~0 GB free (RAM full) |
| **50 customers** | 3,000 | 3,000 | ~20 | 50 | RAM exhausted |
| **100 customers** | 6,000 | 6,000 | ~40 | 100 | Needs 2x VPS |
| **250 customers** | 15,000 | 15,000 | ~100 | 250 | Multi-server required |
| **500 customers** | 30,000 | 30,000 | ~200 | 500 | Needs session nodes |
| **1,000 customers** | 60,000 | 60,000 | ~400 | 1,000 | Full rearchitecture |

### Bottleneck Analysis by Customer Count

| Count | Primary Bottleneck | Secondary | Tertiary |
|-------|--------------------|-----------|----------|
| 5 | None | None | None |
| 10 | WhatsApp session RAM (~1GB) | None | None |
| 25 | **WhatsApp RAM (2.5GB)** | SQLite write contention | LLM API throughput |
| 50 | **RAM — cannot fit 50 sessions** | SQLite queue depth | Node event loop |
| 100 | WhatsApp sessions + SQLite | Single Node process | Cron job scheduling |
| 250 | All of the above | Queue throughput | Network bandwidth |
| 500+ | Complete rearchitecture needed | PostgreSQL | Distributed queue |

---

## 2. WhatsApp Capacity

### Per WhatsApp Number Limits

| Metric | Safe daily | Maximum daily | Notes |
|--------|-----------|--------------|-------|
| **Inbound messages** | No artificial limit | ~10,000 | Controlled by sender; no WA limit on receiving |
| **Outbound replies** | 500 | 1,000 | WhatsApp imposes rate limits on new numbers |
| **Broadcast sends** | 100 | 500 | Non-personalized messages hit limits faster |
| **New number (first week)** | 50/day | 100/day | Warmup stage — strict anti-ban |
| **Mature number (3+ months)** | 500/day | 1,000/day | More trust with WhatsApp |
| **Media messages** | 50/day | 200/day | Higher rate limit penalty |

### WhatsApp Session Economics

| Resource | Per Session | 10 Sessions | 25 Sessions | 50 Sessions |
|----------|-------------|-------------|-------------|-------------|
| RAM (Puppeteer browser) | ~90–120 MB | ~1.0 GB | ~2.5 GB | ~5.0 GB |
| CPU (idle) | ~1% | ~10% | ~25% | ~50% |
| CPU (active reply) | ~10% | N/A (burst) | N/A | N/A |
| Disk (cache) | ~50 MB | ~500 MB | ~1.25 GB | ~2.5 GB |

### Warmup Strategy Required

| Stage | Duration | Daily outbound cap | Broadcast cap |
|-------|----------|-------------------|---------------|
| **New** | Days 1–7 | 50 | 0 |
| **Ramping** | Days 8–14 | 150 | 20 |
| **Growing** | Days 15–30 | 300 | 50 |
| **Mature** | Day 31+ | 500 | 100 |

### WhatsApp Node Scaling

| Count | Nodes Required | Sessions Per Node | Strategy |
|-------|----------------|-------------------|----------|
| 1–25 | 1 | 1–25 | One `mse-wa` service |
| 25–50 | 2 | 12–25 ea | Split by userId hash |
| 50–100 | 4 | 12–25 ea | Hash ring + health checking |
| 100–250 | 10 | 10–25 ea | Dedicated session management |
| 250–1,000 | 20–50 | 10–20 ea | Meta Cloud API (recommended) |

### Meta Cloud API Alternative

At 25+ customers, the Puppeteer approach becomes unsustainable. **Meta Cloud API** switches the model to API calls (no browser per customer):
- No per-session RAM (REST API calls)
- Higher daily limits (verified business accounts)
- Built-in delivery receipts
- Cost: ~$0.005 per message sent

This is the **single highest-ROI scaling investment** (see §9).

---

## 3. Infrastructure Bottlenecks

### Ranked Bottlenecks

| # | Bottleneck | Severity | Type | Current Limit | Impact |
|---|-----------|----------|------|---------------|--------|
| 1 | **SQLite single-writer** | 🔴 Critical | Database | ~50–100 concurrent writes/sec | 8 cron jobs compete; analytics + dashboard + messages all serialize on write lock |
| 2 | **WhatsApp session RAM** | 🔴 Critical | Infrastructure | ~25 sessions on 8GB RAM | Each session = ~100MB browser; cannot scale past ~30 customers |
| 3 | **Single Node.js process** | 🟠 Medium | Compute | Single-threaded event loop | All 99 API routes + dashboard rendering on one CPU; cron jobs block API responses |
| 4 | **Cron job concurrency** | 🟠 Medium | Architecture | 8 cron jobs hitting same DB | Broadcast drain + follow-ups + daily report + webhooks all query/update SQLite simultaneously |
| 5 | **LLM API throughput** | 🟠 Medium | AI | Single CloakBrowser endpoint | ~5–10 concurrent LLM requests before queueing; sequential if model is single-threaded |
| 6 | **Analytics queries** | 🟡 Low | Performance | Full table scans on large Message/Order tables | Funnel/forecast/segments compute across ALL customers — no partition by userId |
| 7 | **Realtime SSE** | 🟡 Low | Network | One open SSE connection per browser tab | 1,000 customers × 3 tabs = 3,000 concurrent connections; eventually hits Node.js connection limit |
| 8 | **Outgoing queue** | 🟡 Low | Queue | Single DB table, no priority queue | All customers share same outgoing queue; a stuck broadcast blocks others |
| 9 | **Dashboard rendering** | 🟢 Minor | Performance | No server-side caching | Every page load hits the DB; `cache: no-store` on all fetch calls |
| 10 | **Disk I/O** | 🟢 Minor | Storage | 128GB SSD, 82GB free | Adequate for 50K+ customers at current per-customer data volumes |

### Bottleneck Detail

#### 🔴 Critical: SQLite Single-Writer

**Problem:** SQLite serializes ALL writes through a single global lock. With 8 cron jobs, 99 API routes, and real-time message processing all writing to the same file, write contention grows linearly with customer count.

**Evidence:**
- Each incoming WhatsApp message triggers **12–16 Prisma queries** (many are writes: `create`, `update`)
- 8 cron jobs all run on ~1-minute intervals
- Analytics endpoints (`/api/funnel`, `/api/segments`, `/api/revenue-forecast`) scan entire tables — blocking writes while running
- Broadcast sends batch-write `BroadcastItem` status updates (20 per tick × 2.5s)

**Failure mode at scale:** Write lock `SQLITE_BUSY` errors. Queries queue up behind the write lock. Eventually cron jobs timeout, messages fail to persist, and the dashboard shows stale data.

**SQLite practical limits:**
| Metric | Limit |
|--------|-------|
| Concurrent writes | ~50/sec (with WAL mode) |
| Database size before degradation | ~100 MB |
| Practical message rows | ~500K before query performance drops |
| Concurrent readers with writer | 0 (in default mode) |

#### 🔴 Critical: WhatsApp Session RAM

**Problem:** `whatsapp-web.js` runs a full Chromium browser per WhatsApp session. Each browser instance consumes 90–120 MB RAM. At 8GB total (5.1GB free), 25–30 sessions exhaust available memory. Beyond that, the OS starts swapping to disk (128GB SSD, but swap kills I/O performance).

**Mitigations available:**
- **Meta Cloud API** switches to REST API calls ($0.005/msg) — eliminates browser per session
- **Baileys worker** (experimental) uses WebSocket instead of browser — ~20MB per session instead of ~100MB

#### 🟠 Medium: Single Node.js Process

**Problem:** The `mse-saas` service (Next.js) handles 99 API routes, 28 dashboard pages, SSE realtime, cron-initiated processing, and webhook ingestion — all in one Node.js thread. While Node.js uses async I/O efficiently, CPU-intensive operations block the event loop:

- **Broadcast cron** serializes 20 messages with 2.5s delays = 50 seconds of blocking (for the cron scope)
- **Analytics endpoints** (funnel, forecast, segments) compute heavily across the DB
- **Dashboard pages** with many concurrent users compound rendering time

---

## 4. Scaling Roadmap

### Stage 1: 0–25 Customers (Current → Near Term)

| Dimension | Action | Cost/Effort |
|-----------|--------|-------------|
| **VPS** | Keep current 8GB/2vCPU | $0 |
| **Database** | Enable SQLite WAL mode (`PRAGMA journal_mode=WAL`) | 5 min config change |
| **WhatsApp** | Monitor session count; stay under 25 | $0 |
| **Cron** | No changes | $0 |
| **Queue** | Add index on outgoing queue status column | Schema change |
| **Monitoring** | Basic health endpoint (`/api/health`) already in place | $0 |
| **Analytics** | Add query timeout to prevent long-running analytics from blocking writes | Low code change |

**SQLite WAL mode** dramatically improves concurrent read/write performance. The app may not use WAL currently (filesystem default is `delete` journal mode). Adding `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` to the Prisma connection string or as a startup query can increase write throughput 3–5×.

**Safe capacity:** 25 customers comfortably with WAL mode.

### Stage 2: 25–100 Customers

| Dimension | Action | Cost/Effort |
|-----------|--------|-------------|
| **VPS** | Upgrade to 16GB/4vCPU ($50–80/mo) | ~$60/mo |
| **Database** | **Begin PostgreSQL migration** (Supabase free tier or $25/mo) | High effort, 1–2 weeks |
| **WhatsApp** | Implement Meta Cloud API for new signups | High effort, 1–2 weeks |
| **Cron** | Extract heavy crons (broadcasts, daily-report) to separate processes | Medium |
| **Caching** | Add in-memory cache for analytics (30s TTL) | Low |
| **Queue** | Deploy BullMQ on Upstash Redis ($0–25/mo) | Medium |

**Why Stage 2 is hard:**

The **PostgreSQL migration** is the biggest engineering effort in the entire roadmap:
- ~35 Prisma queries use `as any` casting (type-safety issues)
- Raw SQL (`$queryRawUnsafe`) in revenue analytics and best-seller queries (SQLite epoch-ms date handling != PostgreSQL timestamps)
- Multiple `catch (() => {})` patterns that mask SQLite-specific errors
- `groupBy` with `_sum`/`_count` used extensively (works differently across dialects)

**Estimated migration effort:** 2–3 weeks of focused engineering.

### Stage 3: 100–250 Customers

| Dimension | Action | Cost/Effort |
|-----------|--------|-------------|
| **VPS** | Add second VPS or scale up to 32GB | $120–200/mo |
| **Database** | PostgreSQL on managed service (Supabase/AWS RDS) | $25–75/mo |
| **WhatsApp** | Meta Cloud API default; Baileys for legacy | Medium |
| **Dedicated cron** | Run cron jobs on second server or serverless function | Medium |
| **Cache** | Redis for real-time data (Upstash Global) | $10–25/mo |
| **Monitoring** | Sentry + uptime monitor + alerting | $25–50/mo |

### Stage 4: 250–500 Customers

| Dimension | Action | Cost/Effort |
|-----------|--------|-------------|
| **App servers** | 2–3 horizontally scaled Next.js instances | $200–400/mo |
| **Database** | PostgreSQL read replicas + connection pooling (PgBouncer) | $100–200/mo |
| **WhatsApp** | Meta Cloud API only (sunset whatsapp-web.js) | High effort |
| **Queue** | BullMQ with Redis cluster | $25–50/mo |
| **CDN** | Static assets behind CDN (Cloudflare) | $0–20/mo |
| **Session management** | Stateless JWT; Redis for session cache | Low |

### Stage 5: 500–1,000 Customers

| Dimension | Action | Cost/Effort |
|-----------|--------|-------------|
| **Architecture** | Microservices: API, workers, realtime, analytics split | High effort |
| **Database** | PostgreSQL sharding or Citus | $500+/mo |
| **Infrastructure** | Kubernetes or Docker Swarm for orchestration | High effort |
| **WhatsApp** | Multi-region Meta Cloud API | Medium |
| **Cost** | Infrastructure | $2,000–5,000/mo |

---

## 5. Database Review

### Index Analysis

**Models with adequate indexes:**
- `Message` (`conversationId + createdAt`) — covers the primary query pattern
- `Order` (`userId + status`, `userId + createdAt`, `customerId`) — good
- `Customer` (`userId + leadScore`, `userId + lastEngagedAt`, `userId + retentionScore`) — good
- `Broadcast` (`userId + status`, `status + scheduledAt`) — good

**Models missing strategic indexes:**
| Model | Missing Index | Impact | Risk |
|-------|--------------|--------|------|
| `Message` | `userId` (via Conversation→Customer) | Funnel/analytics queries scan all messages | 🔴 High |
| `Message` | `createdAt` alone | Date-range message queries scan entire table | 🟠 Medium |
| `Customer` | `createdAt` | Cohort analysis for funnel scans all customers | 🟠 Medium |
| `Order` | `total` + `status` | Revenue aggregation scans all non-canceled orders | 🟠 Medium |
| `BroadcastItem` | `customerId` | Timeline queries for Customer 360 scan all items | 🟠 Medium |
| `UsageLedger` | `kind` | Plan usage aggregation scans all rows | 🟡 Low |

### Table Growth Projections

| Table | Row Size | 100 customers (6mo) | 500 customers (6mo) | 1,000 customers (6mo) |
|-------|----------|---------------------|---------------------|----------------------|
| `Message` | ~500 bytes | 9M rows (4.5 GB) | 45M rows (22.5 GB) | 90M rows (45 GB) |
| `Order` | ~400 bytes | 90K rows (36 MB) | 450K rows (180 MB) | 900K rows (360 MB) |
| `OrderTimeline` | ~200 bytes | 180K rows (36 MB) | 900K rows (180 MB) | 1.8M rows (360 MB) |
| `BroadcastItem` | ~200 bytes | 150K rows (30 MB) | 750K rows (150 MB) | 1.5M rows (300 MB) |
| `WaWebhookEvent` | ~1 KB | 180K rows (180 MB) | 900K rows (900 MB) | 1.8M rows (1.8 GB) |
| `SafetyAudit` | ~500 bytes | 90K rows (45 MB) | 450K rows (225 MB) | 900K rows (450 MB) |
| **Total** | | **~5 GB** | **~25 GB** | **~50 GB** |

**SQLite's practical limit** is around 100–200 GB (at which point VACUUM takes hours and backup is impractical). At 500+ customers, PostgreSQL becomes a hard requirement.

### Slow Query Risks (by endpoint)

| Endpoint | Query Pattern | Risk at 100 customers |
|----------|--------------|----------------------|
| `/api/funnel` | Scans cohort customers + orderAgg + message sample | 🟠 Medium — bounded by cohort cap (50K) |
| `/api/segments` | Scans ALL customers + ALL orders | 🔴 High — full table scan on Customer + Order |
| `/api/revenue-forecast` | Scans 30d orders + daily aggregate | 🟠 Medium — bounded by date window |
| `/api/analytics` | Scans messages, customers, orders in date window | 🟠 Medium — bounded but compound |
| `/api/broadcasts/[id]/analytics` | Scans broadcast items + messages + orders | 🟡 Low — bounded by broadcast size |
| `/api/customers/[id]/timeline` | 5 parallel queries (messages, orders, escalations, etc.) | 🟡 Low — per-customer, bounded |

### Recommended Index Additions

```sql
-- Add these indexes (low-risk, additive, can be applied via prisma db push)
CREATE INDEX IF NOT EXISTS idx_message_created_at ON Message(createdAt);
CREATE INDEX IF NOT EXISTS idx_customer_created_at ON Customer(createdAt);
CREATE INDEX IF NOT EXISTS idx_order_total_status ON Order(userId, status, total);
CREATE INDEX IF NOT EXISTS idx_broadcast_item_customer ON BroadcastItem(customerId, status);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_user ON WaWebhookEvent(userId, receivedAt);
```

### Data Archiving Strategy (Recommended for 50+ customers)

| Table | Archive Rule | Recovery |
|-------|-------------|----------|
| Message | Messages older than 90 days → archive table/partition | Via Customer 360 timeline (capped to 200) |
| SafetyAudit | Older than 180 days → delete or archive | Keep in backup; not customer-facing |
| WaWebhookEvent | Older than 30 days → delete | Replay via commerce webhook if needed |
| BroadcastItem | Older than 90 days → keep summary only | Customer 360 shows capped broadcast events |
| EscalationTimeline | Older than 180 days → archive | Low access frequency |

---

## 6. AI Cost Scaling

### LLM Cost Model

**Assumptions:**
- Default model: `gpt-4o-mini` ($0.15/1M input tokens, $0.60/1M output tokens)
- Average message exchange: ~1,500 input tokens (system prompt + history + message + KB context)
- Average reply: ~150 output tokens
- Each message = 1 LLM call
- Average 50 messages/day/customer
- Daily report: ~1 LLM call per user (heuristic, not currently using LLM)
- Broadcast generation: ~1–2 LLM calls per campaign

### AI Cost by Customer Count

| Metric | 10 customers | 50 customers | 100 customers | 500 customers |
|--------|-------------|-------------|--------------|--------------|
| Messages/day | 500 | 2,500 | 5,000 | 25,000 |
| LLM calls/day | 500 | 2,500 | 5,000 | 25,000 |
| Input tokens/day | 750K | 3.75M | 7.5M | 37.5M |
| Output tokens/day | 75K | 375K | 750K | 3.75M |
| **Daily LLM cost (gpt-4o-mini)** | **$0.16** | **$0.79** | **$1.58** | **$7.88** |
| **Monthly LLM cost** | **~$5** | **~$24** | **~$48** | **~$240** |

### Alternative Provider Costs

| Provider | Model | Cost/1M input | Cost/1M output | Monthly (100 users) | Monthly (500 users) |
|----------|-------|--------------|---------------|--------------------|--------------------|
| OpenAI | gpt-4o-mini | $0.15 | $0.60 | ~$48 | ~$240 |
| OpenAI | gpt-4o | $2.50 | $10.00 | ~$800 | ~$4,000 |
| Gemini | gemini-2.0-flash | $0.10 | $0.40 | ~$30 | ~$150 |
| KEYONE (in-house) | Free (local LLM) | $0 | $0 | ~$10 (electricity) | ~$30 (electricity) |
| Groq | llama-3.1-8b | Free (rate-limited) | Free | $0 | $0 |

### Cost Optimization Opportunities

| Optimization | Savings | Implementation Difficulty | Notes |
|-------------|---------|--------------------------|-------|
| LLM response caching | 20–40% | Already implemented (LlmCache, 24h TTL) | ✅ Existing — ensure it's enabled per bot |
| Quick-reply matching | 30–60% | Already implemented | ✅ Existing — semantic matching bypasses LLM |
| Lower default model | 10–30% | Easy (config change) | gpt-4o-mini is already the cheapest performant option |
| Batch LLM processing | 5–10% | Medium | Combine multiple AI tasks into one call |
| Groq for non-critical | 50–100% | Easy | Free tier for non-critical or Arabic content |
| KEYONE local LLM | 100% | Already available | In-house LLM via CloakBrowser |

**Current optimization:** The app already implements **LLM response caching** and **quick-reply semantic matching** as the first two lines of defense. Exact-match cache hits cost $0. Semantic quick-reply hits also cost $0. The aggressive caching likely reduces actual LLM calls by 30–50% versus naive estimates.

### Realistic AI Cost (with caching)

| Customer Count | Raw LLM cost/mo | With caching (est.) |
|---------------|-----------------|-------------------|
| 10 | $5 | ~$3 |
| 50 | $24 | ~$14 |
| 100 | $48 | ~$29 |
| 500 | $240 | ~$144 |

---

## 7. Revenue Scaling Model

### Assumptions

| Metric | Value |
|--------|-------|
| **Avg monthly price** | $29/merchant (blended: $19–$79 across plans) |
| **Infrastructure base** | $30–50/mo (current VPS) |
| **AI cost per customer** | ~$0.29/mo (with caching) |
| **WhatsApp cost** | $5/mo per Meta Cloud API connection |
| **Gross margin target** | 70%+ for SaaS |

### Revenue Projection

| Customers | Monthly Revenue | Infrastructure Cost | AI Cost | Est. Margin | Notes |
|-----------|---------------|-------------------|---------|-------------|-------|
| **10** | $290 | $30 (current VPS) | $3 | **~89%** | Highly profitable on current hardware |
| **25** | $725 | $30 (current VPS) | $7 | **~95%** | Best margin point; VPS at capacity |
| **50** | $1,450 | $60 (upgraded VPS) | $14 | **~95%** | Still strong; need SQLite→PG transition |
| **100** | $2,900 | $200 (multi-server) | $29 | **~92%** | Infrastructure costs rise but margin holds |
| **250** | $7,250 | $500 (distributed) | $72 | **~92%** | Healthy; PostgreSQL + Redis caching |
| **500** | $14,500 | $1,200 | $144 | **~91%** | Microservices architecture pays off |
| **1,000** | $29,000 | $3,000 | $288 | **~89%** | Fully scaled, still strong margin |

### Break-even Analysis

| Scenario | Monthly Cost | Revenue Needed | Customers for Break-even |
|----------|-------------|---------------|--------------------------|
| **Current VPS ($30/mo)** | ~$35 | $29/customer | **2 customers** |
| **Stage 2 ($100/mo)** | ~$120 | $29/customer | **5 customers** |
| **Stage 3 ($300/mo)** | ~$350 | $29/customer | **12 customers** |
| **Stage 4 ($1,000/mo)** | ~$1,150 | $29/customer | **40 customers** |
| **Stage 5 ($3,000/mo)** | ~$3,300 | $29/customer | **115 customers** |

### Financial Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM costs spike (model upgrade) | Medium | High | Use cheaper models; rate-limit heavy users |
| WhatsApp bans primary numbers | Medium | Critical | Multi-number strategy; Meta Cloud API fallback |
| Customer churn > 10%/mo | Medium | High | Annual contracts; onboarding automation |
| VPS down/compromised | Low | Critical | Move to managed cloud (DigitalOcean/AWS) |
| SQLite corruption | Low | High | Automated daily backups already in place |
| API provider price increase | Medium | Medium | Multi-provider routing already built |

---

## 8. Enterprise Readiness Score

| Category | Score | Rationale |
|----------|-------|-----------|
| **Architecture** | 6/10 | Single-server monolith. Good separation of concerns in lib/ but no horizontal scaling. SQLite is the weak point. WhatsApp service is tightly coupled to Puppeteer. |
| **Security** | 7/10 | JWT auth, password hashing, env-based secrets, admin role system. Weak: single-factor auth, no RBAC (Phase 2), AUTH_SECRET is a dev default, QA password is "123456". |
| **Reliability** | 7/10 | Queued outgoing messages with retry, atomic claims, SafetyAudit logging, idempotency keys. Weak: single point of failure (one VPS, one SQLite file), no health-based auto-recovery. |
| **Scalability** | 4/10 | SQLite is the hard ceiling. WhatsApp Puppeteer sessions don't scale past ~25. Single Node.js process for all API routes. No caching layer. No CDN. |
| **Maintainability** | 8/10 | Clean codebase, consistent `@/` imports, dashboard pages follow `page.tsx + X-ui.tsx` pattern, lib/ is well-organized. Weak: no shared types, inconsistent auth patterns, `as any` casts. |
| **Monitoring** | 5/10 | Basic health endpoint (public). Sentry for errors. No: APM, query monitoring, business metrics dashboard, alerting, log aggregation, CPU/memory trending. |
| **Overall** | **6.2/10** | Solid foundation, excellent code quality, but infrastructure does not yet meet enterprise standards for HA, DR, observability, or scale. |

---

## 9. Immediate Improvements (Top 10 by ROI)

| Rank | Improvement | Impact | Difficulty | Priority | Cost |
|------|-------------|--------|-----------|---------|------|
| **1** | **Enable SQLite WAL mode** | 3–5× write throughput | Trivial (5 min) | 🔴 **Highest** | $0 |
| **2** | **Add missing indexes** (Message.createdAt, Customer.createdAt, Order.total+status) | 10–100× query speed on analytics | Low (1 hour) | 🔴 **High** | $0 |
| **3** | **Change QA password + set production AUTH_SECRET** | Stops credential-based compromise | Trivial (10 min) | 🔴 **Critical** | $0 |
| **4** | **Implement Meta Cloud API for new signups** | Eliminates browser-per-session RAM problem | High (1–2 weeks) | 🟠 **High** | $0.005/msg |
| **5** | **Add query timeout to analytics endpoints** | Prevents long-running analytics from blocking write path | Low (1 day) | 🟠 **Medium** | $0 |
| **6** | **Separate cron worker process** | Prevents cron from competing with API in same Node process | Medium (3 days) | 🟠 **Medium** | $0 |
| **7** | **Deploy Redis (Upstash) for caching + BullMQ** | Adds analytics caching + priority queue | Medium (1 week) | 🟠 **Medium** | $10–25/mo |
| **8** | **Add basic APM (Sentry performance)** | Find actual slow queries and N+1 patterns | Low (1 day) | 🟠 **Medium** | Already have Sentry |
| **9** | **Implement data archiving for Message/SafetyAudit** | Keeps SQLite performant as table sizes grow | Medium (3 days) | 🟡 **Low** | $0 |
| **10** | **Add operational dashboard** (CPU, memory, DB size, queue depth, LLM cost) | Visibility into actual scaling bottlenecks | Medium (3 days) | 🟡 **Low** | $0 |

**Estimated cost of all 10 improvements:** $10–50/mo (Redis/Upstash) + 2–4 weeks engineering time.

---

## 10. Final Verdict

### How many customers can KEYONE safely onboard today?

**5–15 customers.** The current 8GB/2vCPU VPS with SQLite can comfortably handle this load. WhatsApp sessions are the binding constraint — 15 sessions at ~100MB each = 1.5GB of the available 5.1GB free RAM.

### How many customers can it realistically support without changes?

**25–50 customers** with two low-cost changes:
1. Enable SQLite WAL mode (5 minutes)
2. Add the missing database indexes (1 hour)

Beyond 25, WhatsApp session RAM becomes the primary bottleneck (2.5GB for 25 sessions). Beyond 50, SQLite write contention becomes the second bottleneck. Both must be addressed to go past 50.

### What is the first scaling upgrade required?

**SQLite WAL mode + Meta Cloud API** — in parallel:
- **WAL mode** buys 3–5× more write throughput, extending SQLite's useful life to 50–75 customers
- **Meta Cloud API** eliminates the per-customer browser RAM problem, enabling 100+ sessions on the same 8GB VPS

These two changes alone extend capacity from 25 customers to ~100 customers.

### What is the most likely future bottleneck?

**SQLite write contention** will be the first bottleneck you hit (at ~30–50 customers), followed by **WhatsApp session RAM** (at ~25 customers — so they arrive concurrently).

**The third bottleneck** that will surprise you: **single Node.js event loop** at ~75–100 customers. The broadcast cron, analytics endpoints, and realtime SSE connections will all compete for the same thread. Dashboard pages will start feeling slow before anything actually breaks.

### Summary Table

| Threshold | Primary Constraint | Action Required | Timeline |
|-----------|-------------------|----------------|----------|
| **Current (6 customers)** | None | Run comfortably | ✅ Now |
| **~15 customers** | WhatsApp session RAM (~1.5GB) | Monitor RAM usage | 🟢 1 month |
| **~25 customers** | WhatsApp sessions + SQLite writes | **WAL mode + Meta Cloud API** | 🟡 Next |
| **~50 customers** | SQLite contention + Node event loop | **PostgreSQL migration** | 🟡 2–3 months |
| **~100 customers** | App server CPU + DB | Separate cron worker + caching | 🟠 3–6 months |
| **~250 customers** | Everything scales sub-linearly | **Multi-server architecture** | 🔴 6–12 months |
| **500–1,000 customers** | Horizontal scaling of everything | **Major rearchitecture** | 🔴 12–24 months |

### Key Takeaway

KEYONE is **well-positioned as a single-server SaaS** for the first 25–50 customers. The architecture is clean, the safety/queue/retry systems are production-grade, and the code is maintainable. But the **infrastructure ceiling is real and predictable:**

> Without changes, at ~25 customers you hit the WhatsApp RAM wall.  
> Without PostgreSQL migration, at ~50 customers you hit the SQLite wall.  
> Without multi-process architecture, at ~100 customers you hit the Node.js event loop wall.

The **highest-ROI engineering investment** before reaching 50 customers is **Meta Cloud API** integration (eliminates browser-per-session) + **PostgreSQL migration plan** (begun before it's critical, not during a crisis). Both are 1–3 week engineering efforts that should be scheduled at the 15–20 customer milestone, not at 50+ when they become emergencies.
