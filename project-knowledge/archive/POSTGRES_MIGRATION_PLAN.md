# Postgres Migration Plan

> Move the production DB from SQLite (`file:./prod.db`) to PostgreSQL (Supabase).
> **Phase 3 & 4 infrastructure is now in place** — see the concrete runbook below.

---

## Status

| Phase | File | Status |
|-------|------|--------|
| Schema copy (Postgres-ready) | `prisma/schema.postgres.prisma` | ✅ Created |
| Upstash Redis client | `lib/redis.ts` | ✅ Created |
| BullMQ queue definitions | `lib/queue.ts` | ✅ Created |
| Redis caching helpers | `lib/cache.ts` | ✅ Created |
| Broadcast worker | `workers/broadcast.worker.ts` | ✅ Created |
| Worker entry point | `workers/index.ts` | ✅ Created |
| Data migration script | `scripts/pg-migrate.ts` | ✅ Created |

---

## When to migrate (any one condition is enough)

- `SQLITE_BUSY` errors in `mse-saas.err.log`
- p95 DB write latency > 100 ms sustained
- Active merchants > 20 AND single-process throughput is the bottleneck
- Need read replicas for the dashboard
- Need to scale `mse-saas` horizontally (multiple Node.js instances)

## Why not yet

SQLite handles up to ~50 merchants comfortably with the current workload
(many small reads, occasional small writes, no long-running transactions).
The migration costs ~1–2 days of careful work and one short maintenance window.

---

## Infrastructure credentials

| Service | Value |
|---------|-------|
| Supabase project ref | `wahyuzhqkfgzigcipzcc` |
| Supabase region | `eu-central-1` |
| Upstash Redis REST URL | `https://kind-jawfish-128295.upstash.io` |
| Upstash Redis REST token | stored in `.env` as `UPSTASH_REDIS_REST_TOKEN` |

---

## Phase 3 — Postgres Migration Preparation

### 3-A  Environment variables to add to `.env`

```appkeyone/saas/.env.example#L1-10
# Postgres (Supabase) — only needed when DATABASE_PROVIDER=postgres
POSTGRES_URL=postgresql://postgres.wahyuzhqkfgzigcipzcc:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
POSTGRES_DIRECT_URL=postgresql://postgres.wahyuzhqkfgzigcipzcc:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://kind-jawfish-128295.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-token>

# BullMQ toggle (0 = cron system active, 1 = BullMQ workers active)
ENABLE_BULLMQ=0
```

Get the Supabase passwords from: Dashboard → Project → Settings → Database → Connection strings.

### 3-B  Push the Postgres schema (dry run on Supabase)

```appkeyone/saas/scripts/push-schema.sh#L1-5
# 1. Point Prisma at the postgres schema file
# 2. Use POSTGRES_DIRECT_URL so we bypass PgBouncer during DDL
DATABASE_URL=$POSTGRES_DIRECT_URL \
  npx prisma db push \
  --schema prisma/schema.postgres.prisma
```

This creates all tables, indexes, and constraints on Supabase WITHOUT touching the live SQLite DB.

### 3-C  Run the data migration script

```appkeyone/saas/scripts/run-migrate.sh#L1-6
# Maintenance mode: stop or pause new writes to SQLite first.
# Then run:
DATABASE_URL=file:./prod.db \
  POSTGRES_DIRECT_URL=postgresql://postgres:... \
  DRY_RUN=1 \
  npx ts-node --esm scripts/pg-migrate.ts
```

Review the DRY_RUN output, then remove `DRY_RUN=1` for the live run.

**Migration order** (FK-safe, baked into the script):

1. `SiteConfig`, `Plan`, `User` (independent roots)
2. `Bot`, `Subscription`, `SafetyState` (depend on User/Plan)
3. `Customer`, `Document`, `Broadcast`, `KnowledgeGap`, `ApiCall`, `SafetyEvent`, `SafetyAudit`, `MetricEvent`, `ProviderUsage` (depend on User)
4. `QuickReply`, `LlmCache` (depend on Bot)
5. `CustomerMemory`, `Conversation`, `Order`, `WaConsent` (depend on Customer)
6. `Message`, `BroadcastItem`, `OrderItem`, `OrderTimeline` (depend on Conversation/Order)
7. `WaTemplate`, `WaMessage`, `WaWebhookEvent`, `WaComplianceAudit` (WhatsApp models)

The script uses `createMany({ skipDuplicates: true })` in 500-row chunks so it is safe to re-run after a partial failure.

### 3-D  Verify row counts

```appkeyone/saas/scripts/verify-counts.sh#L1-12
# SQLite counts
sqlite3 prod.db "SELECT 'User', COUNT(*) FROM User
UNION ALL SELECT 'Customer', COUNT(*) FROM Customer
UNION ALL SELECT 'Message', COUNT(*) FROM Message;"

# Postgres counts (psql)
psql $POSTGRES_URL -c "
SELECT 'User', COUNT(*) FROM \"User\"
UNION ALL SELECT 'Customer', COUNT(*) FROM \"Customer\"
UNION ALL SELECT 'Message', COUNT(*) FROM \"Message\";"
```

All counts must match before proceeding to cutover.

### 3-E  Cutover (maintenance window)

1. Stop `mse-saas` and `mse-wa` services (NSSM: `nssm stop mse-saas mse-wa`)
2. Final SQLite snapshot: `backup-all.ps1`
3. Run the migration script one more time (catches any writes since 3-C)
4. Swap `.env`:
   ```
   DATABASE_URL=$POSTGRES_URL          # was: file:./prod.db
   ```
5. `npx prisma generate` (regenerates client for Postgres)
6. `npm run build`
7. Start services: `nssm start mse-saas mse-wa`
8. Smoke test (see `TESTING_CHECKLIST.md`)

### 3-F  Rollback plan

If the migration fails post-cutover:
1. `nssm stop mse-saas mse-wa`
2. Restore `.env` → `DATABASE_URL=file:./prod.db`
3. `npx prisma generate` (SQLite client)
4. `npm run build && nssm start mse-saas mse-wa`

Keep `prod.db` as a **read-only backup for 30 days** before removing it.

---

## Phase 4 — Redis + BullMQ

### 4-A  Install new npm packages

```appkeyone/saas/package.json#L1-1
# Run this in appkeyone/saas/
npm install @upstash/redis bullmq ioredis dotenv
npm install --save-dev @types/ioredis
```

Packages needed and why:

| Package | Used by | Why |
|---------|---------|-----|
| `@upstash/redis` | `lib/redis.ts`, `lib/cache.ts` | HTTP Redis client — works in Next.js edge + server components |
| `bullmq` | `lib/queue.ts`, `workers/` | Job queue built on Redis (BullMQ v5) |
| `ioredis` | `lib/queue.ts`, `workers/` | TCP Redis client required by BullMQ (separate from Upstash HTTP) |
| `dotenv` | `workers/index.ts` | Load `.env` in the standalone worker process |

> **Note on Upstash + ioredis:** Upstash supports both the HTTP REST API
> (used by `@upstash/redis`) and a standard Redis TCP protocol (port 6380,
> TLS). BullMQ requires a TCP connection (`ioredis`). Add
> `UPSTASH_REDIS_URL=rediss://:TOKEN@kind-jawfish-128295.upstash.io:6380`
> to `.env` for the ioredis connection.

### 4-B  Add environment variables for BullMQ

```appkeyone/saas/.env#L1-5
# Enable BullMQ workers (0 = cron keeps running, 1 = BullMQ takes over)
ENABLE_BULLMQ=0

# Upstash ioredis-compatible URL (for BullMQ workers only)
UPSTASH_REDIS_URL=rediss://:gQAAAAAAAfUnAAIgcDI2MGNlOGQzYjNjNGU0NzQzYjNlMGRjN2NmZmMzYzIxZQ@kind-jawfish-128295.upstash.io:6380

# Worker health server port (default 3010)
WORKER_HEALTH_PORT=3010
```

### 4-C  Compile and start the worker process

```appkeyone/saas/scripts/start-workers.sh#L1-10
# Development (ts-node)
npx ts-node --esm workers/index.ts

# Production (compile first)
npx tsc --project tsconfig.workers.json
node dist/workers/index.js

# Health check
curl http://127.0.0.1:3010/health
```

### 4-D  NSSM service setup (Windows production)

```appkeyone/deploy/install-workers-nssm.ps1#L1-12
nssm install mse-workers "C:\Program Files\nodejs\node.exe"
nssm set mse-workers AppParameters "C:\app\saas\dist\workers\index.js"
nssm set mse-workers AppDirectory  "C:\app\saas"
nssm set mse-workers AppStdout     "C:\app\logs\workers.log"
nssm set mse-workers AppStderr     "C:\app\logs\workers.err.log"
nssm set mse-workers AppRotateFiles 1
nssm set mse-workers AppRotateSeconds 86400
nssm set mse-workers Start SERVICE_AUTO_START
nssm start mse-workers
```

Add a Windows Scheduled Task to poll `http://127.0.0.1:3010/health` and
restart `mse-workers` via NSSM if the endpoint returns non-200 for > 60s.

### 4-E  Enable BullMQ (switch from cron to queue)

1. Set `ENABLE_BULLMQ=1` in `.env`
2. Restart `mse-saas` (`nssm restart mse-saas`)
3. Restart `mse-workers` (`nssm restart mse-workers`)
4. Watch `workers.log` — you should see workers polling the queues
5. Create a broadcast from the UI and verify it is processed by the worker
   (not the cron) — check `workers.log` for `[broadcast.worker] job ... completed`

The existing cron route at `/api/cron/broadcasts` remains intact as a
**fallback** — it simply finds no `pending` items because the worker already
claimed them. No code changes needed to disable the cron once BullMQ is live.

### 4-F  Using the cache layer

```appkeyone/saas/lib/cache.ts#L1-1
// Quick usage example:
import { cached, cacheKey, TTL, invalidateUser } from "@/lib/cache";

// In a server component or route handler:
const plan = await cached(
  cacheKey.effectivePlan(userId),
  TTL.PLAN,
  () => getEffectivePlan(userId)   // existing DB fetch
);

// After a plan change:
await invalidateUser(userId);
```

---

## Pre-flight checklist

- [ ] Supabase project created (ref: `wahyuzhqkfgzigcipzcc`, region: `eu-central-1`)
- [ ] Supabase DB password retrieved and stored securely
- [ ] `POSTGRES_URL` and `POSTGRES_DIRECT_URL` set in `.env`
- [ ] `npx prisma db push --schema prisma/schema.postgres.prisma` succeeded against Supabase
- [ ] `DRY_RUN=1 npx ts-node --esm scripts/pg-migrate.ts` output reviewed — all tables present
- [ ] Upstash Redis credentials added to `.env`
- [ ] `npm install @upstash/redis bullmq ioredis dotenv` run in `saas/`
- [ ] `UPSTASH_REDIS_URL` (ioredis TCP URL) set in `.env`
- [ ] Worker process starts without errors: `npx ts-node --esm workers/index.ts`
- [ ] Health endpoint responds: `curl http://127.0.0.1:3010/health`
- [ ] Maintenance window scheduled (~30–60 min)

---

## Post-migration optimisations

- **Connection pooling:** Supabase provides PgBouncer on port 6543 (use `POSTGRES_URL`).
  For direct DDL / migrations, use port 5432 (`POSTGRES_DIRECT_URL`). Already wired
  into `schema.postgres.prisma`.
- **Indexes:** All `@@index` declarations in the schema are automatically created by
  `prisma db push`. Monitor slow queries with `EXPLAIN ANALYZE` after go-live.
- **Backups:** Switch `deploy/backup-all.ps1` from SQLite `cp` to `pg_dump`:
  ```
  pg_dump $POSTGRES_DIRECT_URL --format=custom --file=backups/keyone-$(Get-Date -Format yyyyMMdd).dump
  ```
- **Read replica:** Add a read replica in the Supabase dashboard when dashboard queries
  become a bottleneck. Update `POSTGRES_URL` to point to the replica for reads.
- **Queue observability:** Install Bull Board (`@bull-board/api`) for a web UI to inspect
  job queues without writing custom admin pages.

---

## Rollback plan (summary)

| Scenario | Action |
|----------|--------|
| Schema push fails | Fix schema, re-run `prisma db push`. SQLite untouched. |
| Migration script fails mid-run | Fix error, re-run (idempotent). |
| Post-cutover app errors | Restore `.env` DATABASE_URL to SQLite path, rebuild. |
| Worker process crashes | NSSM auto-restarts. Check `workers.err.log`. |
| Redis outage | All Redis calls fail-open. App continues on DB alone. |

---

## Estimated effort

- **Phase 3 prep (done):** Schema + migration script created.
- **Actual cutover:** 30–60 min maintenance window.
- **Phase 4 BullMQ enablement:** 1–2 hours (npm install + env vars + NSSM setup).
- **Tail risk:** 1–2 days for unexpected FK / encoding / index issues.
