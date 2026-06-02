# KEYONE — Scale to 100: Architecture & Migration Plan

**Date:** 2026-06-02  
**Status:** Planning doc for Phase 1 implementation. No production changes until deployment.

---

## Current Architecture

```
                    VPS (8GB RAM, 2 vCPU, Windows Server 2025)
                   
  ┌────────────────────────────────────────────────────────────┐
  │  mse-saas (Next.js, ~151 MB)                              │
  │  ┌────────────────────────────────────────────────────┐   │
  │  │  99 API routes, 28 dashboard pages, SSE realtime   │   │
  │  │                                                     │   │
  │  │  wa.send() ──► enqueueSend ──► enqueueOutboundText │   │
  │  │                       │                             │   │
  │  │  wa.sendNow() ──► HTTP call to :3001               │   │
  │  │                                                     │   │
  │  │  messaging.send() ──► resolveProvider() ──► QR/Meta │   │
  │  └────────────────────────────────────────────────────┘   │
  │                                                            │
  │  mse-wa (Express + Puppeteer, ~93 MB)                    │
  │  ┌────────────────────────────────────────────────────┐   │
  │  │  whatsapp-web.js sessions (1 browser per customer) │   │
  │  │  HTTP API on :7799                                │   │
  │  └────────────────────────────────────────────────────┘   │
  │                                                            │
  │  SQLite (single file)                                      │
  │  ┌────────────────────────────────────────────────────┐   │
  │  │  WaMessage (outgoing queue)                       │   │
  │  │  Broadcast + BroadcastItem (broadcast queue)       │   │
  │  │  FollowUpTask (follow-up queue)                   │   │
  │  │  All app data (Customer, Order, Message, etc.)    │   │
  │  └────────────────────────────────────────────────────┘   │
  │                                                            │
  │  8 cron jobs (via Windows Task Scheduler)                 │
  └────────────────────────────────────────────────────────────┘
```

### Key Constraints

| Constraint | Current Limit | Bottleneck for |
|-----------|--------------|----------------|
| WhatsApp sessions | ~25 (RAM: ~100 MB/session) | Customer onboarding |
| SQLite writes | ~50/sec without WAL | All writes serialize |
| Single Node.js process | ~75-100 customers | CPU-bound cron blocks API |
| Puppeteer browsers | ~25 per VPS | RAM exhaustion |
| AI throughput | ~5-10 concurrent LLM calls | Sequential LLM under load |

### Already-Built Infrastructure (not yet activated)

| Infrastructure | Status | Location |
|--------------|--------|----------|
| **QR Provider** | ✅ Live | `lib/messaging/qr-provider.ts` |
| **Meta Cloud Provider** | ✅ Live (Phase 2) | `lib/messaging/meta-provider.ts` |
| **Provider Dispatch** | ✅ Live | `lib/messaging/index.ts` — `resolveProvider()` |
| **BullMQ Queue Definitions** | ⚠️ Dormant (`ENABLE_BULLMQ=0`) | `lib/queue.ts` |
| **Broadcast BullMQ Worker** | ⚠️ Dormant | `workers/broadcast.worker.ts` |
| **Upstash Redis** | ✅ Configured | `.env.example` has credentials |
| **PostgreSQL Schema (stale)** | ⚠️ 40% missing fields | `prisma/schema.postgres.prisma` |
| **Supabase DB Instance** | ✅ Provisioned | `.env.example` has connection string |

---

## Migration Roadmap

### Phase 1 (This Session) — Foundation & Preparation
**Goal:** Safe infrastructure improvements, no behavior changes, no downtime risk.

| Change | Current | Target | Est. Effort |
|--------|---------|--------|-------------|
| SQLite WAL mode | Default (DELETE journal) | WAL + synchronous=NORMAL | 5 minutes |
| Raw SQL PG compatibility | 4 queries using epoch-ms integers | ISO 8601 dates (PG-compatible) | 30 minutes |
| Missing DB indexes | None on Message.createdAt, Customer.createdAt, etc. | 5 new indexes | 15 minutes |
| Queue abstraction layer | SQLite-only (hardcoded) | Interface + SQLite impl, BullMQ stub | 1 hour |
| Connection pooling prep | PrismaClient() with defaults | Configurable pool + dual-URL | 15 minutes |
| Catch-block instrumentation | ~50 silent swallows | At least context logged | 30 minutes |
| PostgreSQL schema | Stale (760 lines) | Regenerated from current (1283 lines) | 15 minutes |
| Queue provider routing | Hardcoded `wa.sendNow()` | Accepts provider via parameter | 15 minutes |

**Capacity after Phase 1:** ~25 → ~50 customers (WAL mode + Meta Cloud prep)

---

### Phase 2 (Next) — Meta Cloud API + Queue Migration
**Goal:** Eliminate Puppeteer bottleneck, enable Redis-based queuing.

| Change | Effort | Risk | Capacity Gain |
|--------|--------|------|---------------|
| Wire outgoing queue to `resolveProvider()` | 2 days | Medium | Enables Meta Cloud for ALL sends |
| Make Meta Cloud API default for eligible merchants | 1 day | Low | Removes browser/session for new users |
| Add Baileys WebSocket provider (20MB vs 100MB/session) | 3 days | Medium | 5× session density |
| Activate BullMQ for outgoing queue | 3 days | Medium | Enables Redis-based queue |
| Deploy worker process on separate VPS or serverless | 2 days | Low | Eliminates cron/API CPU contention |

**Capacity after Phase 2:** ~50 → ~150 customers

---

### Phase 3 (Future) — PostgreSQL Migration
**Goal:** Remove SQLite ceiling, enable horizontal scaling.

| Change | Effort | Risk | Notes |
|--------|--------|------|-------|
| Regenerate Prisma schema for PostgreSQL | 1 day | High | Requires full schema review |
| Convert 4 raw SQL queries for PG dialect | 2 hours | Medium | `strftime`→`EXTRACT`, date casts |
| Fix 118 `(prisma as any)` casts | 2 days | Medium | Many are on late-added models |
| Set up `prisma migrate` workflow | 1 day | Medium | Replace `db:push` with `migrate deploy` |
| Migration script + dry-run on staging | 3 days | High | Data export/import, validation |
| Cutover: stop app → migrate → verify → start | 4 hours | Critical | Requires maintenance window |

**Capacity after Phase 3:** ~150 → 500+ customers

---

### Phase 4 (Future) — Multi-Server Architecture
**Goal:** Horizontal scaling, HA, enterprise readiness.

| Change | Effort | Risk | Notes |
|--------|--------|------|-------|
| Separate API server + worker server | 1 week | Medium | Load balancer + session affinity |
| CDN for static assets | 2 days | Low | Cloudflare |
| Read replicas for analytics queries | 3 days | Low | Separate analytics read load |
| Auto-scaling groups | 1 week | Medium | Kubernetes or Docker Swarm |
| Comprehensive monitoring + alerting | 1 week | Low | Grafana, PagerDuty, uptime checks |

**Capacity after Phase 4:** 500–1,000+ customers

---

## Risk Register

| Change | Risk | Probability | Mitigation | Rollback |
|--------|------|-------------|------------|----------|
| WAL mode | None | 0% | Already production-proven on SQLite | `PRAGMA journal_mode=DELETE` |
| Raw SQL date fix | Low | 10% | ISO 8601 works on both SQLite and PG | Revert datetime param style |
| Missing indexes | None | 0% | Additive, non-destructive | `DROP INDEX IF EXISTS` |
| Queue abstraction | None | 0% | New interface, no callers changed | Delete new files |
| Connection pooling | None | 0% | Only applies to PG, ignored by SQLite | No-op on SQLite |
| Catch-block logging | None | 0% | Adds logging only | Remove log lines |
| Schema regen | None | 0% | Doc file only | Restore from git |
| Provider routing param | Low | 5% | Default parameter keeps current behavior | Revert default |

---

## Target Architecture

```
                    Future State (Post-Phase 3)
                   
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  API Server  │  │  API Server  │  │  Worker Pool │
  │  (Next.js)   │  │  (Next.js)   │  │  (BullMQ)    │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │        Load Balancer (Caddy)       │
         └─────────────────┬─────────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │         PostgreSQL + PgBouncer     │
         │           (Supabase/RDS)           │
         └─────────────────┬─────────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │       Redis (Upstash/BullMQ)       │
         │  Queues: broadcasts, notifications │
         │  AI jobs, webhooks, outgoing-msgs  │
         └─────────────────┬─────────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │    WhatsApp: Meta Cloud API (REST) │
         │    + Baileys WebSocket (cheap)     │
         │    + QR (legacy fallback)          │
         └────────────────────────────────────┘
```
