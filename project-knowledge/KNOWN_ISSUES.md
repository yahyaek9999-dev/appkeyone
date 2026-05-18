# Known Issues

> Last verified: **2026-05-17**. Updated whenever a real production incident
> is encountered. If you fix an issue here, move it to `REGRESSION_RISKS.md`.

---

## 🔴 P0 — `mse-llm` is fragile (depends on chatgpt.com session)

**Status:** unresolved (architectural)
**Symptom:** All AI calls return `"عذراً، يبدو أن هناك خلل تقني مؤقت"`. Port 7788 may show closed even though NSSM reports "Running".
**Root cause:** `main.py` drives `chatgpt.com` via Playwright. When the OpenAI session expires, every request hits `auth.openai.com/`, times out at 30s, and after enough failures `uvicorn` shuts down. NSSM watches `nssm.exe`, not `python.exe`, so it can't detect the inner process died.
**Workaround:**
1. RDP to VPS, open `C:\app\chrome-profile` in real Chrome, log in to chatgpt.com, close Chrome.
2. `nssm restart mse-llm`.
3. **Better:** switch merchants to a real provider via `/dashboard/settings/ai-provider` (openai/gemini/etc.).

**Monitoring:** watch `llm_fail / llm_call` ratio at `/admin/metrics`. >5% → investigate.

**Reference:** `audits/production-audit-summary.md` Issue #1.

---

## 🟡 P1 — Broadcasts fail with `No LID for user` for some recipients

**Status:** unresolved
**Symptom:** Broadcast items recording error `{"error":"No LID for user\ns..."}` even for clean E.164 phones like `+201111111111`.
**Root cause (suspected):** whatsapp-web.js cannot resolve a "Linked Device ID" for fresh contacts the bot has never messaged before. Internal whatsapp-web protocol detail.
**Workaround:** message the customer at least once before broadcasting to them. The hot path's `onInbound` accrues contact info that helps subsequent sends. Not a code fix.
**Monitoring:** look at `BroadcastItem.error` field in failing rows.

**Reference:** `audits/production-audit-summary.md` Issue #2.

---

## 🟡 P1 — SQLite write contention not measured

**Status:** uncertain
**Symptom:** Under high concurrent merchant load, Prisma may serialize writes and increase tail latency.
**How to detect:** SQLite's default `busy_timeout` may surface as `SQLITE_BUSY` errors in `mse-saas.err.log`. Today: no such errors observed at 1-2 active merchants.
**Mitigation plan:** see `POSTGRES_MIGRATION_PLAN.md`. Migrate when:
- More than 5 active merchants concurrently AND
- p99 reply time exceeds 5s AND
- Logs show `SQLITE_BUSY`

---

## 🟡 P1 — Chromium RAM ceiling on 8GB VPS

**Status:** known design constraint
**Symptom:** Adding the 13th merchant evicts the LRU session. Reconnect may require a fresh QR scan if `LocalAuth` is corrupted.
**Workaround:** `WA_MAX_SESSIONS=12`. To raise, increase VPS RAM (16GB → 24 sessions). See `SCALING_PLAN.md`.

---

## 🟢 P2 — `npm run build` fails in raw PowerShell

**Status:** environment quirk
**Symptom:** `'prisma' is not recognized as an internal or external command` when running `npm run build` outside `deploy.ps1`.
**Root cause:** npm adds `./node_modules/.bin` to PATH only in some shell contexts. Direct invocation works:
```powershell
node node_modules\prisma\build\index.js generate
node node_modules\next\dist\bin\next build
```
`deploy.ps1` handles this internally via `npx`. Only a problem if manually building.

---

## 🟢 P2 — Broadcast safety gates (`lib/safety/broadcast.ts`) integration uncertain

**Status:** needs verification
**Symptom:** The file `lib/safety/broadcast.ts` exists but is not visibly called from the broadcast cron worker (`/api/cron/broadcasts/route.ts`).
**Investigation needed:** confirm by grep + dev log. May be a planned-but-not-wired feature. **Marked uncertain.**

---

## 🟢 P2 — Working hours don't span midnight

**Status:** known limitation
**Symptom:** `inWorkingHours` returns false for slots like `{from:"22:00", to:"06:00"}`.
**Workaround:** split into two slots (`22:00-23:59` + `00:00-06:00`). UI doesn't currently make this easy.
**Fix idea:** detect `to < from` and wrap into two virtual slots inside `inWorkingHours`. ~10 line change.

---

## 🟢 P2 — Stale broadcast items released globally per tick

**Status:** mitigated, not perfect
**Symptom:** A row stuck in `sending` because a tick crashed will be re-released to `pending` at the start of the next tick — but so will rows that the CURRENT tick is actively processing.
**Mitigation:** the atomic claim re-acquires before each send, so a currently-processing row will fail the claim of the second tick and be skipped.
**Better fix idea:** add `claimedAt DateTime?` to `BroadcastItem` and filter recovery on `claimedAt < now - 5m`.

---

## 🟢 P3 — No automated tests

**Status:** open
**Symptom:** No unit or integration test framework. Every change is verified manually.
**Mitigation:** start with `jest` on pure-function libs (`lib/tz.ts`, `lib/semantic-match.ts`, `lib/order-extractor.ts`). See `TESTING_CHECKLIST.md`.

---

## 🟢 P3 — `lib/anti-ban.ts` still in repo but superseded

**Status:** legacy code, partially used
**Symptom:** `lib/anti-ban.ts:assessOutbound` is imported but only its `computePriority` is on the hot path (line 28 of `incoming/route.ts`). The actual gating is done by `lib/safety/engine.ts:assessAndShape`.
**Risk:** future agents may edit `lib/anti-ban.ts` thinking it's still relevant, breaking nothing visible until production load picks up.
**Action:** label or eventually delete `lib/anti-ban.ts`. See `REGRESSION_RISKS.md`.

---

## Tracking template for new issues

```markdown
## 🔴/🟡/🟢 P0/P1/P2/P3 — short title
**Status:** unresolved | mitigated | needs verification
**Symptom:** what you observe
**Root cause:** confirmed or suspected
**Workaround:** how to make it stop bleeding now
**Monitoring:** what to watch
**Reference:** path/to/audit/or/code
```
