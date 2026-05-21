# KEYONE Troubleshooting Guide

This guide covers common production and development issues for KEYONE.

Production safety rule: diagnose first, back up before destructive actions, and do not touch WhatsApp sessions/auth unless required.

---

## Fast health checks

From repository root:

- `pwsh ./deploy/verify-production.ps1`
- `keydeploy -DryRun`

Direct VPS health:

- `ssh -i ~/.ssh/id_ed25519 Administrator@217.154.163.16 "powershell -Command \"Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/api/health -TimeoutSec 20\""`

Expected production state:

- `mse-saas`: `SERVICE_RUNNING`
- `mse-wa`: `SERVICE_RUNNING`
- health endpoint: HTTP `200`
- DB status: `ok`
- VPS branch: `main`
- VPS git status: clean

---

## `keydeploy` fails at GitHub push

Symptoms:

- `Permission denied (publickey)`
- `Could not read from remote repository`

Checks:

- `ssh -T git@github.com`
- `git remote -v`

Expected remote:

- `git@github.com:yahyaek9999-dev/appkeyone.git`

Fix:

1. Ensure your GitHub SSH key is in `~/.ssh/config`.
2. Add the public key to GitHub.
3. Re-test with `ssh -T git@github.com`.

---

## `keydeploy` fails on VPS `git fetch` / `git pull`

Symptoms:

- VPS says `Permission denied (publickey)`.
- VPS cannot fetch from GitHub.

Checks:

- SSH to VPS.
- Run `ssh -T git@github.com` from the VPS.
- Confirm `C:\Users\Administrator\.ssh\config` points to the correct GitHub key.

Fix:

1. Add the VPS deploy public key to GitHub deploy keys, or install an authorized key on the VPS.
2. Confirm VPS remote is SSH, not HTTPS/PAT.
3. Run `git fetch origin` from `C:\app`.

---

## VPS git status is dirty

Do not run blind `git reset --hard` on production.

Safe approach:

1. Run `C:\app\deploy\backup-all.ps1` on the VPS.
2. Save `git diff --binary` and `git status --porcelain` to a backup folder.
3. Archive untracked files that conflict with GitHub.
4. Only then reconcile to `origin/main`.

If uncertain, stop and inspect the files.

---

## Build fails on VPS

Checks:

- `cd C:\app\saas`
- `npm install`
- `npx prisma generate`
- `npx tsc --noEmit`
- `npm run build`

Common causes:

- missing or invalid `saas/.env`
- Prisma schema mismatch
- TypeScript error
- insufficient disk space
- stale `.next/cache`

Safe fix:

1. Keep `mse-saas` running if possible.
2. Build manually to capture the exact error.
3. Fix code locally and push.
4. Re-run `keydeploy`.

---

## Health endpoint fails after deploy

Checks:

- `nssm status mse-saas`
- `Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/api/health -TimeoutSec 20`
- inspect NSSM stdout/stderr logs

Safe recovery:

1. Try `nssm start mse-saas` if stopped.
2. If build deployed bad code, revert with GitHub + `keydeploy`.
3. If data/env is damaged, use `deploy/rollback.ps1` with a known-good snapshot.

---

## WhatsApp service issues

Do not delete or overwrite sessions/auth folders.

Checks:

- `nssm status mse-wa`
- `Get-Process node`
- WhatsApp service logs

Safe actions:

- Restart `mse-wa` only if necessary.
- Preserve `whatsapp-service/sessions` and `.wwebjs_*` data.
- Back up sessions before any runtime migration.

---

## Rollback simulation

On the VPS:

- `C:\app\deploy\rollback.ps1 -ListOnly`
- `C:\app\deploy\rollback.ps1 -DryRun`

These commands inspect rollback readiness without stopping services or modifying files.

---

## Secret leak response

If a token or secret is committed:

1. Revoke/rotate the secret immediately.
2. Remove it from the repository.
3. Audit logs and GitHub access.
4. Treat chat-pasted tokens as compromised.

Never use GitHub PATs inside remote URLs. Use SSH remotes only.
