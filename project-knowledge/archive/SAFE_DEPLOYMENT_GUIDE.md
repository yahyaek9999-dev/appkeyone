# Safe Deployment Guide

> For routine deploy commands see `DEPLOYMENT.md`. This file covers the
> **safety procedure** around every deploy.

---

## Pre-deploy checklist (5 min)

- [ ] Local `npx tsc --noEmit -p .` from `saas/` is clean
- [ ] You have a manual test plan for the change
- [ ] You know which files changed (`git status` or a written list)
- [ ] You know whether a `prisma db push` is needed (i.e. did you edit `schema.prisma`?)
- [ ] You have SSH access to `administrator@217.154.163.16` working
- [ ] You verified the VPS is reachable: `ssh administrator@217.154.163.16 "Write-Host READY"`
- [ ] No urgent merchant activity is in progress (check `/admin/safety` for active broadcasts)

---

## Recommended deploy sequence

### Stage A — Local validation

```bash
cd /Users/yahyaemad/Desktop/mse_ai_api-main/saas
npx tsc --noEmit -p .             # type check
node -e "console.log('next config ok')" 2>&1
```

If you're confident, skip a local `npm run build` (the VPS will do it). If
you're unsure about Next.js compile errors, do build locally first.

### Stage B — Upload changed files

```bash
# Identify modified files (example after a change session)
git status -s            # or written list

# Upload one at a time
scp -q saas/lib/notify.ts administrator@217.154.163.16:'C:/app/saas/lib/notify.ts'
scp -q saas/lib/tz.ts     administrator@217.154.163.16:'C:/app/saas/lib/tz.ts'
# … etc …

# Verify
ssh administrator@217.154.163.16 \
  'powershell -Command "Get-ChildItem C:/app/saas/lib/notify.ts | Select LastWriteTime, Length"'
```

### Stage C — Run deploy script

```bash
ssh administrator@217.154.163.16 \
  'powershell -NoProfile -ExecutionPolicy Bypass -File C:\app\deploy\deploy.ps1'
```

This runs the **8 stages** described in `DEPLOYMENT.md`. **DO NOT** disconnect
the SSH session until it prints `DEPLOY SUCCEEDED`.

### Stage D — Post-deploy smoke test

```powershell
# Run remotely (or via ssh)
Get-Service mse-saas, mse-wa, mse-llm, mse-caddy | Select Name, Status
(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode
```

Manually test ONE customer message through the dashboard playground or via
a real WhatsApp send if the change touched the hot path.

---

## Backup flow

`deploy.ps1` stage 1 calls `backup-all.ps1` which:
1. Copies `C:\app\saas\prisma\prod.db` → `pre-deploy-<TS>\saas.db`
2. Copies WhatsApp sessions → `pre-deploy-<TS>\wa-sessions\`
3. Copies all `.env` files → `pre-deploy-<TS>\*.env`
4. Copies `C:\app\saas\prisma\` → `pre-deploy-<TS>\prisma\`
5. Updates pointer: `C:\app\backups\latest.txt`

To skip (NOT recommended): `.\deploy\deploy.ps1 -SkipBackup`

---

## Rollback flow

If the deploy fails OR a smoke test fails:

```powershell
# Quick rollback to latest backup
.\deploy\rollback.ps1

# Or to a specific snapshot
.\deploy\rollback.ps1 -Snapshot C:\app\backups\pre-deploy-2026-05-16_222102
```

The script:
1. Stops `mse-saas` and `mse-wa`
2. Restores `prod.db`, sessions, .env files
3. (Optionally) checks out the schema files
4. Starts services
5. Runs health check

**Test rollback once on a quiet day** — it's the safety net you don't want
to debug during a real incident.

---

## Prisma precautions

### When `schema.prisma` changes

1. Verify the change is **additive** (new nullable column or new column with `@default`).
2. Write a clear migration plan:
   - What field is being added?
   - What's the default?
   - Will existing rows fill correctly?
3. The deploy script will run `prisma db push` automatically. It will refuse if the change is destructive.

### When push refuses

Don't force it. Instead:
1. Backup the DB explicitly: `.\deploy\backup-all.ps1`
2. Investigate the rejected diff: `node node_modules\prisma\build\index.js migrate diff --from-empty --to-schema-datamodel prisma\schema.prisma`
3. Write manual SQL to perform the change safely
4. Apply via `sqlite3 prod.db < migration.sql` after stopping services

---

## Service restart order

When manually restarting (not via `deploy.ps1`):

```powershell
nssm stop mse-saas      # first — releases Prisma DLL lock
nssm stop mse-wa        # second — releases sessions
# (no need to touch mse-llm or mse-caddy normally)

# … make changes (file copy, schema push, build) …

nssm start mse-saas     # first
Start-Sleep -Seconds 3
nssm start mse-wa       # second
```

**Why this order:**
- `mse-saas` holds the Prisma DLL handle. Trying to `prisma generate` or `db push` while running fails on Windows.
- `mse-wa` depends on `mse-saas` being up (for the incoming webhook). Start `saas` first.
- `mse-llm` and `mse-caddy` are usually independent and stay running.

---

## Post-deploy verification (the 6 checks)

```powershell
# 1. All services running
Get-Service mse-* | Select Name, Status     # all should be Running

# 2. SaaS responds
(Invoke-WebRequest http://localhost:3000/login).StatusCode  # 200

# 3. WA gateway healthy
(Invoke-WebRequest http://localhost:3001/health `
   -Headers @{"x-internal-secret"="<SECRET>"}).StatusCode  # 200

# 4. mse-llm reachable (or expected dead — KNOWN_ISSUES.md)
(Invoke-WebRequest http://localhost:7788/v1/models).StatusCode

# 5. Recent errors
Get-Content C:\app\logs\mse-saas.err.log -Tail 30
# expect: no new errors since deploy time

# 6. Live test
# - Open https://app.keyone1.com/dashboard/playground
# - Send a message
# - Verify the bot responds with a real (non-fallback) reply
```

---

## Deploy log practice

Append a one-line entry to `INCIDENT_RESPONSE.md` under "Deploy log" after every deploy:

```
2026-05-17 02:30 UTC — fixed broadcast atomic claim + timezone-aware reports — 10 files — clean
2026-05-17 04:15 UTC — knowledge base + sales metrics — 3 files — clean
```

This helps correlate symptoms to recent changes.

---

## Emergency rollback (the bot is broken NOW)

```powershell
# 1. Roll back
.\deploy\rollback.ps1

# 2. Verify services are running
Get-Service mse-*

# 3. Send a test message via dashboard playground

# 4. If still broken, escalate: check error logs, then file an incident
```

If even rollback fails, escalate to the snapshot before the last good
deploy:
```powershell
Get-ChildItem C:\app\backups\ | Sort LastWriteTime -Desc | Select -First 5
.\deploy\rollback.ps1 -Snapshot C:\app\backups\<older-snapshot>
```
