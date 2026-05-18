# Working Hours & Timezone System

> Code: `saas/lib/tz.ts` (timezone helpers), `saas/lib/insights.ts:inWorkingHours()`,
> `saas/app/api/working-hours/route.ts` (API), `saas/app/dashboard/working-hours/working-hours-ui.tsx` (UI).
> DB: `Bot.timezone` (IANA, default `Africa/Cairo`), `Bot.workingHoursEnabled`, `Bot.workingHours` (JSON), `Bot.outOfHoursMessage`.

## Why this exists

The VPS runs **UTC**. Merchants live in Cairo / Riyadh / Dubai. Before the
May 2026 fix, "9 AM - 9 PM" meant **UTC** time, so a Cairo merchant's bot
would go silent at 7 PM their time and come back online at 4 AM. Fixed by
making everything timezone-aware via `Bot.timezone`.

## `Bot.timezone`

```prisma
timezone String @default("Africa/Cairo")
```

Stored as an **IANA name** (`Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`,
`Europe/Istanbul`, ...). Validated by `safeTz()` in `lib/tz.ts` (falls back
to `Africa/Cairo` on invalid input).

## Helper functions (`saas/lib/tz.ts`)

```ts
safeTz(tz)                       // validates or returns "Africa/Cairo"
partsInTz(date, tz)              // → { year, month, day, weekday, hour, minute }
localHour(tz, date?)             // 0-23 in tz
localWeekday(tz, date?)          // 0-6 (Sun=0)
localYmd(tz, date?)              // "YYYY-MM-DD" string — for dedupe keys
```

All wrappers around `Intl.DateTimeFormat({timeZone, hour12:false}).formatToParts(date)`.
**No external library needed.**

## Working hours storage

```jsonc
// Bot.workingHours
[
  { "day": 0, "from": "09:00", "to": "21:00", "enabled": true },  // Sunday
  { "day": 1, "from": "09:00", "to": "21:00", "enabled": true },
  // ...
]
```

- `day`: 0=Sunday … 6=Saturday (matches JS `Date.getDay()`)
- `from`/`to`: `"HH:MM"` 24h format
- `enabled`: per-day toggle
- Empty array / missing → bot is always open

## Evaluation: `inWorkingHours(slotsJson, now, tz)`

`saas/lib/insights.ts:282-306`:
```ts
const p = partsInTz(now, tz);
const day = p.weekday;
const mins = p.hour * 60 + p.minute;

return slots.some((s) => {
  if (!s.enabled || s.day !== day) return false;
  const from = parseHHMM(s.from);
  const to = parseHHMM(s.to);
  return mins >= from && mins <= to;
});
```

Called from `app/api/whatsapp/incoming/route.ts:235`:
```ts
if (bot.workingHoursEnabled && !inWorkingHours(bot.workingHours, new Date(), bot.timezone || "Africa/Cairo")) {
  // send Bot.outOfHoursMessage to customer
  return;
}
```

## Out-of-office reply

When outside hours, the bot sends `Bot.outOfHoursMessage` (default:
`"شكراً لتواصلك! فريقنا متاح من 9 صباحاً حتى 9 مساءً..."`) and returns
`mode: "ooo"` to the gateway.

The reply still goes through humanize delays (`computeReadDelayMs`,
`computeTypingDelayMs`) so it doesn't look robotic.

## Daily report timezone

The daily report cron (`app/api/cron/daily-report/route.ts`) runs **every hour
(UTC)** but only sends to merchants whose **local** hour matches their
`dailyReportHour`:

```ts
const tz = bot.timezone || "Africa/Cairo";
const localH = localHour(tz, now);
const localDayKey = localYmd(tz, now);

if (bot.dailyReportHour !== localH) continue;  // not their hour yet
if (localYmd(tz, bot.dailyReportLastSentAt) === localDayKey) continue;  // already sent today
```

So a Cairo merchant with `dailyReportHour=9` gets their report at 9 AM Cairo
even if the VPS clock says 7 AM UTC.

## UI

`/dashboard/working-hours` exposes:
- Timezone dropdown (15 Arabic-region zones + UTC)
- Per-day enable/from/to inputs
- Out-of-office message textarea
- Daily report hour selector

Save endpoint: `POST /api/working-hours` validates the timezone via `safeTz`
before persisting.

## Common pitfalls

1. **`Date.getDay()` vs Intl weekday** — both return 0=Sunday. They agree only after you compute the parts in the target tz, NOT before. **Do not** mix `now.getHours()` with `localWeekday(tz)` — you'll cross midnight in one and not the other.
2. **DST transitions** — `Intl` handles them. Cairo/Riyadh don't observe DST; Istanbul does. No code changes needed.
3. **Crossover hours (e.g., 22:00-06:00)** — current implementation returns false for overnight slots. **Limitation.** Workaround: split into two slots (`22:00-23:59` + `00:00-06:00`).
4. **Validation:** always pass through `safeTz` before using a tz string. Trusting raw user input → `RangeError` at runtime.
