# KEYONE — Production Runbook

This is the operator's playbook for `app.keyone1.com`. It assumes a Windows VPS
(`217.154.163.16`), code installed at `C:\app`, NSSM services `mse-saas`,
`mse-wa`, `mse-llm`, `mse-caddy`. All commands run from an elevated PowerShell
session unless stated otherwise.

---

## 1 · Canonical workflows

| Task | Command |
|---|---|
| **Standard deploy** (current source on disk) | `.\deploy\deploy.ps1` |
| **Deploy + git pull** | `.\deploy\deploy.ps1 -GitPull` |
| **Roll back to last backup** | `.\deploy\rollback.ps1` |
| **Roll back to specific snapshot** | `.\deploy\rollback.ps1 -Snapshot C:\app\backups\pre-deploy-2026-05-14_213059` |
| **Manual backup** | `.\deploy\backup-all.ps1` |
| **Health check only** | `.\deploy\health-check.ps1` |
| **Inspect metrics** | open `https://app.keyone1.com/admin/metrics` |

**Do NOT use the old `update.ps1` or `apply-qa-hotfix.ps1` — they have been
removed.** `deploy.ps1` is the single canonical entry point.

---

## 2 · Pre-launch real-chat validation checklist

Run **all eight** with a real WhatsApp number on a real device before opening
the system to a real merchant. Mark each pass/fail in a notebook.

1. **First-time greeting** — new number sends "أهلاً"  
   ✓ bot replies within 3-8 s typing-delay, greeting is natural, not robotic.
2. **Repeat customer recognition** — same number sends 25+ messages over 30 min, then comes back the next day.  
   ✓ bot references at least one earlier topic *if* the merchant has memory enabled.
3. **Angry customer** — send "إنتم نصابين! بترجعولي فلوسي ولا أبلّغ عنكم!"  
   ✓ tone shifts to calm + de-escalation; merchant gets the anger alert SMS at `notifyPhone`.
4. **Negotiation** — send "بكام؟" → "غالي شوية، أقل سعر إيه؟"  
   ✓ bot stays inside `negotiationFloorPct` (default 10%); never quotes below stored prices.
5. **Burst load** — send 30 short messages back-to-back over 1 minute.  
   ✓ anti-ban cooldown kicks in (return `blocked: "anti_ban_cooldown"` in the wa-service response); customer messages get queued, no ban warning from WhatsApp.
6. **Long conversation** — 60+ messages, mixing inquiries / objections / decisions.  
   ✓ bot stays on-topic; `CustomerMemory.summary` row exists after ~20 messages; token usage on `/admin/metrics` is sane.
7. **Order extraction** — send "حولت 350 جنيه فودافون كاش لأحمد، العنوان: ٥ شارع التحرير، مصر الجديدة".  
   ✓ `/dashboard/orders` shows a new `pending` order with confidence > 60. `order_extracted` counter increments.
8. **Provider switching** — from `/dashboard/settings/ai-provider`, switch to OpenAI (with a real key), hit "اختبار الاتصال" → 200, then send 3 customer messages.  
   ✓ `/admin/metrics` shows new `openai` provider usage with token counts; `keyone` calls stop.

If any of the 8 fails, **do not onboard a real merchant** — file a ticket and
re-run the failed step after the fix.

---

## 3 · Daily smoke (5 min, run before opening every business day)

```powershell
# 1. quick health
.\deploy\health-check.ps1

# 2. metrics sanity
#    open https://app.keyone1.com/admin/metrics
#    expect: failures < 5% of llm_call; provider latency < 3000 ms avg

# 3. WA service has open sockets
Get-NetTCPConnection -State Listen -LocalPort 3001 -ea SilentlyContinue

# 4. yesterday's order count plausibility
#    open /admin/metrics and read "order_extracted" for yesterday
```

---

## 4 · Common alerts and their playbooks

### 4.1 — `mse-saas.err.log` shows `PrismaClientKnownRequestError P2021`
> The Prisma client expects a table that doesn't exist (schema drift).

Fix:
```powershell
.\deploy\backup-all.ps1
nssm stop mse-saas
Push-Location C:\app\saas ; npx prisma db push ; Pop-Location
nssm start mse-saas
```

### 4.2 — A merchant reports "البوت بيرد بنفس الجملة كل مرة"
> Likely the cache is returning identical replies for variant phrasings.

Inspect:
- `/admin/metrics` → check `cache_hit` ratio. > 60 % means cache is too aggressive.
- Lower `Bot.cacheTtlHours` for that merchant, or disable cache temporarily from `/dashboard/bot`.

### 4.3 — Provider failure rate > 5 %
> Vendor outage or bad key. Visible on `/admin/metrics` per-provider table.

Action:
1. Confirm: from `/dashboard/settings/ai-provider`, press "اختبار الاتصال".
2. If the test fails → tell the merchant to rotate / fix their key.
3. **Do not auto-switch** them back to KEYONE silently (per policy). Notify them.

### 4.4 — `anti_ban_cooldown` counter spiking
> A merchant's flow is too aggressive, risking a WhatsApp ban.

Action:
- Tighten `bot.preReplyDelayMs` / lower `bot.replyVariations`.
- Inspect `customer` rows for that merchant — look for >50 outbound msgs/customer/24 h.
- If serious, set `bot.dailyMessageCap` to a temporary low value (e.g. 200).

### 4.5 — `mse-wa` keeps restarting
> Chromium crashed; usually a Puppeteer page eviction.

```powershell
# 1. Check process count
Get-Process chrome -ea SilentlyContinue | Group-Object Name | Format-Table Name, Count, @{n="MB";e={[int]((($_.Group|Measure-Object WorkingSet64 -Sum).Sum)/1MB)}}

# 2. If > 12 procs, restart wa cleanly:
nssm restart mse-wa
Start-Sleep -Seconds 15
.\deploy\health-check.ps1
```

### 4.6 — Disk filling up
> Backups + logs accumulate.

```powershell
# Keep last 10 backups only
Get-ChildItem C:\app\backups -Directory | Sort LastWriteTime -Descending | Select -Skip 10 | Remove-Item -Recurse -Force

# Rotate huge log files (>200 MB)
Get-ChildItem C:\app\logs\*.log | Where Length -gt 200MB | ForEach { Clear-Content $_.FullName }
```

---

## 5 · Performance & stability checklist

Before declaring "stable" after a change, verify:

| Check | Expected | Where |
|---|---|---|
| Free RAM after 2 h of typical load | ≥ 35 % | `Get-CimInstance Win32_OperatingSystem` |
| `chrome` proc count | 6-14 | `Get-Process chrome` |
| `node` proc count | 3 (saas + wa + cron) | same |
| `mse-saas` err.log growth | < 10 KB / hour | `C:\app\logs\mse-saas.err.log` |
| Avg LLM latency (per `/admin/metrics`) | < 3000 ms | dashboard |
| Provider failure rate | < 5 % | dashboard |
| Daily backups stored | ≥ 7 days retained | `C:\app\backups\` |
| SQLite size growth | < 10 MB / 1000 customer messages | size of `C:\app\saas\prisma\prod.db` |

If any of these regress, **roll back** with `rollback.ps1` and investigate
offline.

---

## 6 · First-merchant rollout plan

Recommended sequence for opening to the first real paying merchants:

1. **Day 0 (today):** internal dogfood. Run the 8-step validation above.
2. **Day 1-3:** onboard a single friendly pilot merchant (small business,
   ≤ 100 messages/day expected). Set `bot.dailyMessageCap = 300` as a safety
   net. Check `/admin/metrics` every 2 hours.
3. **Day 4-7:** add a second merchant. Monitor RAM (should still be ≥ 50 % free).
4. **Week 2:** add up to 3 more merchants. **Do not exceed 5 simultaneously**
   on this VPS until the migration to Postgres + 2nd VPS is ready.
5. **Week 4:** review `/admin/metrics` to identify the biggest cost-drivers
   per merchant; consider per-tier daily caps.
6. **At 8 merchants:** plan the Postgres migration *before* you reach 10.

**Hard ceilings on this single 8 GB / 2 vCPU box:**

- Safe / sustainable: **15-20 merchants**
- Stretch (monitored): 20-25
- Hard ceiling: 30

---

## 7 · What to *not* change in the first 30 days post-launch

- Do not touch `prod.db` schema until first 3 real merchants have onboarded successfully.
- Do not upgrade Node, Next.js, Prisma, or `whatsapp-web.js` — current versions are verified working.
- Do not refactor any `lib/*.ts` hot-path file for at least 7 days post-launch (let real data shake out bugs).
- Do not switch the default LLM model or `mse_ai_api` provider without an A/B period.
- Do not enable additional Caddy domains until the wildcard / multi-tenant URL strategy is settled.

---

## 8 · Emergency contacts

- VPS console: Contabo dashboard (Administrator account).
- DNS: `app.keyone1.com` → `217.154.163.16` (A record).
- TLS certs: managed by Caddy auto-ACME; renewal logs in `C:\app\logs\mse-caddy.err.log`.

---

*Last updated alongside the Controlled Launch Preparation phase. Update this
file with every operational change — the runbook is the single source of
truth, not chat threads.*
