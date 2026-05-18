# Production Audit Summary

> Latest comprehensive audit: **2026-05-15** (original audit) + **2026-05-17** (post-fix verification).
> Original audit document: `/PRODUCTION_AUDIT_REPORT.md` at repo root.

## Executive snapshot (post-fix, 2026-05-17)

| Subsystem | Status | Notes |
|---|---|---|
| Next.js (3000) | 🟢 OK | `/login` returns 200 |
| Caddy (80/443) | 🟢 OK | HTTPS healthy |
| WhatsApp service | 🟢 OK | ≥1 session connected |
| `mse-llm` | 🟡 fragile | Running but liable to die on chatgpt.com session expiry |
| Broadcasts | 🟢 FIXED | Atomic claim eliminated duplicate sends |
| Phone data | 🟡 partial | 2 historical rows with LID-as-phone format remain |
| Suggestions API | 🟡 depends on `mse-llm` | Migrate merchants to external provider |
| Daily report | 🟢 FIXED | Timezone-aware as of May 2026 |
| DB / Prisma | 🟢 OK | Schema in sync, `Bot.timezone` added |
| Inbox / metrics | 🟢 OK | Reads work end-to-end |

## Issues fixed in May 2026

### #1 — Broadcast duplicate sends (P0)
- **Root cause:** No atomic claim. Two overlapping cron ticks could send same item twice.
- **Fix:** `updateMany({status:"pending"} → "sending")` block in `cron/broadcasts/route.ts:104-112`.
- **Status:** Resolved. See `REGRESSION_RISKS.md` #1.

### #2 — Working hours in UTC (P1)
- **Root cause:** `Date.getHours()` returns UTC on Windows server.
- **Fix:** Added `Bot.timezone` + `partsInTz()` helpers in `lib/tz.ts`.
- **Status:** Resolved. See `REGRESSION_RISKS.md` #2.

### #3 — Daily report wrong hour (P1)
- **Root cause:** Cron used UTC hour to filter merchants.
- **Fix:** `localHour(tz, now)` + `localYmd(tz, now)` in daily-report cron.
- **Status:** Resolved. See `REGRESSION_RISKS.md` #3.

### #4 — Notification failures silent (P1)
- **Root cause:** `catch {}` swallowed all errors.
- **Fix:** Every failure now writes `SafetyAudit` (category=`notify`).
- **Status:** Resolved. See `REGRESSION_RISKS.md` #4.

### #5 — Self-send to bot's own number (P2)
- **Root cause:** Merchant misconfigures `notifyPhone = whatsappPhone` → WA rejects with cryptic error.
- **Fix:** `isOwnWhatsappNumber` guard + audit row with merchant-friendly explanation.
- **Status:** Resolved.

### #6 — Phone resolution chain missing (P1)
- **Root cause:** Alerts only used `bot.notifyPhone`. If empty, alerts disappeared.
- **Fix:** `resolveNotifyPhone(userId)` → `bot.notifyPhone || bot.whatsappPhone || user.phone`.
- **Status:** Resolved.

### #7 — KB stuffed into every prompt (P2 cost)
- **Root cause:** `loadKnowledgeBaseCached` returned the entire merchant KB.
- **Fix:** `retrieveRelevantKb(userId, question, {k:4, charBudget:3500})` — top-K with TF-cosine + Jaccard.
- **Status:** Resolved.

### #8 — Order extraction silently failed (P1)
- **Root cause:** DB errors caught with `catch {}`. Orders vanished.
- **Fix:** `SafetyAudit (category=orders, level=warn)` on every failure.
- **Status:** Resolved.

### #9 — Implicit buys missed (P2)
- **Root cause:** Order extraction only triggered on flagged keywords.
- **Fix:** Unconditional background scan with `confidence>=50` gate.
- **Status:** Resolved.

### #10 — Broadcast personalize silent on LLM fail (P2)
- **Root cause:** `catch {}`. Merchant saw identical-template broadcasts and assumed feature broken.
- **Fix:** `SafetyAudit (category=broadcast)` on first failure of each broadcast.
- **Status:** Resolved.

### #11 — Sales engine no visibility (P3)
- **Root cause:** No counters for which mode fired.
- **Fix:** `bump("sales_mode_<mode>")` + `bump("sales_skipped")`. Visible at `/admin/metrics`.
- **Status:** Resolved.

## Issues still open

See `KNOWN_ISSUES.md` for full list. Highlights:
- **`mse-llm` fragility** (P0 architectural) — recommend migrating merchants to external providers.
- **Broadcast `No LID for user` errors** (P1) — `whatsapp-web.js` quirk; mitigation: message customer first.
- **SQLite contention at scale** (P1 future) — see `POSTGRES_MIGRATION_PLAN.md`.

## Methodology of the May 2026 audit

1. **Read-only diagnostic mode** — no production mutations during audit
2. Remote checks: `Invoke-WebRequest` against localhost ports on VPS
3. Log review: `mse-saas.err.log`, `mse-llm.err.log`, `mse-wa.err.log`
4. DB inspection via `prisma studio` (read-only)
5. WhatsApp manual test from a personal phone
6. Reproduction of broadcast bug via concurrent cron tick simulation

## Recommended next audit cycle

- Quarterly (every 90 days)
- After each major deploy
- After any P0 incident

## Audit deliverables checklist (for future audits)

When auditing this codebase:
- [ ] Health of all 4 NSSM services
- [ ] Latest 5 entries in each `*.err.log`
- [ ] `SafetyAudit` rows of last 7 days, grouped by category
- [ ] `MetricEvent` aggregate of last 7 days — look for `llm_fail` ratio, `anti_ban_cooldown` count
- [ ] Open `Broadcast` count (should be 0 most of the time)
- [ ] WA session pool: `GET /sessions/stats`
- [ ] Manual WhatsApp test (the 8 scenarios from `TESTING_CHECKLIST.md`)
- [ ] Verify a `prisma db push` runs clean
- [ ] Verify `deploy.ps1` is the only deploy mechanism (no stale `update.ps1`)
