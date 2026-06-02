# Testing Checklist

> Use these to verify production after a deploy, or before onboarding a
> new merchant. There are **no automated tests in this repo** (see `KNOWN_ISSUES.md` P3).

---

## End-to-end production verification (run after every prod deploy)

### A. Service health
- [ ] `Get-Service mse-* | Select Name, Status` → all `Running`
- [ ] `https://app.keyone1.com/login` → 200, page renders
- [ ] `https://app.keyone1.com/admin/metrics` → no JS errors in console

### B. WhatsApp gateway
- [ ] `GET /sessions/stats` (with internal secret) → returns active session count
- [ ] At least one merchant session shows `status: "ready"`

### C. Hot path
- [ ] Send a real WhatsApp message to a connected bot from a personal phone
- [ ] Bot replies within ≤8 seconds
- [ ] Reply is **not** the fallback string `"عذراً، يبدو أن هناك خلل تقني مؤقت"`
- [ ] Message persists in `/dashboard/inbox`

---

## WhatsApp tests (the eight scenarios from RUNBOOK)

Run with a real phone before opening to a real merchant. Mark pass/fail.

### 1. First-time greeting
- Send: `"أهلاً"` from a number never seen before
- Expect: warm Arabic greeting, includes `Bot.welcomeMessage` prefix, 3-8s delay

### 2. Repeat customer recognition
- Send 25+ messages over 30 min from same number, then come back next day
- Expect: bot references at least one earlier topic IF `humanizeReplies` is enabled

### 3. Angry customer
- Send: `"إنتم نصابين! بترجعولي فلوسي ولا أبلّغ عنكم!"`
- Expect: bot tone shifts to calm + de-escalation
- Expect: merchant gets the anger alert at `notifyPhone` within ~2 seconds
- Verify: `SafetyAudit` shows no failure for the alert

### 4. Negotiation
- Send: `"بكام؟"` → `"غالي شوية، أقل سعر إيه؟"`
- Expect: bot stays within `Bot.negotiationFloorPct` (default 10%)
- Verify: `Customer.factsJson.negotiation` updates after the exchange

### 5. Burst load
- Send 30 short messages back-to-back in 1 minute
- Expect: anti-ban cooldown kicks in (`blocked: "anti_ban_cooldown"` in WA service response)
- Verify: `MetricEvent.kind="anti_ban_cooldown"` increments
- Verify: customer messages get queued, no ban warning from WhatsApp

### 6. Long conversation
- 60+ messages mixing inquiries / objections / decisions
- Expect: bot stays on-topic
- Verify: `CustomerMemory.summary` row exists after ~20 messages
- Verify: token usage on `/admin/metrics` is sane (not climbing linearly)

### 7. Order extraction
- Send: `"حولت 350 جنيه فودافون كاش لأحمد، العنوان: ٥ شارع التحرير، مصر الجديدة"`
- Expect: `/dashboard/orders` shows a new `pending` order with `aiConfidence > 60`
- Verify: `MetricEvent.kind="order_extracted"` increments
- Verify: order detail page shows correct phone, address, payment method

### 8. Provider switching
- From `/dashboard/settings/ai-provider`, switch to OpenAI with a real key
- Hit "اختبار الاتصال" → 200
- Send 3 customer messages
- Expect: `/admin/metrics` shows new `openai` provider usage with token counts
- Expect: `keyone` calls stop for this merchant

If any test fails, do NOT onboard a real merchant. File a `KNOWN_ISSUES.md`
entry and fix before retry.

---

## Broadcast tests

- [ ] Create a 5-recipient broadcast via `/dashboard/broadcasts`
- [ ] Confirm `total=5, sent=0, failed=0, status="queued"` immediately after
- [ ] Wait 60-180 seconds
- [ ] Confirm all 5 recipients receive the message
- [ ] Confirm `Broadcast.status="done"`, `sent=5`, `failed=0`
- [ ] **Duplicate test:** if you can simulate overlapping cron ticks (manually call `/api/cron/broadcasts` twice in a row), confirm no recipient gets the message twice. The `skippedClaim` counter should show ≥1.
- [ ] **Personalize test:** create a broadcast with `personalize=true` and template `"عرض خاص ليك {name}"`. Confirm each recipient gets a slightly different rephrased version (LLM personalization). If they're identical, check `SafetyAudit (category="broadcast")` for the personalize failure.
- [ ] **Cancel test:** create a broadcast, cancel it mid-run, confirm the next cron tick exits cleanly without sending more.

---

## Order tests

- [ ] Flagged keyword: send `"اوردر تيشيرت أزرق مقاس L"` — expect order created with item, size, color
- [ ] Implicit order: have a 5-msg chat ending in `"تمام موافق"` after product+price discussion — expect order if confidence ≥ 50
- [ ] Dedupe: try to create the same total within 30 min — expect second NOT to create a duplicate
- [ ] Failure logging: simulate a DB error (e.g. invalid customer ID injection in test) — expect `SafetyAudit (category="orders", level="warn")` row

---

## Timezone tests

- [ ] Set `Bot.timezone="Asia/Riyadh"` (UTC+3 normally)
- [ ] Set working hours `{day: 0..6, from:"09:00", to:"21:00", enabled:true}`
- [ ] At local time 02:00 (UTC 23:00), send a message
- [ ] Expect: out-of-office reply (Bot.outOfHoursMessage)
- [ ] At local time 14:00 (UTC 11:00), send a message
- [ ] Expect: normal bot reply

- [ ] Daily report:
  - [ ] Set `Bot.dailyReportHour=9`, `Bot.timezone="Africa/Cairo"`
  - [ ] At UTC time matching 09:00 Cairo (06:00 UTC standard / 07:00 DST)
  - [ ] Run `POST /api/cron/daily-report` manually
  - [ ] Expect: merchant receives the daily report
  - [ ] Run it again 1 hour later in the same Cairo day
  - [ ] Expect: skipped with `"already-sent-today"`

---

## AI provider failover tests

- [ ] Merchant set to `openai`, but `aiApiKeyEnc` is null
- [ ] Send a message
- [ ] Expect: graceful Arabic error string (not a stack trace)
- [ ] Verify: `MetricEvent.kind="llm_fail"` increments

- [ ] Merchant set to `openai` with **invalid** key
- [ ] Hit `/api/settings/ai-provider/test` → expect `{ ok: false, error, status }` JSON

- [ ] Merchant set to `keyone` while `mse-llm` is dead
- [ ] Send a message
- [ ] Expect: fallback Arabic error after circuit breaker engages (1-3 messages, then sub-second failures)

---

## Safety engine tests

- [ ] Fresh bot (`SafetyState.warmupStage="day1"`)
- [ ] Send 25 outbound replies in one day → expect cooldown kicks in around msg 20 (`day1` cap)
- [ ] Check `SafetyState.warmupStage` → should still be `day1` until 24h pass

- [ ] Force kill switch (admin endpoint or by setting `riskScore=99`)
- [ ] Send any message
- [ ] Expect: `blocked: "kill_switch_active"` / null reply
- [ ] Clear kill switch via admin → expect normal replies resume

- [ ] Manual takeover: pause a conversation (`/dashboard/inbox`), customer sends a message
- [ ] Expect: bot does NOT reply (`blocked: "manual_takeover"`)
- [ ] Inbox UI still shows the inbound message

---

## Knowledge base tests

- [ ] Upload a 5-page PDF as a knowledge document
- [ ] Wait 1 minute (KB cache TTL)
- [ ] Send a question whose answer is on page 3 of the PDF
- [ ] Expect: bot answers from the doc, not a generic reply
- [ ] Send a generic greeting (`"اهلا"`) — expect head-of-KB fallback or no KB context

---

## Notification tests

- [ ] Set `Bot.notifyPhone="+201234567890"` (different from `whatsappPhone`)
- [ ] Customer sends order-keyword message
- [ ] Expect: alert arrives at `+201234567890` via WhatsApp

- [ ] Set `Bot.notifyPhone = Bot.whatsappPhone` (same number)
- [ ] Customer sends order-keyword message
- [ ] Expect: NO send (self-send guard) + `SafetyAudit` row with self-send warning

- [ ] Empty all phone fields
- [ ] Customer sends order-keyword message
- [ ] Expect: NO send + `SafetyAudit` row "تعذّر إرسال تنبيه (لا يوجد رقم)"

---

## Sanity DB queries

```sql
-- Recent failures
SELECT createdAt, level, category, title FROM SafetyAudit ORDER BY createdAt DESC LIMIT 20;

-- Daily metrics for one merchant
SELECT kind, count FROM MetricEvent WHERE userId='<id>' AND day=date('now') ORDER BY count DESC;

-- Provider usage today
SELECT provider, model, calls, failures, totalLatencyMs/calls AS avgMs FROM ProviderUsage WHERE day=date('now');

-- Active safety state for all bots
SELECT userId, warmupStage, riskScore, killSwitchActive FROM SafetyState;

-- Stuck broadcast items
SELECT broadcastId, COUNT(*) FROM BroadcastItem WHERE status='sending' GROUP BY broadcastId;
```
