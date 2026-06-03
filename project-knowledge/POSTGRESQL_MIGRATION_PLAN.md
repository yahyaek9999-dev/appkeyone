# KEYONE — PostgreSQL Migration Plan

**Generated:** 2026-06-03
**Status:** Code-ready (dual-DB), not yet cut over. Production currently runs SQLite.
**Risk class:** High-impact, reversible with backup. **Do during a maintenance window.**

---

## 1. Why / When

SQLite is excellent for the current single-VPS, single-tenant-per-process model and is **not** the bottleneck today. Migrate to PostgreSQL when **any** of these become true:

- Concurrent merchant count approaches the documented VPS ceiling (~20–25 active sessions; SQLite write-serialization starts to matter under heavy concurrent writes).
- You need **horizontal scale** (multiple app instances) — SQLite's single-file model can't be shared across hosts.
- You need a managed HA database with PITR (point-in-time recovery), read replicas, or zero-downtime blue-green deploys (which require a shared DB).

Until then, SQLite + WAL + daily verified backups is the correct, simpler choice. **Do not migrate prematurely.**

---

## 2. Current State (already done — low risk)

The codebase is **already dual-DB aware**:

| Asset | Location | Notes |
|-------|----------|-------|
| Dual-DB client | `saas/lib/db.ts` | Uses `DATABASE_DIRECT_URL || DATABASE_URL`; WAL pragmas wrapped in catch (no-op on PG) |
| Postgres schema | `saas/prisma/schema.postgres.prisma` | `provider = "postgresql"`, `url = env("POSTGRES_URL")` (pooled), `directUrl = env("POSTGRES_DIRECT_URL")` |
| Portable raw SQL | `saas/lib/db.ts` `rawDate()` | Keeps `Date` params portable across SQLite (epoch-int) and PG (timestamp) |
| No SQLite-only features | schema-wide | No `mode:'insensitive'`, no SQLite-specific JSON ops found in audit |

This means the migration is primarily an **operational** task (move data, swap env, switch schema file), not a code rewrite.

---

## 3. Pre-Migration Audit (do first)

Run these before committing to a date:

1. **Raw SQL sweep** — grep for `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe`. Confirm every one uses `rawDate()` for date params and standard SQL (no `strftime`, no SQLite pragmas in app code). 
2. **Case-sensitivity** — SQLite `LIKE` is case-insensitive by default; PostgreSQL `LIKE` is case-sensitive. Audit Arabic/text search paths (`lib/semantic-match.ts`, customer/product search). Switch to `ILIKE` or `mode:'insensitive'` (PG-only — guard or move to the PG schema) where user-facing search must stay case-insensitive.
3. **Boolean/Int coercion** — SQLite stores booleans as 0/1; Prisma abstracts this, but any raw query reading booleans must be checked.
4. **Autoincrement / cuid** — all PKs are `cuid()` strings (portable). No integer-autoincrement assumptions. ✅
5. **Unique/ָindex parity** — diff `schema.prisma` vs `schema.postgres.prisma` to ensure every model, field, `@@index`, and `@@unique` matches (they should be kept in lock-step; verify no drift since last edit).

```bash
# Schema drift check (manual diff of model/index/unique lines)
cd saas
grep -E "^model |@@index|@@unique|@unique" prisma/schema.prisma         > /tmp/sqlite-shape.txt
grep -E "^model |@@index|@@unique|@unique" prisma/schema.postgres.prisma > /tmp/pg-shape.txt
diff /tmp/sqlite-shape.txt /tmp/pg-shape.txt   # expect empty (or explainable)
```

---

## 4. Target Topology

**Recommended:** Supabase (managed Postgres) or a self-hosted PG on the same/peered host.

```
POSTGRES_URL         = postgresql://...@HOST:6543/postgres?pgbouncer=true   # pooled (PgBouncer) — app runtime
POSTGRES_DIRECT_URL  = postgresql://...@HOST:5432/postgres                  # direct — migrations only
```

- App runtime uses the **pooled** URL (PgBouncer) to survive many short-lived connections.
- `prisma migrate`/`db push` uses the **direct** URL.
- `lib/db.ts` already prefers `DATABASE_DIRECT_URL` when present — for the app runtime you'll set `DATABASE_URL=$POSTGRES_URL` and leave `DATABASE_DIRECT_URL` unset (or set it to the pooled URL too), matching the existing logic. (Confirm the env mapping during the dry run.)

---

## 5. Migration Procedure (maintenance window)

> Reversible at every step until the final cutover. Keep the SQLite file untouched as the rollback source.

### Phase A — Stand up Postgres (no downtime)
1. Provision PG; create database + role.
2. Set `POSTGRES_URL` / `POSTGRES_DIRECT_URL` in a staging env.
3. Apply schema: `prisma db push --schema=prisma/schema.postgres.prisma` against the direct URL. Confirm all ~50 tables + indexes created.

### Phase B — Data copy (rehearse on a backup first)
SQLite→PG data transfer options, in order of preference:
1. **Prisma-based ETL script** (most reliable for type fidelity): read each model from the SQLite client, `createMany` into the PG client in dependency order (User → Bot → Subscription → … → leaf tables). Chunked, idempotent (skip-on-conflict by unique key). Recommended because Prisma handles the SQLite-int ↔ PG-timestamp/boolean coercion correctly.
2. `pgloader` (fast, but verify boolean/datetime mapping carefully).

Rehearse the full copy against a **verified backup** (use `deploy/verify-backup.ps1` output) and record row counts per table; they must match the source.

### Phase C — Cutover
1. `nssm stop mse-saas` (+ workers if running). Drain the outgoing queue first (`/api/cron/outgoing-messages` until `queued=0`) so no in-flight WA sends are lost.
2. Final incremental data sync (copy rows created since the rehearsal snapshot).
3. Swap the active schema: point the build at `schema.postgres.prisma` (rename or set `prisma.schema` path), set `DATABASE_URL=$POSTGRES_URL`.
4. `npm run build` (regenerates Prisma client for PG).
5. `nssm start mse-saas`.
6. **Gate:** `deploy/health-gate.ps1` → `/api/ready` must be `ready:true`; `npm run verify:reliability`; `npm run verify:all`.
7. Spot-check: login, inbox, send a test WA message to yourself, create/extract an order.

### Phase D — Stabilize
- Monitor `/api/internal/metrics` (DB latency), `/api/internal/wa-health`, Sentry for 24–48h.
- Keep SQLite file + last verified backup for at least 7 days as the rollback source.

---

## 6. Rollback

Because the SQLite file is never modified during migration, rollback is: stop service → restore `DATABASE_URL=file:...` + SQLite schema → `npm run build` → start → `health-gate.ps1`. `deploy/rollback.ps1` restores the whole snapshot (db + env + sessions) if needed. Decide a **rollback deadline** (e.g. "if not green within 60 min, roll back") before starting.

---

## 7. Post-Migration Wins to Enable

- **Connection pooling** via PgBouncer (already in the URL design).
- **PITR / automated managed backups** (replaces the manual gzip rotation for the DB tier; keep `verify-backup.ps1` logic adapted to `pg_dump` artifacts, or rely on managed PITR + a periodic `pg_restore` smoke test).
- **Read replica** for analytics-heavy reads (funnel, segments, forecast) to offload the primary.
- **True blue-green deploys** (shared DB unblocks the zero-downtime design in `AGENT3_RELIABILITY_REPORT.md` §3.2).

---

## 8. Checklist

- [ ] Raw SQL + case-sensitivity audit clean
- [ ] `schema.prisma` ↔ `schema.postgres.prisma` shape diff empty
- [ ] PG provisioned; pooled + direct URLs verified
- [ ] Schema applied to PG; table/index count matches
- [ ] Data copy rehearsed on a verified backup; row counts match
- [ ] Cutover runbook dry-run (`-DryRun` equivalents) reviewed
- [ ] Rollback deadline agreed
- [ ] Post-cutover: `/api/ready` ready, `verify:all` pass, test WA send OK
