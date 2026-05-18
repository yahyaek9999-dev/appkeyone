# Prompt: Deployment

> Use when the user asks you to deploy changes to production.

---

You are deploying changes to **KEYONE** production.

## Pre-flight (mandatory)

Read these first:
1. `/project-knowledge/DEPLOYMENT.md`
2. `/project-knowledge/SAFE_DEPLOYMENT_GUIDE.md`

## Pre-deploy checks

Before any `scp` or `ssh`:

1. **List changed files.** Run `git status -s` (or maintain a written list).
2. **Type-check locally:** `npx tsc --noEmit -p .` from `saas/`. Must be 0 errors.
3. **Identify schema changes.** Did you edit `saas/prisma/schema.prisma`? If yes:
   - Confirm the change is additive (new nullable column or new column with `@default`).
   - If destructive (rename/drop), STOP and propose a manual migration plan.
4. **Identify env changes.** Did you edit `.env` or `deploy/env.*.example`? If yes, the deploy must NOT overwrite the prod env. `scp` env files only if the user explicitly asks.

## Deploy sequence

1. **Verify SSH access:**
   ```bash
   ssh -o ConnectTimeout=8 administrator@217.154.163.16 'Write-Host READY'
   ```

2. **Upload each changed file:**
   ```bash
   scp -q <local_path> administrator@217.154.163.16:'C:/app/<remote_path>'
   ```

3. **Verify uploads:**
   ```bash
   ssh administrator@217.154.163.16 \
     'powershell -Command "Get-ChildItem <remote_file_paths> | Select LastWriteTime, Length, Name"'
   ```
   Check that LastWriteTime is recent for ALL files.

4. **Run deploy script:**
   ```bash
   ssh administrator@217.154.163.16 \
     'powershell -NoProfile -ExecutionPolicy Bypass -File C:\app\deploy\deploy.ps1'
   ```
   Use Blocking=false with WaitMsBeforeAsync=5000 because the build takes 2-5 min and SSH may disconnect.

5. **If SSH disconnects mid-build:**
   ```bash
   # Check service state
   ssh ... 'powershell -Command "Get-Service mse-* | Select Name, Status"'

   # If saas/wa are stopped, finish manually:
   ssh ... 'powershell -Command "Set-Location C:\app\saas; & node node_modules\prisma\build\index.js generate; & node node_modules\prisma\build\index.js db push"'
   ssh ... 'powershell -Command "Set-Location C:\app\saas; & node node_modules\next\dist\bin\next build 2>&1 | Select -Last 10"'
   ssh ... 'powershell -Command "& nssm start mse-saas; Start-Sleep 3; & nssm start mse-wa"'
   ```

6. **Smoke test:**
   ```bash
   ssh ... 'powershell -Command "Get-Service mse-* | Select Name, Status"'
   ssh ... 'powershell -Command "(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode"'
   ```
   Expect all services `Running` and status code `200`.

## Failure handling

If anything fails:
- **Service down after restart** → `Get-Content C:\app\logs\mse-saas.err.log -Tail 50` to investigate.
- **Build failed** → rollback: `ssh ... 'powershell -File C:\app\deploy\rollback.ps1'`.
- **Schema push refused** → STOP. Discuss with user before doing anything else.

## Post-deploy

1. Append a deploy log line to `/project-knowledge/INCIDENT_RESPONSE.md`:
   ```
   YYYY-MM-DD HH:MM UTC — <summary> — <N> files — clean
   ```

2. Suggest manual smoke tests from `/project-knowledge/TESTING_CHECKLIST.md`:
   - Send a real WhatsApp message
   - Check `/admin/safety` for new audit rows
   - Check `/admin/metrics` for `llm_call` count incrementing

## Rules

- **DO NOT** deploy `.env` or secret files without explicit user consent.
- **DO NOT** skip the backup stage (`-SkipBackup`) unless retrying after a backup failure.
- **DO NOT** push to prod on a Friday evening without urgent need.
- **DO NOT** deploy multiple changes in one go without testing each.

---

Which files should I deploy?
