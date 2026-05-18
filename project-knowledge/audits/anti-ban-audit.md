# Anti-Ban Audit

> The safety engine v2 (`lib/safety/*`) is the heart of ban prevention. This
> audit summarizes the design and where to look first when investigating
> a ban-related incident.

## Coverage matrix

| Risk vector | Mitigation | Code |
|---|---|---|
| Sudden activity from new account | Warmup stages (day1 → mature) | `lib/safety/warmup.ts` |
| Sending to people who never replied (cold) | `customerInitiated` flag lowers risk; `firstInboundAt` accrues per contact | `lib/safety/trust.ts` + `lib/safety/risk.ts` |
| Identical replies to many contacts | Reply hash + similarity check | `lib/safety/store.ts:hashReply`, `patterns.ts` |
| Sub-second response times | Pattern: too-fast response | `lib/safety/patterns.ts` |
| All-caps / no-punctuation outbound | Pattern: spam-bot tells | `lib/safety/patterns.ts` |
| Excessive emoji density | Pattern weight | `lib/safety/patterns.ts` |
| Mass failures / reconnect storms | Kill switch triggers | `lib/safety/kill-switch.ts` |
| Burst activity (hour-level) | Hourly counter + cap | `lib/safety/store.ts:incrementCounters` |
| Daily volume cap | Stage-based daily cap | `lib/safety/warmup.ts:STAGES` |
| Customer block reports | `Customer.blockedAt`, `reportedAt` | `lib/safety/trust.ts` (uncertain — verify event handler in `whatsapp-service/src/sessions.js`) |
| Off-hours sending | Working hours respected on incoming reply path | `lib/insights.ts:inWorkingHours` |

## Warmup table (current values)

Source: `saas/lib/safety/warmup.ts:20-27`.

| Stage | Age (days) | maxDaily | maxHourly | newChats/10min | replyOnly |
|---|---|---|---|---|---|
| day1   | 0-1   | 20  | 6  | 3  | ✅ |
| day2_3 | 1-3   | 40  | 10 | 5  | ✅ |
| day4_5 | 3-5   | 80  | 14 | 8  |   |
| day6_7 | 5-7   | 150 | 20 | 12 |   |
| week2  | 7-14  | 300 | 35 | 20 |   |
| mature | 14+   | 600 | 50 | 25 |   |

Trust boost: `+0.5 days` if `trustScore ≥ 70 && !killSwitchActive`.

## Risk thresholds

Source: `lib/safety/risk.ts`. Approximate mapping:

| Score | Level | Cooldown | Delay multiplier |
|---|---|---|---|
| <25 | low | 0 | 1.0 |
| 25-49 | elevated | 0 | 1.5 |
| 50-69 | slow_mode | 0 | 3.0 |
| 70-89 | cooldown | 5-30 min | — |
| 90-94 | emergency_stop | ~2 hours | — |
| ≥95 | kill_all | 24 hours + kill switch | — |

Score decays linearly with time-since-last-event.

## Audit observations

### ✅ Strong: persistent state survives restarts

`SafetyState` row per merchant means we don't reset counters on Node restart.
Before this design, a process restart erased burst history and let a misbehaving bot start fresh — bad for ban prevention.

### ✅ Strong: kill switch is durable

24-hour cooldown when killed. Admin must manually clear. Prevents the "I'll just retry in 5 min" pattern.

### ✅ Strong: audit trail

Every kill, cooldown, and pattern-hit writes a `SafetyAudit` row. Merchants can debug at `/admin/safety`.

### 🟡 Uncertain: `lib/safety/broadcast.ts` wiring

This file exists but I haven't verified it's called from the broadcast cron worker. Action: read `cron/broadcasts/route.ts` end-to-end and confirm whether broadcast-specific safety gates fire. If not, broadcasts can violate warmup limits.

### 🟡 Uncertain: customer block/report events

`Customer.blockedAt` and `reportedAt` columns exist, but it's unclear whether `whatsapp-service` actually emits the "blocked"/"reported" events to set these. Investigation needed.

### ❌ Gap: broadcast doesn't run through `assessAndShape`

The hot path (incoming reply) goes through `assessAndShape`. The broadcast worker just sleeps 2.5s between sends. Theoretically, a merchant in `warmup.stage="day1"` could send 1000-recipient broadcasts and violate WhatsApp's daily limit.

**Recommendation:** add a pre-send check in `cron/broadcasts/route.ts` that calls a lighter version of safety (or wires `lib/safety/broadcast.ts` if it does this).

### ❌ Gap: no real-time customer block detection

If a customer blocks the bot, we currently learn about it via "send failed" errors after the fact. WhatsApp Web protocol may expose explicit block events; worth investigating in `whatsapp-web.js` docs.

## Test scenarios for anti-ban

See `TESTING_CHECKLIST.md` "Safety engine tests" section. Summary:
- Fresh bot (`stage=day1`) sending >20/day → expect cooldown
- Forced kill switch → all outbound blocked
- Manual takeover → bot stays silent

## Real-world incident: May 2026 — no merchant bans observed

As of audit date, no merchant has been banned by WhatsApp. This is consistent with:
- All active merchants are in `mature` stage (deployed long enough)
- Risk scores stay low because conversation patterns are healthy
- Kill switch has never triggered in production

**Watch for:** the first new merchant onboarded after a long period — they'll enter `day1` and should have very tight limits. Make sure their experience is good (otherwise the warmup feels like a bug to them).

## Recommendations

1. **Verify `lib/safety/broadcast.ts` wiring.** Search for imports.
2. **Add an `/admin/safety` dashboard view** with: current state per merchant, recent kill events, risk score trend, warmup stage timeline.
3. **Document the warmup experience for new merchants** — explain why they can't send broadcasts on day 1.
4. **Consider adding a "WhatsApp Business" verification step** to fast-track trust accrual for verified merchants.
5. **Investigate explicit block detection** in `whatsapp-web.js` and wire to `Customer.blockedAt`.
