# Regression Risks

> Bugs we've fixed before. **If you reintroduce one of these, you've broken
> production.** Read this before editing any Tier-1 file.

---

## 1. Broadcasts sending duplicates

**File:** `saas/app/api/cron/broadcasts/route.ts`
**Fixed:** May 2026
**How to reintroduce:** remove the atomic claim block (~lines 104-112):
```ts
const claim = await prisma.broadcastItem.updateMany({
  where: { id: it.id, status: "pending" },
  data:  { status: "sending" },
});
if (claim.count === 0) { skippedClaim++; continue; }
```
**Why it's important:** the cron runs every 60s. Each tick takes 50+ seconds.
**Consecutive ticks WILL overlap.** Without the claim, both ticks try to send
the same row, and the customer receives the message twice.

**Test:** simulate concurrent ticks (call the route twice in quick succession),
verify `skippedClaim` increments and no customer gets duplicate sends.

---

## 2. Working hours evaluated in UTC

**File:** `saas/lib/insights.ts:inWorkingHours()`
**Fixed:** May 2026
**How to reintroduce:** change `partsInTz(now, tz)` back to `now.getHours()` / `now.getDay()`.
**Why it's important:** the VPS runs UTC. Cairo merchants would see their bot go silent at 7 PM their time.

**Test:** set `Bot.timezone="Asia/Riyadh"` and check that `inWorkingHours` matches Riyadh hours, not UTC.

---

## 3. Daily report sent at wrong hour

**File:** `saas/app/api/cron/daily-report/route.ts`
**Fixed:** May 2026
**How to reintroduce:** use `new Date().getUTCHours()` instead of `localHour(bot.timezone, now)`.
**Why it's important:** same as #2, but for daily reports.

---

## 4. Notification failures silently dropped

**File:** `saas/lib/notify.ts`
**Fixed:** May 2026
**How to reintroduce:** wrap `wa.send()` in an empty `catch {}` without writing to `SafetyAudit`.
**Why it's important:** merchants had no way to see WHY their alerts didn't arrive. Audit row gives explicit reason: self-send guard, missing phone, WA error, etc.

**Test:** force an alert failure (e.g. set `notifyPhone=null`), verify a `SafetyAudit (category="notify", level="warn")` row appears.

---

## 5. Self-send alert (bot tries to message itself)

**File:** `saas/lib/notify.ts:isOwnWhatsappNumber()`
**Fixed:** May 2026
**How to reintroduce:** remove the digit-suffix comparison block.
**Why it's important:** if `notifyPhone == whatsappPhone`, WhatsApp refuses
the send with a cryptic error. The guard fails fast with an audit instead.

---

## 6. KB fully stuffed into every prompt

**File:** `saas/app/api/whatsapp/incoming/route.ts:323-326`
**Fixed:** May 2026
**How to reintroduce:** revert from `retrieveRelevantKb(...)` to `loadKnowledgeBaseCached(...)`.
**Why it's important:** stuffing 12 KB of merchant docs into every prompt drowns the model and burns 4x the tokens. Top-K retrieval picks ~4 chunks scoped to the question.

**Test:** verify `retrieveRelevantKb` is the function called (not `loadKnowledgeBaseCached`).

---

## 7. Sales engine fires silently with no observability

**File:** `saas/app/api/whatsapp/incoming/route.ts:359-371`
**Fixed:** May 2026
**How to reintroduce:** remove the `bump("sales_mode_<mode>")` and `bump("sales_skipped")` calls.
**Why it's important:** merchants couldn't see if their AI sales engine was working. Metrics make it visible at `/admin/metrics`.

---

## 8. Broadcast personalization fails silently

**File:** `saas/app/api/cron/broadcasts/route.ts:154-171`
**Fixed:** May 2026
**How to reintroduce:** replace the `try/catch` with `catch {}`.
**Why it's important:** if the LLM fails to personalize, the merchant sees identical-template broadcasts and assumes the feature is broken with no diagnostic.

---

## 9. Order extraction silent failure

**File:** `saas/app/api/whatsapp/incoming/route.ts:832-852`
**Fixed:** May 2026
**How to reintroduce:** replace the `catch` with `catch {}` (no SafetyAudit row).
**Why it's important:** orders could vanish during DB errors with no merchant signal.

---

## 10. Order extraction too restrictive on implicit buys

**File:** `saas/app/api/whatsapp/incoming/route.ts:485-506`
**Fixed:** May 2026
**How to reintroduce:** remove the unconditional `extractAndStoreOrder` call (only trigger on `flagged=true`).
**Why it's important:** customers don't always say "اوردر". Implicit "تمام عاوز" flows would be missed.

---

## 11. The `prisma db push` PATH issue

**File:** `package.json`, `deploy.ps1`
**Status:** environment quirk
**Recurring symptom:** `'prisma' is not recognized as an internal or external command`
**Cause:** npm adds `./node_modules/.bin` to PATH only in some shells. Raw PowerShell may not.
**Fix:** invoke binaries directly:
```powershell
node node_modules\prisma\build\index.js generate
node node_modules\prisma\build\index.js db push
node node_modules\next\dist\bin\next build
```
`deploy.ps1` handles this internally via `npx prisma`. **Don't "fix" the package.json scripts to call `npx`** — they work fine when invoked through `npm run`.

---

## 12. Anti-ban legacy file accidentally re-imported

**File:** `saas/lib/anti-ban.ts` (legacy)
**Status:** ongoing risk
**Symptom:** an agent reads `anti-ban.ts`, assumes it's the current safety engine, edits it. Nothing breaks immediately, but real safety lives in `lib/safety/engine.ts` (called via `assessAndShape`).
**Fix:** check that you're editing the right file. Search for `assessAndShape` to find the active path. `assessOutbound` from anti-ban is only used for `computePriority`.

---

## 13. Schema drift from `migrate dev` in prod

**File:** `saas/prisma/schema.prisma`
**Status:** preventable
**Recurring risk:** running `prisma migrate dev` instead of `prisma db push` in prod creates migration files locally that don't match prod state.
**Prevention:** ALWAYS use `prisma db push` in prod. Migration files in `prisma/migrations/` should be deleted or ignored unless you're moving to Postgres (see `POSTGRES_MIGRATION_PLAN.md`).

---

## How to use this file

- **Before editing a Tier-1 file:** scan this list for related entries.
- **After fixing a new regression:** add a numbered entry here. Include
  the file, fixed-date, how to reintroduce, why it matters, and a test.
- **During code review:** check the diff against this list. If any change
  touches a "How to reintroduce" pattern, ask the author to confirm intentionality.
