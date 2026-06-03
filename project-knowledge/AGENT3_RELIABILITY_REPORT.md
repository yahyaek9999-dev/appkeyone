# KEYONE — Agent 3 Reliability Report

**Generated:** 2026-06-03
**Author:** Reliability hardening pass (Agent 3)
**Scope:** Production readiness & future scaling — deployment hardening, rollback, health verification
**Constraint honored:** No changes to the WhatsApp send pipeline, queue behavior, billing, or subscriptions. All work is **additive**.

---

## 0. Executive Summary

KEYONE is already a mature production SaaS with substantial reliability infrastructure (health endpoint, internal metrics, queue-health diagnostics, Sentry, daily backups, a full rollback script, an 8-module verify suite, and safe-deploy scripts with pre-flight backups). The gaps were not in *capability* but in **verification and gating**: backups were never restore-tested, deploys were liveness-gated (not readiness-gated), and there was no single pane for WhatsApp delivery health.

This pass closes those gaps **additively**:

| # | Focus area | What was added | Files |
|---|------------|----------------|-------|
| 1 | Health verification | Deep readiness probe `/api/ready` (DB + schema + queue backlog) | `saas/app/api/ready/route.ts` |
| 2 | Queue + WA health monitoring | Aggregated `/api/internal/wa-health` (service pool + queues + Meta quality) | `saas/app/api/internal/wa-health/route.ts` |
| 3 | Verification | `verify:reliability` scope (queue depth, dead-letters, Meta quality, backup recency, readiness) | `saas/scripts/verify/run.js`, `saas/package.json` |
| 4 | Backup verification | `verify-backup.ps1` — restore-tests newest backup (decompress + `integrity_check` + core-table sanity) | `deploy/verify-backup.ps1` |
| 5 | Zero-downtime / rollback | `health-gate.ps1` — polls `/api/ready` post-deploy, auto-rollback on sustained failure | `deploy/health-gate.ps1` |
| 6 | Planning | PostgreSQL migration plan, Redis/Workers activation plan, Meta Cloud production report | 3 companion docs |

Nothing in the send path, billing, or subscription logic was touched.

---

## 1. Focus Area Status

### 1.1 Meta Cloud Production Readiness — ✅ Ready (verification added)

**Existing (already production-grade):**
- Webhook receiver with **HMAC-SHA256 signature verification** (constant-time), GET verify-token handshake, idempotency on `(source, eventId)`, raw-body capture — `saas/app/api/whatsapp/meta-webhook/route.ts`
- Encrypted token storage (AES-256-GCM via `lib/crypto-util.ts`, key derived from `AUTH_SECRET`)
- Cron loop: `meta-webhook-processor` (dead-letters after 5 attempts), `meta-template-sync`, `meta-quality-monitor` (raises `WaComplianceAudit` on GREEN→YELLOW→RED)
- Graph client with structured errors + known error-code map — `lib/messaging/meta-api.ts`

**Added this pass:**
- `verify:reliability` checks `reliability:meta-quality` (fails on RED, warns on YELLOW) and `reliability:meta-webhooks` (warns on dead-lettered events).
- `/api/internal/wa-health` rolls up per-bot quality ratings (`green/yellow/red/atRisk`) for alerting.

**Remaining (documented in `META_CLOUD_PRODUCTION_REPORT.md`):** live "Verify Setup" button calling `getPhoneNumberHealth()` at save-time; template-create UI; media fetch (Phase 2.1). None block production for QR-primary deployments.

### 1.2 Backup Verification — ✅ Closed (was the biggest gap)

**Before:** `backup-all.ps1` (pre-deploy full snapshot) and `backup-db.ps1` (daily gzip, 14-day retention) created backups but **never verified them**. A corrupt or truncated backup would only be discovered during a real disaster.

**After:** `deploy/verify-backup.ps1`:
1. Finds the newest `prod-*.db.gz`
2. Asserts recency (`-MaxAgeHours`, default 26h — catches a broken daily task)
3. Decompresses to a temp file (proves the gzip is intact)
4. Runs `PRAGMA integrity_check` (proves the SQLite file is structurally sound)
5. Counts `User`/`Bot` (proves it's a real KEYONE DB with schema intact)
6. Cleans up; exits non-zero on any failure

Designed to run on a schedule (daily 04:00, after the 03:30 backup). `verify:reliability`'s `reliability:backup-recency` check provides a second, app-side recency assertion when `KEYONE_BACKUP_DIR` is set.

### 1.3 Monitoring — ✅ Ready (aggregation added)

**Existing:** `/api/health` (liveness), `/api/internal/metrics` (DB counts + Redis ping), `/api/internal/queue-health` (cron/BullMQ depth), Sentry server+edge configs, `lib/metrics.ts` (coalesced `MetricEvent`/`ProviderUsage`).

**Added:** `/api/ready` (deep readiness) and `/api/internal/wa-health` (one-call WhatsApp delivery posture). Together these give monitors three tiers: **liveness** (`/api/health`), **readiness** (`/api/ready`), **delivery health** (`/api/internal/wa-health`).

### 1.4 Queue Visibility — ✅ Ready (surfaced + verified)

**Existing:** `getOutgoingQueueHealth()` exposes `queued/scheduled/sending/sent24h/failed24h/oldestQueuedAgeSec/staleQueued`; `queue-health` route surfaces broadcast + follow-up depth.

**Added:** `/api/ready` folds outgoing-queue staleness into its verdict (warn, never block); `/api/internal/wa-health` shows outgoing + broadcast depth side-by-side; `verify:reliability` checks both queues and flags stale/aging backlogs. **No change to drain logic or pacing.**

### 1.5 WhatsApp Health Monitoring — ✅ Ready

**Existing:** whatsapp-service exposes `/health` and `/sessions/stats` (pool size, connected/disconnected, reconnect timers, health-failures, memory). `meta-quality-monitor` tracks Meta numbers.

**Added:** `/api/internal/wa-health` fetches `/sessions/stats` (4s timeout, never throws), merges queue depth + Meta quality, and derives a single `status: ok|degraded` with `reasons[]` for cheap alerting. `verify:reliability` pings whatsapp-service `/health` when `WHATSAPP_SERVICE_URL` is set.

### 1.6 Zero-Downtime Deployment — ⚠️ Improved within current architecture

**Reality:** The Windows/NSSM single-instance topology has an inherent stop→build→start window (Prisma DLL file-lock requires the service down during `npm ci`/build). True zero-downtime needs a second instance + Caddy upstream swap — that is **planned, not yet built** (see §3).

**Added now:** `health-gate.ps1` converts a "fire and hope" restart into a **gated** one: after restart it polls `/api/ready` and only declares success when the new build is genuinely ready — otherwise it auto-rolls-back. This minimizes *bad-deploy* exposure even though it doesn't eliminate the restart blip. The blue-green design is specified in §3.2.

### 1.7 PostgreSQL Readiness — ✅ Code-ready, migration documented

`lib/db.ts` is already dual-DB (Supabase dual-URL, WAL pragmas no-op on PG), `schema.postgres.prisma` is maintained in parallel, and `rawDate()` keeps raw SQL portable. Full cutover runbook in `POSTGRESQL_MIGRATION_PLAN.md`.

### 1.8 Redis / Workers Readiness — ✅ Dormant-ready, activation documented

BullMQ queues, `workers/index.ts` (health server on :3010, graceful SIGTERM), and `broadcast.worker.ts` exist behind `ENABLE_BULLMQ`. Cron fallback is the current default. Activation runbook in `REDIS_WORKERS_PLAN.md`.

---

## 2. New Endpoints & Scripts — Reference

### `/api/ready` (public, read-only)
```
GET /api/ready            → { ready, verdict: ready|degraded|not_ready, checks[], ... }  (always 200)
GET /api/ready?strict=1   → 503 when verdict=not_ready (for HTTP-only gates / LBs)
```
Checks: `db` (SELECT 1 + latency), `schema` (core table count), `outgoing_queue` (stale/aging backlog → warn). DB/schema failure ⇒ `not_ready`; queue aging ⇒ `degraded`.

### `/api/internal/wa-health` (requires `x-internal-secret`)
```
GET → { status: ok|degraded, reasons[], service{reachable,latencyMs,stats}, queues{outgoing,broadcastQueued,broadcastSending}, metaQuality{green,yellow,red,atRisk}, ... }
```
`degraded` when: whatsapp-service unreachable, outgoing queue stale, or any Meta number YELLOW/RED.

### `npm run verify:reliability` (read-only; safe on live VPS)
Checks: outgoing-queue depth/staleness, broadcast-queue depth, Meta quality (fail on RED), Meta webhook dead-letters, whatsapp-service `/health` (if `WHATSAPP_SERVICE_URL`), `/api/ready` (if `KEYONE_VERIFY_BASE_URL`), backup recency (if `KEYONE_BACKUP_DIR`). Exit non-zero on any `fail`.

### `deploy/verify-backup.ps1`
Restore-tests newest backup. Exit 0 = restorable & recent. Schedule daily after backup.

### `deploy/health-gate.ps1`
```
.\health-gate.ps1                 # poll /api/ready, print rollback cmd on failure
.\health-gate.ps1 -AutoRollback   # auto-invoke rollback.ps1 on sustained failure
.\health-gate.ps1 -StrictDegraded # treat 'degraded' as failure too
```

---

## 3. Hardened Deployment Flow (recommended)

Current safe path is `deploy-safe.ps1` (push → backup → stop → build → start → `/api/health`). The hardened path inserts verification at both ends:

```
1.  deploy/verify-backup.ps1            # PRE: prove yesterday's backup restores
2.  backup-all.ps1                      # PRE: fresh pre-deploy snapshot (existing, auto in deploy.ps1)
3.  git reset --hard origin/main        # (existing)
4.  nssm stop mse-saas                  # (existing)
5.  npm ci && npm run build             # (existing)
6.  npx prisma db push --skip-generate  # (existing, additive)
7.  nssm start mse-saas                  # (existing)
8.  deploy/health-gate.ps1 -AutoRollback # POST: gate on /api/ready, auto-rollback if not ready
9.  npm run verify:reliability           # POST: queue/WA/Meta/backup posture
```

Steps 1, 8, 9 are the additive gates. They do not change *how* the app is built or how messages are sent — they only decide whether to trust the result and how to recover.

### 3.2 Zero-downtime target (future, specified not built)
Blue-green on the single VPS: run `mse-saas-blue` (:3000) and `mse-saas-green` (:3001-app), build/migrate the idle color, run `health-gate.ps1` against it, then flip Caddy `reverse_proxy` upstream and drain the old color. SQLite is shared (single file) so only additive migrations are safe during overlap — which is already the project's rule. Full design belongs in a follow-up; `health-gate.ps1` is the reusable building block.

---

## 4. Verification Results

> Run on the deploy host (typecheck + build) and against the live VPS (verify). See §6 for commands. This section records the intended gate; fill actuals at deploy time.

| Check | Command | Expected |
|-------|---------|----------|
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Build | `npm run build` | success, BUILD_ID emitted |
| Reliability verify | `npm run verify:reliability` | no `fail` (warns acceptable) |
| Readiness (live) | `GET /api/ready` | `ready:true` |
| Backup restore | `deploy/verify-backup.ps1` | exit 0 |

---

## 5. Risk & Rollback

- All additions are **new files** or **append-only** edits (one new verify scope, one new npm script). No existing function signatures changed; no send/queue/billing code touched.
- New endpoints are read-only and fail-closed (internal ones require `x-internal-secret`; `/api/ready` exposes no secrets).
- If any new file misbehaves, deleting it restores prior behavior exactly — `deploy/rollback.ps1` remains the catch-all.

---

## 6. Operator Cheat-Sheet

```bash
# Local / deploy host
cd saas
npx tsc --noEmit                 # typecheck
npm run build                    # build
KEYONE_VERIFY_BASE_URL=https://app.keyone1.com \
KEYONE_BACKUP_DIR=C:/app/backups \
WHATSAPP_SERVICE_URL=http://127.0.0.1:3001 \
  npm run verify:reliability     # reliability gate
```
```powershell
# VPS (PowerShell)
.\deploy\verify-backup.ps1                 # prove backups restore
.\deploy\health-gate.ps1 -AutoRollback     # gate a deploy on /api/ready
```
```bash
# Monitors
curl -s https://app.keyone1.com/api/ready
curl -s -H "x-internal-secret: $SAAS_INTERNAL_SECRET" \
  https://app.keyone1.com/api/internal/wa-health
```

---

## 7. Companion Documents

- `project-knowledge/POSTGRESQL_MIGRATION_PLAN.md`
- `project-knowledge/REDIS_WORKERS_PLAN.md`
- `project-knowledge/META_CLOUD_PRODUCTION_REPORT.md`
