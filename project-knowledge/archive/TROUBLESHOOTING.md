# Troubleshooting

## Quick triage: "the bot is silent"

Run these in order (PowerShell on VPS or via SSH):

```powershell
# 1. Services up?
Get-Service mse-saas, mse-wa, mse-llm, mse-caddy | Select Name, Status

# 2. SaaS responding?
(Invoke-WebRequest http://localhost:3000/login -UseBasicParsing).StatusCode  # → 200

# 3. WA gateway responding?
(Invoke-WebRequest http://localhost:3001/health -Headers @{"x-internal-secret"="<SECRET>"}).Content
# → { "ok": true, "sessions": [...] }

# 4. LLM proxy responding?
(Invoke-WebRequest http://localhost:7788/v1/models).StatusCode  # → 200 if alive

# 5. Database accessible?
node -e "require('@prisma/client'); console.log('prisma ok')" --cwd C:\app\saas

# 6. Recent errors?
Get-Content C:\app\logs\mse-saas.err.log -Tail 50
Get-Content C:\app\logs\mse-wa.err.log -Tail 50
Get-Content C:\app\logs\mse-llm.err.log -Tail 50
```

---

## Symptom: customers get `"عذراً، يبدو أن هناك خلل تقني مؤقت"`

**Cause:** LLM call failed. Either:
1. `mse-llm` is dead (most common) — see `KNOWN_ISSUES.md` Issue #1.
2. The merchant's external provider key is invalid/expired.
3. Provider rate limit hit.

**Fix:**
```powershell
# Check which provider this merchant uses
node -e "
const p = new (require('@prisma/client').PrismaClient)();
p.user.findFirst({where:{email:'merchant@x.com'}, include:{bot:true}}).then(u=>console.log(u.bot.aiProvider, u.bot.aiModel))
" --cwd C:\app\saas
```

If `keyone` → restart mse-llm (see Known Issues).
If external → test the key via `/dashboard/settings/ai-provider` → "اختبار الاتصال".

---

## Symptom: WhatsApp QR keeps reappearing

**Cause:** session lost authentication or LocalAuth folder corrupted.

**Fix:**
1. Stop `mse-wa`: `nssm stop mse-wa`
2. Delete the session folder: `Remove-Item -Recurse C:\app\whatsapp-service\sessions\session-{userId}\`
3. Start `mse-wa`: `nssm start mse-wa`
4. Merchant must scan QR again from `/dashboard/whatsapp`.

---

## Symptom: broadcast sends nothing / stays "queued"

**Cause checklist:**
1. Is the scheduled task running? `Get-ScheduledTask -TaskName "KEYONE-Broadcasts" | Select State`. State should be `Ready`.
2. Is `mse-saas` healthy? See triage above.
3. Are there pending items? `SELECT status, COUNT(*) FROM BroadcastItem WHERE broadcastId='<id>' GROUP BY status` (via Prisma Studio).
4. Is the broadcast canceled? `SELECT status FROM Broadcast WHERE id=...`

If items are stuck in `sending` for >5 min → next cron tick auto-releases them (see `BROADCAST_SYSTEM.md`).

---

## Symptom: order alerts not arriving on merchant's phone

**Cause checklist:**
1. `Bot.alertEnabled` is true?
2. Phone resolution returns SOMETHING? Open `/admin/safety` and filter by `category=notify`. The audit row will say why.
3. Self-send guard hit? Audit will show: *"رقم تنبيه الطلبات هو نفس رقم الواتساب المتصل بالبوت."*
4. `Bot.orderKeywords` actually matched the message? Send a test message containing `"اوردر"` literally.

---

## Symptom: `Prisma Client error P2021 (table doesn't exist)`

**Cause:** schema drift. Code expects a column/table that's not in `prod.db`.

**Fix:**
```powershell
.\deploy\backup-all.ps1
cd C:\app\saas
node node_modules\prisma\build\index.js db push
nssm restart mse-saas
```

If push refuses with "destructive change" → manual SQL migration needed.
**Do not** drop tables/columns to bypass. Restore from backup if confused.

---

## Symptom: anti-ban cooldown blocking too aggressively

**Cause:** rolling risk score above threshold + warmup stage day1/day2_3 caps low.

**Fix:**
1. Check current state:
```sql
SELECT warmupStage, riskScore, killSwitchActive, cooldownUntil
FROM SafetyState WHERE userId = '<id>'
```
2. If kill switch is on → admin clear via `POST /api/safety/clear` (or `SafetyAudit` shows the trigger).
3. If risk is high but no kill → wait for natural decay (`riskUpdatedAt` is recent).
4. **Do not** lower warmup caps to fix; this exists for a reason. Wait or use a fresh bot.

---

## Symptom: timezone-related "bot ignored my hours" complaint

**Cause:** `Bot.timezone` is not what the merchant assumes.

**Fix:**
1. Confirm `Bot.timezone`:
```sql
SELECT timezone, workingHoursEnabled, workingHours FROM Bot WHERE userId = '<id>'
```
2. If `Africa/Cairo` is right, check the slot JSON. Days are 0=Sunday … 6=Saturday.
3. Convert merchant's expected local hour to UTC mentally — that's NOT what code does, but it helps you check `localHour(tz, now)` would match. See `WORKING_HOURS.md`.

---

## Symptom: `/login` returns 502 (Caddy)

**Cause:** Caddy is up but `mse-saas` isn't responding on 3000.

**Fix:**
```powershell
nssm restart mse-saas
Start-Sleep 8
(Invoke-WebRequest http://localhost:3000/login).StatusCode
```

If still 502 → check `C:\app\logs\mse-saas.err.log`. Common cause: build is corrupted. Rebuild:
```powershell
cd C:\app\saas
node node_modules\next\dist\bin\next build
nssm restart mse-saas
```

---

## Symptom: SSH disconnects during `deploy.ps1`

**Cause:** keepalive timeout on long-running build (~3-5 min).

**Fix:** see `DEPLOYMENT.md` → "Recovery from a broken deploy."

---

## Log locations

- `C:\app\logs\mse-saas.out.log` / `.err.log`
- `C:\app\logs\mse-wa.out.log` / `.err.log`
- `C:\app\logs\mse-llm.out.log` / `.err.log`
- Caddy: `C:\app\logs\caddy.log`
