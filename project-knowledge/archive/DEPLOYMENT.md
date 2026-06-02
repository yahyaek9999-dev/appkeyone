# Deployment

> For detailed safe-deploy / rollback procedures see `SAFE_DEPLOYMENT_GUIDE.md`.

## Production target

- Host: `217.154.163.16` (Windows Server)
- User: `administrator`
- Install dir: `C:\app`
- Services (NSSM): `mse-saas`, `mse-wa`, `mse-llm`, `mse-caddy`
- Public URL: `https://app.keyone1.com`
- Backups: `C:\app\backups\pre-deploy-<TS>\` (created by `deploy.ps1`)

## How code gets to the VPS

There is **no CI/CD pipeline**. Two paths exist:

### Path A — `scp` + manual deploy (what we use today)

From local Mac:
```bash
# upload modified files
scp saas/lib/notify.ts administrator@217.154.163.16:'C:/app/saas/lib/notify.ts'
# … repeat per file …

# run the deploy script remotely
ssh administrator@217.154.163.16 \
  'powershell -NoProfile -ExecutionPolicy Bypass -File C:\app\deploy\deploy.ps1'
```

⚠️ **Caveats:**
- SSH session can disconnect mid-build (Next.js build is 2-5 min). If that happens, see Recovery below.
- `npm run build` invokes `prisma generate && next build`. The `prisma` binary is not on PATH in some shells. The `deploy.ps1` script handles it via `npx prisma`; manual `npm run build` from a raw PowerShell may fail. **Workaround:** invoke binaries directly:
  ```powershell
  cd C:\app\saas
  node node_modules\prisma\build\index.js generate
  node node_modules\prisma\build\index.js db push
  node node_modules\next\dist\bin\next build
  ```

### Path B — git pull

```powershell
.\deploy\deploy.ps1 -GitPull
```
Requires `C:\app` to be a git working copy with a clean fast-forward path. **Not currently used in production** because edits are uploaded individually.

## `deploy.ps1` — 8 stages

| # | Stage | What it does |
|---|---|---|
| 0 | Pre-flight | Verifies dirs + all 4 NSSM services registered |
| 1 | Backup | Runs `backup-all.ps1` → snapshot of DB, WA sessions, .env, prisma schema |
| 2 | Git pull | Only when `-GitPull` flag is passed |
| 3 | Stop services | `nssm stop mse-saas`, `mse-wa` (releases Prisma DLL lock) |
| 4 | npm ci | Only if `package*.json` changed since last deploy |
| 5 | Prisma | `npx prisma generate` + `npx prisma db push` (additive only) |
| 6 | Build | `npm run build` (next build) |
| 7 | Start services | `nssm start mse-saas`, `mse-wa`; 12s stabilize |
| 8 | Health check | `health-check.ps1` |

**Failure semantics:** any stage failing → abort + print rollback command + exit code 1.

## Backups

- Created automatically by stage 1 of `deploy.ps1`.
- Contents (`backup-all.ps1`):
  - `saas.db` — copy of `prisma/prod.db`
  - `wa-sessions/` — all WhatsApp session folders
  - `saas.env`, `whatsapp-service.env` — env files
  - `prisma/` — full prisma directory (schema + history)
- Path: `C:\app\backups\pre-deploy-YYYY-MM-DD_HHMMSS\`
- Latest pointer: `C:\app\backups\latest.txt`

## Rollback

```powershell
.\deploy\rollback.ps1                            # use latest backup
.\deploy\rollback.ps1 -Snapshot C:\app\backups\pre-deploy-2026-05-16_222102
```

Restores DB + sessions + envs + prisma; restarts services.

## Recovery from a broken deploy

If you see "Step was canceled" or SSH disconnected mid-deploy:

```bash
# 1. Check service state
ssh administrator@217.154.163.16 \
  'powershell -Command "Get-Service mse-saas, mse-wa, mse-llm, mse-caddy | Select Name, Status"'

# 2. Continue from where deploy.ps1 stopped (typical case: build was incomplete)
ssh administrator@217.154.163.16 'powershell -Command "Set-Location C:\app\saas; & node node_modules\prisma\build\index.js generate; & node node_modules\prisma\build\index.js db push"'

ssh administrator@217.154.163.16 'powershell -Command "Set-Location C:\app\saas; & node node_modules\next\dist\bin\next build"'

# 3. Restart
ssh administrator@217.154.163.16 'powershell -Command "& nssm start mse-saas; Start-Sleep 2; & nssm start mse-wa"'

# 4. Verify
ssh administrator@217.154.163.16 \
  'powershell -Command "(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode"'
# expect: 200
```

## Cron tasks (scheduled tasks)

Installed once, then they run autonomously:

```powershell
.\deploy\install-broadcasts-task.ps1   # POST /api/cron/broadcasts  every 1 min
.\deploy\install-followup-task.ps1     # POST /api/cron/follow-ups  every 30 min
# daily-report uses the same scheduler trigger as follow-ups but at hourly cadence;
# the route filters by bot.dailyReportHour itself.
```

Each task supplies `X-Internal-Secret` via the body of the call.

## Smoke verification post-deploy

```powershell
# 1. all services running
Get-Service mse-* | Select Name, Status

# 2. SaaS responds
(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode  # → 200

# 3. WhatsApp gateway healthy
(Invoke-WebRequest http://localhost:3001/health -Headers @{"x-internal-secret"="<secret>"}).Content

# 4. mse-llm reachable (or expected dead — see audits)
(Invoke-WebRequest http://localhost:7788/v1/models -UseBasicParsing).StatusCode

# 5. Schema in sync — no Prisma errors in logs
Get-Content C:\app\logs\mse-saas.err.log -Tail 30
```

## Schema migrations

This project uses **additive-only** `prisma db push` (never `migrate dev` in prod).

When adding a field:
1. Add to `saas/prisma/schema.prisma` with a default value (so existing rows fill automatically).
2. Deploy. `deploy.ps1` will run `prisma db push` in stage 5.
3. Verify no destructive prompt was triggered (push refuses on data-loss).

**Never** rename or drop a column without a manual SQL migration + backup test.
