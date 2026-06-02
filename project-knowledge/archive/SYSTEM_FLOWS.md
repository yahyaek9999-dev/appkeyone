# System Flows — overview

> Detailed step-by-step traces live in `flows/`. This file is the index +
> high-level summary of the **eight** flows that matter most in production.

## 1. Incoming WhatsApp message (the hot path)
**Trace:** `flows/whatsapp-incoming-flow.md`
**Entry:** `whatsapp-service` calls `POST /api/whatsapp/incoming` →
`saas/app/api/whatsapp/incoming/route.ts` (874 lines, single function).
**Phases (high level):**
1. Auth (`X-Internal-Secret`) + body parse
2. Load tenant (User + Bot + Subscription + plan)
3. Subscription gates (no-sub, inactive, expired, monthly quota, daily cap)
4. Decode media (voice → transcribe, image → describe)
5. Upsert Customer, accrue trust (`onInbound`), capture phone/name from LID rows
6. Persist inbound Message
7. Manual-takeover bypass
8. Out-of-office check (timezone-aware)
9. **Stage A:** exact quick-reply
10. **Stage B:** fuzzy quick-reply (cosine, threshold 0.62)
11. Cache lookup (`getCached` 24h)
12. KB top-K retrieval + Memory load (parallel)
13. Sales engine (gated)
14. LLM call → reply
15. Humanize + Realism layers
16. Persist assistant Message, bump counters
17. Order alert (non-blocking)
18. Order extraction (background)
19. Classify + scoreLead + anger alert + follow-up (background)
20. Knowledge-gap detection
21. **Safety Engine v2** (`assessAndShape`) — final delay/cooldown/kill check
22. Return `{reply, preDelayMs, typingDelayMs, risk, warmupStage}`

## 2. Broadcast send (`flows/broadcast-flow.md`)
**Trigger:** Windows Scheduled Task → `POST /api/cron/broadcasts` every minute.
**Key invariant:** atomic claim prevents duplicate sends:
```ts
await prisma.broadcastItem.updateMany({
  where: { id: it.id, status: "pending" },
  data:  { status: "sending" },
});
```
Only one tick wins; the other skips silently (`skippedClaim++`).

## 3. AI reply provider routing (`flows/ai-reply-flow.md`)
- `lib/llm.ts:chat()` decides between:
  - **keyone** (in-house mse-llm) — round-robin URLs + circuit breaker
  - **External provider** via `routeProviderChat(messages, opts)` → `lib/providers/{openai,gemini,claude,groq,openrouter}.ts`
- Provider override comes from `botProviderOverride(bot)` which decrypts `bot.aiApiKeyEnc` (AES-256-GCM).
- Concurrency: semaphore of `LLM_MAX_CONCURRENT` (default 3).

## 4. Order extraction (`flows/order-flow.md`)
- `lib/order-extractor.ts:extractOrderFast()` runs after every assistant reply.
- Pure regex + Arabic lexicons. **No LLM call.**
- Threshold: `confidence >= 50` (unless `flagged` is true, which permits weaker drafts).
- Dedupe: same customer + same total within last 30 min → skip.
- Persisted to `Order` + `OrderItem` + `OrderTimeline (kind="ai_extracted")`.
- Failure → `SafetyAudit (category="orders", level="warn")`.

## 5. Notification (`flows/notification-flow.md`)
- `lib/notify.ts:notifyMerchant()` / `notifyAdmin()` — used for order alerts + anger alerts.
- Phone resolution chain (`resolveNotifyPhone`):
  `bot.notifyPhone → bot.whatsappPhone → user.phone`
- Self-send guard: refuses to deliver alert to the same WhatsApp number that hosts the bot.
- Every failure → `SafetyAudit (category="notify")`.

## 6. Working hours (`flows/working-hours-flow.md`)
- `Bot.timezone` (IANA, default `Africa/Cairo`).
- `lib/insights.ts:inWorkingHours(slotsJson, now, tz)` uses `Intl.DateTimeFormat` via `lib/tz.ts:partsInTz()`.
- Out-of-office reply is sent back to the customer; bot reply path is skipped.

## 7. Safety engine (`flows/safety-flow.md`)
- Replaces the legacy `lib/anti-ban.ts:assessOutbound`.
- Phases: `checkWarmup` → `aggregateRecent` → `detectPatterns` → `assessRisk` → `applyHumanizeV2` → `checkAutoKill` → `logEvent`.
- Outcomes: pass / slow_mode / cooldown / emergency_stop / kill_all.
- Persistent state on `SafetyState`; rolling events on `SafetyEvent`; high-signal admin items on `SafetyAudit`.

## 8. Memory engine (`flows/memory-flow.md`)
- `lib/memory.ts:triggerMemoryUpdate()` fired after every assistant reply (fire-and-forget).
- LLM extractor runs only every `MEMORY_EXTRACT_EVERY` (default 20) inbound msgs.
- Output: rolling Arabic `summary` + structured `factsJson` in `CustomerMemory`.
- The summary, once present, **shrinks history truncation** in `buildMessages()` from 20 → 8.

---

## Cron schedule (Windows Scheduled Tasks)

| Cron | Schedule | Endpoint | Owner doc |
|---|---|---|---|
| broadcasts | every minute | `/api/cron/broadcasts` | `BROADCAST_SYSTEM.md` |
| follow-ups | every 30 minutes | `/api/cron/follow-ups` | `MEMORY_ENGINE.md` |
| daily-report | every hour | `/api/cron/daily-report` | `WORKING_HOURS.md` |
| llm-prewarm | configurable | `/api/cron/llm-prewarm` | `AI_PROVIDERS.md` |

All cron endpoints require `X-Internal-Secret`. They are installed via
`deploy/install-broadcasts-task.ps1` and friends.
