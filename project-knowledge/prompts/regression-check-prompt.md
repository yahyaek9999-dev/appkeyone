# Prompt: Regression Check

> Use before committing or deploying a change to catch reintroduced bugs.

---

You're about to deploy a change to **KEYONE**. Run this checklist first.

## The 13 regression patterns (from `REGRESSION_RISKS.md`)

For each, **check whether your diff reintroduces it.**

### 1. Broadcast atomic claim removed?
Search your diff for: `prisma.broadcastItem.updateMany`. If you removed or simplified this block in `app/api/cron/broadcasts/route.ts`, **STOP** — your change will cause duplicate sends.

### 2. Working hours UTC bug?
Search for: `getHours()`, `getDay()` near `workingHours` logic. If used without `partsInTz(now, tz)`, **STOP** — Cairo merchants will see UTC behavior.

### 3. Daily report wrong hour?
Search for: `localHour`, `localYmd` calls in `app/api/cron/daily-report/route.ts`. If replaced with `getHours()` or `toISOString().slice(0,10)`, **STOP**.

### 4. Notification silent fail?
Search for: `wa.send` near `notifyMerchant` / `notifyAdmin`. If you removed the `SafetyAudit.create` call on failure, **STOP**.

### 5. Self-send guard removed?
Search for: `isOwnWhatsappNumber` in `lib/notify.ts`. If you removed the digit-suffix comparison or the calling site, **STOP**.

### 6. KB fully stuffed in prompt?
Search for: `retrieveRelevantKb` in `app/api/whatsapp/incoming/route.ts`. If replaced with `loadKnowledgeBaseCached`, **STOP** — token cost will balloon.

### 7. Sales engine observability removed?
Search for: `bump("sales_mode_` and `bump("sales_skipped")`. If removed, the merchant loses sales visibility.

### 8. Broadcast personalize silent fail?
Search for: `SafetyAudit.create` near LLM call in `app/api/cron/broadcasts/route.ts`. If you wrapped in empty `catch {}`, **STOP**.

### 9. Order extraction silent fail?
Search for: `SafetyAudit.create` near `extractAndStoreOrder` catch block. If you wrapped failures in empty catch, **STOP**.

### 10. Order extraction too restrictive?
Search for: `extractAndStoreOrder` call. If you wrapped it in `if (flagged)`, **STOP** — implicit buys will be missed.

### 11. `npm run build` script break?
Did you change `package.json` build script? If you switched `prisma generate &&` to `npx`, untested — flag for review.

### 12. Anti-ban legacy file edited?
Are you editing `saas/lib/anti-ban.ts`? Confirm you understand it's legacy. The real safety engine is `saas/lib/safety/engine.ts`.

### 13. Schema drift?
Are you adding a non-nullable column without `@default`? **STOP** — `prisma db push` will refuse.

## Additional checks

### Cookie/auth
- Did you change `lib/auth.ts`? Confirm `SameSite`, `HttpOnly`, `Secure` flags still set.

### Internal secret
- Did you change `SAAS_INTERNAL_SECRET` check? Ensure all 4 services share the same env.

### Background jobs
- Did you add `await` to any of these in `app/api/whatsapp/incoming/route.ts`?
  - `triggerMemoryUpdate`
  - `notifyMerchant`
  - `notifyAdmin`
  - `extractAndStoreOrder`
  - `classifyAndScore`
  - `recordKnowledgeGap`
  - `onInbound`
  - `recordInboundReply`
  - `persistNegotiationState`
  If yes, **STOP** — hot path latency will degrade.

### Safety engine
- Did you edit any file in `lib/safety/`?
  - Did you add an LLM call? **STOP.**
  - Did you remove an audit write? **STOP.**
  - Did you change stage limits? Document and justify.

### Memory engine
- Did you lower `MEMORY_EXTRACT_EVERY` below 5?

### KB cache
- Did you lower `minScore` below 0.05?
- Did you raise `charBudget` above 5000?

### LLM
- Did you raise `LLM_MAX_CONCURRENT` above 5? **STOP** — mse-llm Chromium may OOM.

## Final question

Answer YES or NO to each:

- [ ] I read all related docs in `/project-knowledge/`
- [ ] I checked all 13 regression patterns above
- [ ] `npx tsc --noEmit -p .` returns 0 errors
- [ ] My change is the smallest possible
- [ ] I preserved all existing comments
- [ ] I added audit logging on new failure paths
- [ ] I added metrics on new success paths
- [ ] I have a manual test plan

If any is NO, **fix before deploying**.

If all YES, you're cleared to deploy via `/project-knowledge/prompts/deployment-prompt.md`.
