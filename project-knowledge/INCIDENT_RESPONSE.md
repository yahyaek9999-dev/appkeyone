# Incident Response

> Use this when something is broken in production right now.

## 🚨 Severity quick reference

| Symptom | Severity | First action |
|---|---|---|
| All merchants' bots silent | P0 | Check `mse-saas` + `mse-llm` services |
| One merchant's bot silent | P1 | Check their session in `/sessions/stats` |
| Broadcast not sending | P1 | Check cron task + recent `SafetyAudit` |
| Order alerts not arriving | P2 | Check `SafetyAudit (category=notify)` |
| Wrong AI replies (off-brand) | P2 | Check provider, KB, prompt |
| UI slow / 500 errors | P1 | Check `mse-saas.err.log` |

---

## P0 — Total outage (≤ 15 min to restore)

### Step 1 — Triage (2 min)
```powershell
ssh administrator@217.154.163.16
Get-Service mse-* | Select Name, Status
```

If any service is `Stopped`:
```powershell
nssm start mse-saas
nssm start mse-wa
# wait 10s
Get-Service mse-* | Select Name, Status
```

### Step 2 — Live test (1 min)
```powershell
(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode
# expect 200
```

### Step 3 — If still broken: rollback (5 min)
```powershell
cd C:\app
.\deploy\rollback.ps1
```

### Step 4 — Inspect logs while rollback runs
```powershell
Get-Content C:\app\logs\mse-saas.err.log -Tail 50
```

Common causes:
- Build artifact corrupted → rebuild needed
- Prisma client out of sync → `npx prisma generate` + restart
- Disk full → `Get-PSDrive` to check

### Step 5 — Communicate
- Post to ops channel: time, scope, root cause (if known), ETA
- After resolution: write a one-paragraph postmortem under "Deploy log" below

---

## P1 — Single-merchant issue

### Bot not replying
1. Check session: `GET /sessions/stats` — is their session `ready`?
2. If `disconnected` → merchant must re-scan QR from dashboard.
3. If `ready` but no replies → check their bot row:
   ```sql
   SELECT aiProvider, whatsappStatus, dailyMsgsUsed, dailyMessageCap
   FROM Bot WHERE userId='<id>'
   ```
4. Check `SafetyState`: `killSwitchActive`? `cooldownUntil`?

### Broadcast not sending
1. Check broadcast status: `SELECT status, sent, failed, total FROM Broadcast WHERE id='<id>'`
2. Items stuck in `sending`? Next cron tick will release them.
3. Items all `failed`? Check `BroadcastItem.error` for upstream cause (often `No LID for user`).
4. Check the cron task: `Get-ScheduledTask -TaskName "*Broadcast*"`

---

## Known incident patterns

### Pattern 1: `mse-llm` death spiral

**Triggered:** When ChatGPT web session expires.
**Symptom:** All `keyone`-using merchants get fallback replies; `mse-llm` logs show `Application shutdown complete.`

**Resolution playbook:**
1. RDP to VPS
2. Open `C:\app\chrome-profile` in real Chrome
3. Visit `chatgpt.com`, log in
4. Close Chrome
5. `nssm restart mse-llm`
6. Test: `(Invoke-WebRequest http://localhost:7788/v1/models).StatusCode` → 200

**Prevention:** migrate merchants to external providers (`AI_PROVIDERS.md`).

### Pattern 2: Broadcast duplicate sends

**Resolved May 2026** by atomic claim. If you see this again:
1. Confirm the atomic claim is still in place: `grep "updateMany" C:\app\saas\app\api\cron\broadcasts\route.ts`
2. Check for accidentally-removed claim block (lines ~104-112)
3. If removed: emergency rollback. See `REGRESSION_RISKS.md`.

### Pattern 3: Customer gets bot reply but bot says "I'm out of office"

**Cause:** `Bot.timezone` is wrong or working hours JSON is malformed.

**Fix:** verify with `SELECT timezone, workingHours FROM Bot WHERE userId=...`. Reset via `/dashboard/working-hours` UI.

### Pattern 4: `Prisma P2021 table does not exist`

**Cause:** schema drift. Code expects a field DB doesn't have.

**Fix:**
```powershell
.\deploy\backup-all.ps1
cd C:\app\saas
node node_modules\prisma\build\index.js db push
nssm restart mse-saas
```

---

## Postmortem template

After any P0/P1, write a note here:

```
## YYYY-MM-DD — short title
**Severity:** P0
**Duration:** 14 min (HH:MM UTC → HH:MM UTC)
**User impact:** ~3 active merchants saw fallback replies
**Root cause:** mse-llm session expired
**Fix:** RDP login + service restart
**Prevention:** add a hourly canary that hits /v1/models and alerts on 5xx
```

---

## Deploy log

(Append the latest deploy here so future incidents can correlate.)

```
2026-05-17 02:30 UTC — broadcast atomic claim + tz fix + KB top-K — 10 files — clean
2026-05-17 04:15 UTC — knowledge base wiring + sales metrics — 3 files — clean
```

---

## Useful commands cheat-sheet

```powershell
# Service status
Get-Service mse-*

# Restart in order
nssm restart mse-saas; Start-Sleep 3; nssm restart mse-wa

# Tail logs
Get-Content C:\app\logs\mse-saas.err.log -Tail 50 -Wait

# Recent audit events
node -e "const p=new(require('@prisma/client').PrismaClient)(); p.safetyAudit.findMany({orderBy:{createdAt:'desc'},take:20}).then(r=>console.log(JSON.stringify(r,null,2)))" --cwd C:\app\saas

# Active WA sessions
Invoke-WebRequest http://localhost:3001/sessions/stats -Headers @{"x-internal-secret"="<SECRET>"}

# Open Prisma Studio (admin GUI for DB)
cd C:\app\saas
node node_modules\prisma\build\index.js studio
```
