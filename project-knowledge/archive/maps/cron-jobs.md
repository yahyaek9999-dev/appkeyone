# Cron Jobs

All four cron endpoints live in `saas/app/api/cron/*/route.ts` and are
called by **Windows Scheduled Tasks** on the VPS. Each task fires a `POST`
with the `X-Internal-Secret` header.

## Job catalog

| Job | Schedule | Endpoint | Installed by | Owner doc |
|---|---|---|---|---|
| **broadcasts** | every 1 min | `POST /api/cron/broadcasts` | `deploy/install-broadcasts-task.ps1` | `BROADCAST_SYSTEM.md` |
| **follow-ups** | every 30 min | `POST /api/cron/follow-ups` | `deploy/install-followup-task.ps1` | `MEMORY_ENGINE.md` |
| **daily-report** | every 1 hour | `POST /api/cron/daily-report` | (same scheduler as follow-ups, hourly tick) | `WORKING_HOURS.md` |
| **llm-prewarm** | configurable | `POST /api/cron/llm-prewarm` | manual | `AI_PROVIDERS.md` |

## Common contract

All cron endpoints share:
```ts
export const dynamic = "force-dynamic";

const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ... do work ...
  return NextResponse.json({ ok: true, ... });
}
```

## broadcasts

**What:** Drains one pending Broadcast per tick. Atomic-claims items.

**Critical invariant:** the `updateMany({status:"pending"} → "sending")` block in `route.ts:104-112`. **DO NOT REMOVE.**

**Throughput:** 20 items × 1 broadcast / tick → ~20 sends/min/merchant. Multiple merchants run in parallel across ticks (only one active broadcast per tick globally; see "fairness" below).

**Fairness limitation:** the worker only picks ONE broadcast per tick. If merchant A has a large broadcast queued, merchant B's broadcast waits until A finishes (or is canceled). **Documented inefficiency** — acceptable today.

**Idempotency:** atomic claim ensures no duplicate sends across overlapping ticks.

## follow-ups

**What:** Sends an LLM-generated follow-up message to customers whose
`Customer.followUpAt <= now` and `Customer.followUpSent = false`.

**Throughput:** up to 100 customers per tick (`take: 100`).

**Per-customer steps:**
1. Skip if subscription inactive
2. Skip if `bot.followUpsEnabled = false`
3. Generate a 1-2 sentence personalized nudge via LLM
4. Send via wa-service
5. Mark `Customer.followUpSent = true`

**Failure handling:** marks the customer as `followUpSent` regardless of outcome (avoids retry storm). Failed sends logged but not retried automatically.

## daily-report

**What:** Sends a one-paragraph Arabic business summary to each merchant who:
- has `Bot.dailyReportEnabled = true`
- current hour-in-merchant-tz == `Bot.dailyReportHour`
- hasn't been sent today (in their local tz)

**Query params:**
- `?dryRun=1` — build report text but don't send
- `?userId=...` — restrict to single merchant
- `?force=1` — ignore hour-match and daily dedupe

**Timezone-aware:** uses `localHour(tz, now)` and `localYmd(tz, now)` from `lib/tz.ts`.

**Throughput:** scans all users every tick (cheap query). Most are skipped.

**Cost:** 0 LLM calls by default. Heuristic-only (data assembled by `lib/daily-report/aggregate.ts` + `insights.ts` + `format-ar.ts`).

## llm-prewarm

**What:** Sends a small priming request to the `mse-llm` Python service to keep its Chromium responsive.

**Usefulness:** marginal. If `mse-llm` is healthy, prewarm does nothing. If `mse-llm` is dead, prewarm reveals it earlier in logs but doesn't fix it.

**Recommendation:** can be disabled if you're migrating merchants off `keyone` provider.

## How tasks are installed

`deploy/install-broadcasts-task.ps1`:
```powershell
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\app\deploy\run-broadcasts.ps1"

$trigger = New-ScheduledTaskTrigger `
  -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "KEYONE-Broadcasts" `
  -Action $action -Trigger $trigger -RunLevel Highest
```

`run-broadcasts.ps1` invokes:
```powershell
Invoke-WebRequest -Method POST `
  -Uri http://localhost:3000/api/cron/broadcasts `
  -Headers @{"x-internal-secret"=$env:SAAS_INTERNAL_SECRET} `
  -UseBasicParsing
```

## Monitoring

- `Get-ScheduledTask -TaskName "KEYONE-*" | Select TaskName, State, LastRunTime, LastTaskResult`
- `LastTaskResult = 0` → success
- `LastTaskResult = -2147023673` → process started but exited non-zero
- Check Saas logs around `LastRunTime` for the actual response

## Failure scenarios

| Scenario | Effect | Recovery |
|---|---|---|
| Scheduled task disabled | Broadcasts queued indefinitely | `Enable-ScheduledTask -TaskName "KEYONE-Broadcasts"` |
| mse-saas down | Tasks return 502; logged in task history | Restart mse-saas |
| Internal secret env unset | Task gets 401 | Set `SAAS_INTERNAL_SECRET` in service env; restart |
| Cron task crashes during run | Next tick takes over | Atomic claim makes this safe |
| Daily-report sent twice | Dedupe via `dailyReportLastSentAt` + `localYmd` | Self-healing |
