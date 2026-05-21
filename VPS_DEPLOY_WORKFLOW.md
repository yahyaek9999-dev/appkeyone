# KEYONE — VPS Deploy Workflow

> **Audience:** Developers and administrators deploying to the KEYONE production VPS.  
> **VPS:** `217.154.163.16` (Windows Server) · User: `Administrator` · App dir: `C:\app`  
> **Last updated:** See git log for this file.

---

## Table of Contents

1. [Infrastructure Overview](#1-infrastructure-overview)
2. [Prerequisites](#2-prerequisites)
3. [Pre-Deploy Checklist](#3-pre-deploy-checklist)
4. [Deploy Option A — One-command Deploy (Recommended)](#4-deploy-option-a--one-command-deploy-recommended)
5. [Deploy Option B — Manual Step-by-Step](#5-deploy-option-b--manual-step-by-step)
6. [Post-Deploy Verification](#6-post-deploy-verification)
7. [Rollback Procedure](#7-rollback-procedure)
8. [Service Management Reference](#8-service-management-reference)
9. [When to Use Which Deploy Method](#9-when-to-use-which-deploy-method)
10. [Critical Rules](#10-critical-rules)

---

## 1. Infrastructure Overview

```
┌─────────────────────────────────────────────────────┐
│  VPS: 217.154.163.16 (Windows Server)               │
│  App root: C:\app\                                  │
│                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │  mse-saas (NSSM)     │  │  mse-wa (NSSM)       │ │
│  │  Next.js :3000       │  │  WhatsApp :7799       │ │
│  │  C:\app\saas\        │  │  C:\app\whatsapp-     │ │
│  │                      │  │  service\             │ │
│  └──────────────────────┘  └──────────────────────┘ │
│                                                     │
│  Database: C:\app\saas\prisma\prod.db (SQLite)      │
│  Backups:  C:\app\backups\                          │
│  Logs:     managed by NSSM                         │
└─────────────────────────────────────────────────────┘
```

### Key paths on VPS

| Path | Description |
|------|-------------|
| `C:\app\` | Git repository root |
| `C:\app\saas\` | Next.js application |
| `C:\app\saas\.env` | Production environment variables |
| `C:\app\saas\prisma\prod.db` | Production SQLite database |
| `C:\app\whatsapp-service\` | WhatsApp bridge service |
| `C:\app\deploy\` | Deploy and maintenance scripts |
| `C:\app\backups\` | Timestamped pre-deploy snapshots |
| `C:\app\backups\latest.txt` | Points to most recent snapshot |

### Services managed by NSSM

| Service name | Binary | Port |
|-------------|--------|------|
| `mse-saas` | `next start -p 3000` | 3000 |
| `mse-wa` | `node src/index.js` | 7799 |

---

## 2. Prerequisites

### SSH key for VPS access

You need `~/.ssh/id_ed25519` (the VPS key, separate from the GitHub key).  
Contact the project administrator to get access.

Test your VPS connectivity:

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "echo VPS connection OK"
```

Expected output:
```
VPS connection OK
```

### SSH config shortcut (optional but recommended)

If you added the `keyone-vps` block to `~/.ssh/config` (see `DEVELOPMENT_SETUP.md`):

```bash
ssh keyone-vps "echo VPS connection OK"
```

### What must be ready before deploying

- [ ] All changes committed and pushed to `main` on GitHub
- [ ] Build passes locally: `npm run build` succeeds in `saas/`
- [ ] TypeScript is clean: `npx tsc --noEmit` produces no errors
- [ ] You have tested on `dev` branch and merged to `main`
- [ ] VPS is SSH-accessible

---

## 3. Pre-Deploy Checklist

Run through this checklist **before every production deploy**, no exceptions.

```
PRE-DEPLOY CHECKLIST
====================
[ ] 1. I am on the main branch with all changes merged from dev
[ ] 2. git status shows a clean working tree (nothing uncommitted)
[ ] 3. npm run build passes locally without errors
[ ] 4. npx tsc --noEmit shows no TypeScript errors
[ ] 5. I have SSH access to the VPS
[ ] 6. I know the current production commit hash (for rollback):
        git rev-parse HEAD
[ ] 7. If touching the schema: npx prisma validate passes
[ ] 8. If touching WhatsApp service: I will pass -RestartWhatsApp flag
        (this drops active WA sessions — confirm this is acceptable)
```

Get the current production commit hash before deploying:

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git rev-parse HEAD\""
```

---

## 4. Deploy Option A — One-command Deploy (Recommended)

The recommended deploy command from your development machine is:

`keydeploy`

It runs `deploy/keydeploy.ps1`, which calls `deploy/deploy-safe.ps1` and then `deploy/verify-production.ps1`.

Install the local PowerShell shortcut once:

`pwsh ./deploy/install-keydeploy.ps1`

Restart PowerShell, or reload your profile with `. $PROFILE`, then use:

`keydeploy`

Dry-run without changing production:

`keydeploy -DryRun`

The one-command deploy flow:

1. Confirms local branch is `main`
2. Pushes `main` to GitHub
3. SSHes to the VPS
4. Creates a pre-deploy backup
5. Runs `git pull --ff-only origin main` on the VPS
6. Verifies `saas/.env`
7. Builds the app
8. Restarts `mse-saas`
9. Runs the health check
10. Runs `verify-production.ps1`
11. Prints final PASS/FAIL

## 4b. Deploy Option A2 — VPS-side Script

The `deploy/deploy.ps1` script runs **on the VPS** and handles the full deploy cycle safely:

1. Pre-deploy full backup (DB, sessions, .env files)
2. `git pull --ff-only` from GitHub
3. `npm ci` (clean install)
4. `prisma validate` → `prisma db push` → `prisma generate`
5. TypeScript check (`tsc --noEmit`)
6. Clear `.next/cache` and rebuild
7. Run verification suite (`npm run verify:all`)
8. Restart `mse-saas` (and optionally `mse-wa`)
9. Health check with retries
10. Print rollback command if something goes wrong

### VPS-side Step 1: Push your changes to GitHub

```bash
# On your local machine
git add -A
git commit -m "feat: describe your change here"
git push origin main
```

### Step 2: SSH into the VPS and run the deploy script

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16
```

Once connected (PowerShell on VPS):

```powershell
# Standard deploy (does NOT restart WhatsApp service)
cd C:\app\deploy
.\deploy.ps1

# Deploy with WhatsApp service restart (use only when WA service changed)
.\deploy.ps1 -RestartWhatsApp
```

> ⚠️ **`-RestartWhatsApp` drops all active WhatsApp sessions.** Only use it when you have intentionally changed the `whatsapp-service/` code. Standard Next.js-only deploys should omit this flag.

### Expected successful output

```
============================================
  0/10 Rollback readiness checks
============================================
  Backup script : C:\app\deploy\backup-all.ps1
  Rollback script: C:\app\deploy\rollback.ps1

============================================
  1/10 Pre-deploy full backup
============================================
  Snapshot: C:\app\backups\pre-deploy-2026-01-15_143022

... (steps 2-9) ...

============================================
  10/10 Deploy complete
============================================
DEPLOY SUCCEEDED at 20260115-143022
Rollback snapshot: C:\app\backups\pre-deploy-2026-01-15_143022
Rollback command : C:\app\deploy\rollback.ps1 -InstallDir 'C:\app' -Snapshot 'C:\app\backups\pre-deploy-2026-01-15_143022'
```

---

## 5. Deploy Option B — Manual Step-by-Step

Use this when the automated script is unavailable or you need finer control. Each step maps to a section of `deploy.ps1`.

### Step 1: Commit and push to main

```bash
# Local machine
git add -A
git commit -m "feat: your descriptive message"
git push origin main
```

### Step 2: Backup the VPS before touching anything

```powershell
# On VPS
cd C:\app\deploy
.\backup-all.ps1
# Note the snapshot path printed at the end — you need it for rollback
```

### Step 3: Pull latest code on VPS

```bash
# From your local machine via SSH
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git fetch origin; git reset --hard origin/main 2>&1\""
```

> ⚠️ `git reset --hard` is destructive. **Only run it on the VPS after a confirmed backup.** Never run it without first completing Step 2.

### Step 4: Install dependencies

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app\\saas; npm ci 2>&1\""
```

### Step 5: Prisma sync and client generation

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app\\saas; npx prisma validate; npx prisma db push --skip-generate; npx prisma generate 2>&1\""
```

### Step 6: TypeScript check

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app\\saas; npx tsc -p tsconfig.json --noEmit 2>&1\""
```

### Step 7: Stop service, clear cache, build

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"nssm stop mse-saas; Set-Location C:\\app\\saas; if (Test-Path '.next\\cache') { Remove-Item '.next\\cache' -Recurse -Force }; npm run build 2>&1\""
```

### Step 8: Start service

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"nssm start mse-saas\""
```

### Step 9: Health check

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Start-Sleep 15; Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/api/health -TimeoutSec 20 | Select-Object -ExpandProperty Content\""
```

Expected response:
```json
{"status":"ok","db":"connected","uptime":14,"latencyMs":3}
```

---

## 6. Post-Deploy Verification

After any deploy, verify the application is healthy.

### 6a. Health API

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/api/health -TimeoutSec 20 | Select-Object -ExpandProperty Content\""
```

A healthy response:
```json
{"status":"ok","db":"connected","uptime":20,"latencyMs":5}
```

An unhealthy response (requires investigation):
```json
{"status":"error","db":"disconnected"}
```

### 6b. Service status check

```bash
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"nssm status mse-saas; nssm status mse-wa\""
```

Both should show `SERVICE_RUNNING`.

### 6c. Run the extended smoke test

From the VPS (PowerShell):

```powershell
cd C:\app\deploy
.\smoke-test.ps1
```

This tests all major API endpoints, including auth-gated routes and internal cron endpoints.

### 6d. Full health check script

```powershell
cd C:\app\deploy
.\health-check.ps1
```

### 6e. Manual browser check

Open the public URL and confirm:
- Dashboard loads without errors
- WhatsApp status is connected (if applicable)
- No JavaScript console errors on first load

---

## 7. Rollback Procedure

### Option A — Automated rollback (recommended)

The automated rollback restores the DB, env files, sessions, and rebuild from a snapshot.

From the VPS (PowerShell):

```powershell
cd C:\app\deploy

# Rollback to the most recent snapshot (reads C:\app\backups\latest.txt)
.\rollback.ps1

# Rollback to a specific snapshot
.\rollback.ps1 -Snapshot "C:\app\backups\pre-deploy-2026-01-15_143022"

# Rollback to a specific snapshot AND reset git to a specific commit
.\rollback.ps1 -Snapshot "C:\app\backups\pre-deploy-2026-01-15_143022" -GitCommit "abc1234"
```

The rollback script performs:
1. Stop `mse-saas` and `mse-wa`
2. Restore `prod.db` from snapshot (wipes stale WAL/SHM)
3. Restore `.env` files
4. Restore WhatsApp sessions via `robocopy`
5. Restore uploads/media directories
6. Restore `prisma/` schema and migrations
7. Optional: `git reset --hard` to specified commit
8. `prisma generate` + `npm run build`
9. Restart services + health check

### Option B — Git revert (for code-only rollback, no DB changes)

When the deploy introduced a code bug but did not change the DB schema:

```bash
# On local machine
git revert HEAD           # creates a new revert commit
git push origin main      # push the revert

# Then re-deploy using the normal deploy process
```

> ✅ `git revert` is safe — it creates a new commit that undoes the previous one. The history is preserved. **Use this in preference to `git reset --hard` on `main`.**

### Option C — Emergency git rollback on VPS

Only use this if automated rollback has failed and you know the exact commit to return to:

```bash
# 1. Get available commits
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git --no-pager log --oneline -10\""

# 2. Reset to a known-good commit (DESTRUCTIVE — only after backup)
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app; git reset --hard <COMMIT_HASH>\""

# 3. Rebuild
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Set-Location C:\\app\\saas; npx prisma generate; npm run build\""

# 4. Restart
ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"nssm restart mse-saas\""
```

> ⚠️ Replace `<COMMIT_HASH>` with the actual commit hash from step 1 — never guess or use a placeholder.

---

## 8. Service Management Reference

All commands run in PowerShell on the VPS (via SSH or direct login).

### Check service status

```powershell
nssm status mse-saas
nssm status mse-wa
```

### Start / stop / restart services

```powershell
nssm start   mse-saas
nssm stop    mse-saas
nssm restart mse-saas

nssm start   mse-wa
nssm stop    mse-wa
nssm restart mse-wa
```

### View service logs

```powershell
# NSSM stores stdout/stderr logs — find them with:
nssm get mse-saas AppStdout
nssm get mse-saas AppStderr
```

### Check what is listening on port 3000

```powershell
netstat -ano | findstr :3000
```

### Kill a stuck process by PID

```powershell
taskkill /F /PID <PID>
```

---

## 9. When to Use Which Deploy Method

| Situation | Method |
|-----------|--------|
| Standard code change (Next.js only) | **Option A** — `deploy.ps1` |
| WhatsApp service also changed | **Option A** — `deploy.ps1 -RestartWhatsApp` |
| Quick hotfix, automation unavailable | **Option B** — Manual step-by-step |
| Something broke post-deploy, DB unchanged | **Option B (rollback)** — `git revert HEAD` |
| Something broke post-deploy, DB changed | **Option A (rollback)** — `rollback.ps1` |
| Catastrophic failure, scripting broken | **Option C** — Manual git reset on VPS |
| Schema migration (Prisma) | **Option A** — `deploy.ps1` (handles `db push`) |

**Default choice: always use `deploy.ps1`.**  
Manual steps exist for emergency situations only.

---

## 10. Critical Rules

> These rules exist because violations have caused or can cause production data loss.

### MUST DO

- ✅ **Always run a backup before any destructive VPS operation** (`backup-all.ps1`)
- ✅ **Always deploy from `main` branch only** — never deploy dev or feature branches
- ✅ **Always verify the health endpoint after deploy** (`/api/health`)
- ✅ **Always note the pre-deploy snapshot path** — the rollback command is printed at the end of `deploy.ps1`
- ✅ **Merge dev → main via PR** before deploying

### MUST NOT DO

- ❌ **Never run `git reset --hard` on the VPS without a prior backup** — this can permanently delete uncommitted production data or DB files
- ❌ **Never edit `C:\app\saas\.env` manually mid-deploy** — use the backup/restore cycle
- ❌ **Never push directly to `main` without testing on `dev`**
- ❌ **Never restart `mse-wa` without planning for session loss** — all active WhatsApp sessions will be dropped
- ❌ **Never commit `.env`, `sessions/`, `.deployment-secrets.txt`, or `*.db` files to git**
- ❌ **Never skip the health check** — a silent build failure can serve a broken app to users

---

> **Related docs:** `DEVELOPMENT_SETUP.md` for local setup · `SAFE_GIT_WORKFLOW.md` for branch strategy
