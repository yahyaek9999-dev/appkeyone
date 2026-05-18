# Deployment Audit

> Date: 2026-05-17 (after the live deploy of timezone + KB + sales metric fixes).

## How code reaches production today

### Path A: `scp` + manual `deploy.ps1`
- Engineer edits files on local Mac
- `scp` each changed file to `C:/app/saas/...`
- SSH and run `powershell -File C:\app\deploy\deploy.ps1`
- Total deploy time: ~5-10 minutes (mostly Next.js build)

### Path B: `git pull` + `deploy.ps1 -GitPull` (not currently used)
- Requires `C:\app` to be a clean git working copy
- Engineer commits + pushes
- VPS runs `deploy.ps1 -GitPull`
- Currently NOT used because edits are uploaded individually

## What `deploy.ps1` does (8 stages)

Source: `deploy/deploy.ps1` (206 lines).

| # | Stage | Time |
|---|---|---|
| 0 | Pre-flight | <1s |
| 1 | Backup (DB + sessions + .env + prisma) | 5-15s |
| 2 | Optional `git pull` | varies |
| 3 | Stop `mse-saas` + `mse-wa` (releases Prisma DLL) | ~5s |
| 4 | `npm ci` if package.json changed | 30-60s (cached) |
| 5 | `prisma generate` + `prisma db push` | 5-10s |
| 6 | `next build` | 2-5 min ← dominant |
| 7 | Start services + 12s stabilize | ~15s |
| 8 | `health-check.ps1` (if present) | 5s |
| **Total** | | **3-8 min** |

## Strengths

### ✅ Backup is the first thing it does
Before any destructive operation (`db push`, `next build` overwriting `.next/`), a full snapshot is taken to `C:\app\backups\pre-deploy-<TS>\`. Rollback is just `.\rollback.ps1`.

### ✅ Service stop ordering is correct
`mse-saas` stops first (releases the Prisma DLL handle, allows `prisma db push`). Then `mse-wa`. On start, the reverse: `mse-saas` first (so the wa-service has a `/api/whatsapp/incoming` endpoint to call back).

### ✅ Schema push refuses destructive changes
`prisma db push` (without `--accept-data-loss`) refuses to drop/rename columns. Forces operator attention.

### ✅ Health check at the end
If present, runs the smoke check before reporting success. (Verify: `health-check.ps1` is referenced but its quality should be audited.)

## Weaknesses

### 🟡 SSH disconnects mid-build
Build takes 2-5 min. SSH keepalive may disconnect during this window. If so, the deploy continues on the VPS but the operator loses visibility. Recovery is documented in `DEPLOYMENT.md`.

**Mitigation idea:** wrap deploy in `Start-Transcript` to a log file, then poll the log from the local Mac.

### 🟡 No CI/CD
- No GitHub Actions
- No tests run before deploy
- No staging environment
- Every deploy is "deploy to prod"

**Recommendation (medium-term):**
1. Add a `staging` branch + a second small VPS as staging
2. GitHub Actions: on push to `main`, run `npx tsc --noEmit` + (eventual) jest, then auto-deploy to staging
3. Manual promote to prod

### 🟡 Manual rollback testing
`rollback.ps1` exists but its real-world test cadence is unclear. **Best practice:** test rollback on a quiet day at least quarterly.

### 🟡 `npm run build` doesn't work in raw PowerShell
`npm run build` invokes `prisma generate && next build`. The `prisma` binary lookup fails outside of npm's PATH-extending behavior in some shells. Workaround is documented; `deploy.ps1` itself uses `npx prisma`.

**Fix idea:** change `package.json` build script to `npx prisma generate && next build` — but this hasn't been tested.

### 🟡 Service start delay is hard-coded
`Start-Sleep 12` after starting services. Hopes services are ready. Better: poll `(Invoke-WebRequest /login).StatusCode` until 200 or timeout.

### 🔴 No prod metrics for deploy success
- We don't track: deploy duration, failure rate, time-to-rollback
- All visibility is in the operator's terminal session

**Recommendation:** add a tiny `DeployEvent` table or append-line log so we can chart this over time.

## Cron task installation audit

Two scheduled tasks installed via `install-broadcasts-task.ps1` and `install-followup-task.ps1`. Run as `SYSTEM` with `RunLevel Highest`. Repetition: `1 min` (broadcasts), `30 min` (follow-ups). Daily-report shares the follow-up scheduler trigger.

**Concerns:**
- No alert if task is disabled — discovered only by symptoms
- `LastTaskResult` is rarely checked

**Recommendation:** add a hourly cron check inside SaaS that verifies recent `bump("cron_broadcast_run")` exists; if not, alert via SafetyAudit.

## Backup audit

`backup-all.ps1`:
- Copies `prod.db` via `Copy-Item` (locking risk if mse-saas is running — but we stop it first)
- Copies WA sessions directory wholesale (~500 MB at full load)
- Copies env files
- Copies prisma directory
- Writes pointer at `latest.txt`

**Strengths:** complete, simple, restorable.

**Weaknesses:**
- No off-VPS backup — losing the VPS = losing all backups
- No retention policy — backups accumulate forever (3GB+ over months)
- No checksum verification

**Recommendation:** add a weekly `Robocopy` to a separate cloud target (S3 or BackBlaze).

## Rollback audit

`rollback.ps1`:
- Stops services
- Restores DB, sessions, env files
- Restores prisma schema (NOT the actual `prod.db` table schema — only the schema file)
- Restarts services

**Note:** rolling back the `.prisma/schema.prisma` file alone doesn't rollback the **DB schema** if a `db push` migrated it. **Manual SQL** is needed if the DB has columns added that the rolled-back code doesn't know about. Prisma will tolerate extra columns (just ignores them), so most rollbacks work. **Documented gotcha.**

## Recommended improvements (ranked)

1. **Health check polling** instead of `Start-Sleep 12` (10 lines of PowerShell).
2. **Off-VPS backup** via scheduled robocopy. Critical for disaster recovery.
3. **Deploy event log** (small DB table or log file).
4. **Staging environment** — even a 2GB VPS would be enough.
5. **GitHub Actions** for `npx tsc --noEmit` on every PR.
6. **Cron health monitoring** with SafetyAudit alerts.
7. **Test rollback quarterly** — add to ops calendar.
8. **Document AUTH_SECRET rotation procedure** — including how to re-encrypt all `Bot.aiApiKeyEnc` values.

## Deploy log template (going forward)

Use `INCIDENT_RESPONSE.md` "Deploy log" section. Each entry:

```
YYYY-MM-DD HH:MM UTC — <one-line summary> — <N files> — <clean | issues>
```

Last entries (May 2026):
```
2026-05-17 02:30 — broadcast atomic claim + tz fix + KB top-K — 10 files — clean
2026-05-17 04:15 — knowledge base wiring + sales metrics — 3 files — clean
```
