# Flow: Working Hours Evaluation

**Files:**
- Helper: `saas/lib/tz.ts`
- Evaluation: `saas/lib/insights.ts:inWorkingHours()`
- Caller: `saas/app/api/whatsapp/incoming/route.ts:235`
- API: `saas/app/api/working-hours/route.ts`
- UI: `saas/app/dashboard/working-hours/working-hours-ui.tsx`

## Sequence (per customer message)

```mermaid
sequenceDiagram
  participant H as incoming/route.ts
  participant TZ as lib/tz.ts
  participant Insights as lib/insights.ts

  H->>H: bot.workingHoursEnabled?
  alt true
    H->>Insights: inWorkingHours(slotsJson, new Date(), bot.timezone || "Africa/Cairo")
    Insights->>TZ: partsInTz(now, tz)
    TZ->>TZ: Intl.DateTimeFormat({timeZone}).formatToParts
    TZ-->>Insights: { weekday, hour, minute }
    Insights->>Insights: parse slots; check (day matches AND from <= mins <= to)
    Insights-->>H: true | false
    alt false
      H->>H: send Bot.outOfHoursMessage, return mode='ooo'
    end
  end
  H->>H: continue normal flow
```

## Storage

```prisma
// in Bot model
timezone            String  @default("Africa/Cairo")
workingHoursEnabled Boolean @default(false)
workingHours        String  @default("[]")
outOfHoursMessage   String  @default("شكراً لتواصلك! فريقنا متاح من 9 صباحاً حتى 9 مساءً...")
```

`workingHours` is a JSON-encoded array:
```jsonc
[
  { "day": 0, "from": "09:00", "to": "21:00", "enabled": true },  // Sunday
  { "day": 1, "from": "09:00", "to": "21:00", "enabled": true },
  { "day": 2, "from": "09:00", "to": "21:00", "enabled": true },
  { "day": 3, "from": "09:00", "to": "21:00", "enabled": true },
  { "day": 4, "from": "09:00", "to": "21:00", "enabled": true },
  { "day": 5, "from": "10:00", "to": "16:00", "enabled": true },  // Friday short
  { "day": 6, "from": "00:00", "to": "00:00", "enabled": false }  // Saturday off
]
```

## Timezone helper details

`partsInTz(date, tz)`:
```ts
new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  year: "numeric", month: "2-digit", day: "2-digit",
  weekday: "short",
  hour: "2-digit", minute: "2-digit",
  hour12: false,
}).formatToParts(d);
```

Maps `weekday: "short"` → 0-6 (Sun=0). Returns `{year, month, day, weekday, hour, minute}`.

`safeTz(tz)`:
- Validates by calling `new Intl.DateTimeFormat(..., {timeZone:tz}).format(new Date())`
- Catches `RangeError` if tz is invalid
- Falls back to `"Africa/Cairo"`

## Evaluation logic

`inWorkingHours(slotsJson, now, tz)`:
```ts
const slots = JSON.parse(slotsJson);
if (!Array.isArray(slots) || slots.length === 0) return true;  // default open

const p = partsInTz(now, tz);
const day = p.weekday;
const mins = p.hour * 60 + p.minute;

return slots.some(s =>
  s.enabled
  && s.day === day
  && parseHHMM(s.from) <= mins
  && mins <= parseHHMM(s.to)
);
```

**Edge cases:**
- Invalid JSON → default to `true` (always open) — fail-open for merchant UX
- Empty slots → always open
- All slots disabled → always closed (returns false)
- Slot with `from > to` (overnight) → NEVER matches. **Limitation.** See `WORKING_HOURS.md`.

## Daily report uses the same TZ helpers

`saas/app/api/cron/daily-report/route.ts:63-77`:
```ts
const tz = bot.timezone || "Africa/Cairo";
const localH = localHour(tz, now);
const localDayKey = localYmd(tz, now);

if (bot.dailyReportHour !== localH) skip;  // not their hour yet
if (localYmd(tz, bot.dailyReportLastSentAt) === localDayKey) skip;  // already sent
```

`localYmd(tz, date)` produces `"YYYY-MM-DD"` in the merchant's tz — used as a stable dedupe key across DST and time-of-day variance.

## UI workflow

`/dashboard/working-hours`:
1. **Timezone dropdown** — 15 common Arabic-region zones + UTC
2. Per-day rows with enable/from/to inputs
3. **Out-of-office message** textarea
4. **Save** → `POST /api/working-hours` validates tz via `safeTz`, persists.

The UI also displays the daily report hour selector since they share the timezone.

## API endpoint

`GET /api/working-hours` → returns `{ enabled, workingHours, outOfHoursMessage, timezone, dailyReportHour }`

`POST /api/working-hours` → accepts the same shape; validates timezone before saving; returns the persisted row.

## Test scenarios

See `TESTING_CHECKLIST.md` "Timezone tests" section.
