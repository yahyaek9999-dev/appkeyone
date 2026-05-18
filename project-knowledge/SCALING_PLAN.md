# Scaling Plan

> Today (May 2026): single 8GB VPS, SQLite, NSSM services. Designed for
> ~10 active merchants. Below is a staged plan to scale to 100+.

## Current ceilings

| Resource | Current capacity | Bottleneck |
|---|---|---|
| WhatsApp sessions | 12 (`WA_MAX_SESSIONS`) | RAM (~400 MB/session × 12 = 4.8 GB) |
| Concurrent LLM calls | 3 (`LLM_MAX_CONCURRENT`) | mse-llm Chromium / external provider quota |
| DB writes | implicit serialize (SQLite) | None observed at current load |
| Daily messages | ~10k across all merchants (estimate) | Disk I/O fine |
| HTTPS RPS | unknown | Caddy can do 1000s, untested |

## Stages

### Stage 1 — Current (≤10 merchants) ✅
Everything fits on one 8GB VPS with current code.

**Monitoring to add:**
- Hourly canary that hits `/api/healthz` (TODO: add this endpoint)
- Daily disk usage check on `C:\app\backups\` (deletes >30 days)

### Stage 2 — 10-30 merchants

**Add:**
1. **Upgrade VPS to 16 GB RAM** → `WA_MAX_SESSIONS=24`
2. **Migrate at least new merchants to OpenAI** — stops feeding mse-llm
3. **Wire `lib/safety/queue.ts`** if not yet wired — priority-based outbound queue
4. **Disk-space monitor** — backups can balloon over 30 days
5. **Better backup pruning** in `backup-all.ps1` (keep last 14, delete older)

**No code refactor needed.** SQLite still fine.

### Stage 3 — 30-50 merchants

**Triggers to monitor:**
- p95 reply time > 3s sustained
- `SQLITE_BUSY` errors in `mse-saas.err.log`
- WA Chromium memory pressure

**Add:**
1. **Move SaaS to a second VPS** if RAM constrained (Node app to VPS-A, WA service to VPS-B)
2. **Postgres migration** if SQLite contention appears — see `POSTGRES_MIGRATION_PLAN.md`
3. **Redis** for the in-memory KB cache + LRU caches (currently process-local — wasted on multi-instance)
4. **CDN** for static assets (Cloudflare in front of Caddy)

### Stage 4 — 50-100 merchants

**Triggers:**
- p99 reply > 5s
- 50+ concurrent WhatsApp sessions
- DB > 50 MB

**Add:**
1. **Multi-node WhatsApp service** — shard sessions across N WA-service instances (consistent hash on userId)
2. **External LLM only** — retire `mse-llm` (or keep as cold fallback)
3. **Postgres mandatory** — see migration plan
4. **Background queue (BullMQ/Redis)** for memory extraction, follow-ups, daily reports — instead of cron polling
5. **Read replicas** for DB if dashboard reads are bottleneck
6. **Real CI/CD** with GitHub Actions

### Stage 5 — 100+ merchants

At this point the architecture needs a rewrite:
- **Meta Cloud API** instead of whatsapp-web.js — see `META_CLOUD_API_PLAN.md`
- **Kubernetes / Fargate** for SaaS instances
- **Managed Postgres** (e.g. AWS RDS)
- **Vector DB** (Pinecone / Weaviate) for KB if quality complaints arise
- **Dedicated observability stack** (Grafana + Loki)

## Per-component scaling

### `mse-saas`
- Stateless ✅ → multiple instances behind a load balancer once needed
- Coupled to SQLite today → blocks horizontal scale
- After Postgres: can run N instances

### `mse-wa`
- Stateful (Chromium sessions on disk) ❌
- To horizontally scale: shard by userId, store auth in shared storage (S3)
- Alternative: Meta Cloud API removes the Chromium constraint entirely

### `mse-llm`
- Single-instance by design (Playwright session)
- Should be deprecated in favor of external providers

### Caddy
- Stateless ✅
- Replace with cloud LB (ALB / Cloudflare) at higher scale

## Cost projections (rough)

| Stage | VPS cost | LLM cost | Notes |
|---|---|---|---|
| 1 (10 mch) | $30/mo (8GB) | $0-50/mo (mostly keyone) | Current |
| 2 (30 mch) | $60/mo (16GB) | $200-500/mo (OpenAI) | Per-merchant ~$15 |
| 3 (50 mch) | $200/mo (2 nodes) | $1500/mo | |
| 4 (100 mch) | $500/mo | $4000-6000/mo | Bill merchants for LLM |
| 5 (500 mch) | $2k+ infra | $20k+ LLM | Separate billing required |

## Things that won't scale and need rewrite

1. **In-process LRU caches** (`KB_CACHE_MAX_ENTRIES=256`) — bound by single-process memory
2. **In-process LLM semaphore** — doesn't coordinate across instances
3. **Single-merchant SQLite** — implicit serialization
4. **whatsapp-web.js sessions on disk** — can't move between hosts
5. **Cron via Windows Scheduled Task** — single point of failure
6. **`X-Internal-Secret` shared by all services** — fine today, becomes a key-mgmt problem at scale
