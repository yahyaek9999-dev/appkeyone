# KEYONE Production Audit Report

**Date:** 2026-05-15 21:00 UTC+03:00
**Auditor:** Cascade (read-only diagnostic mode)
**Method:** 4 phases of remote diagnostics against the live VPS
(`217.154.163.16`), no production mutations were made.

---

## Executive summary

The platform is in a **degraded but recoverable** state.

| Subsystem        | Status     | Notes                                                  |
|------------------|------------|--------------------------------------------------------|
| Next.js (3000)   | ✅ OK      | `/login` returns 200                                   |
| Caddy (80/443)   | ✅ OK      | Reverse proxy healthy                                  |
| WhatsApp service | ✅ OK      | 1 connected session (`201227704155`), pool 1/12        |
| **mse-llm**      | 🔴 DEAD   | Process alive, port 7788 closed, uvicorn shut down     |
| Broadcasts       | 🔴 BROKEN  | 4/4 failed with `No LID for user` from whatsapp-web.js |
| Phone data       | 🟡 PARTIAL | 2 stale rows with old buggy LID-as-phone format        |
| Suggestions API  | 🔴 BROKEN  | Depends on mse-llm                                     |
| Daily report     | 🟡 LATENT  | Wired but no Scheduled Task yet                        |
| DB / Prisma      | ✅ OK      | 26 messages last 24h, schema healthy                   |
| Inbox / metrics  | ✅ OK      | Reads work; AI suggest button breaks                   |

**Single biggest cause of merchant-visible failures**: **mse-llm
(in-house ChatGPT-driven LLM) lost its OpenAI web session and died**.
Re-logging the Chrome profile + restarting the service brings #1, #4
and #5 back. Long-term, the in-house provider needs to be replaced
with a real API endpoint — the current approach (Playwright driving
chatgpt.com) is unreliable by design.

---

## Issue #1 — `mse-llm` dead, all AI calls fail (P0)

### Symptoms
- Customer / merchant sees: `"عذراً، يبدو أن هناك خلل تقني مؤقت"`
- Inbox suggest-reply: `"تعذر جلب الاقتراحات"`
- Port 7788 closed; service shows "Running" because NSSM watches the
  nssm.exe parent, not python.exe inside.

### Root cause
`main.py` runs a Playwright `CloakBrowser` that drives **chatgpt.com**
through a persistent Chrome profile at `C:\app\chrome-profile`.
The session expired and every request now lands on
`https://auth.openai.com/` with title
`"Your session has ended - OpenAI"`. The composer selector
`#prompt-textarea` is never visible, so `_send_and_wait` times out
after 30s and returns 500. After enough back-to-back failures the
uvicorn process logged `Application shutdown complete.` and exited.

### Evidence (production logs)
```
[LITE-SERVER] DIAG send_wait_composer: url=https://auth.openai.com/
  title='Your session has ended - OpenAI'
INFO:  POST /v1/chat/completions HTTP/1.1 500 Internal Server Error
… (repeats hundreds of times) …
INFO:  Shutting down
INFO:  Application shutdown complete.
INFO:  Finished server process [7252]
```

### Affected files
- `main.py` (composer waiter)
- `saas/lib/llm.ts` (caller; swallows error → fallback string)
- `saas/app/api/chat/route.ts:128`
- `saas/app/api/whatsapp/incoming/route.ts:326`
- `saas/app/api/inbox/conversation/[id]/suggest-reply/route.ts`
- `saas/app/api/cron/broadcasts/route.ts` (personalize path)
- `saas/app/api/cron/follow-ups/route.ts`
- `saas/app/api/cron/daily-report/route.ts` (insights)

### Reproduction
1. `curl http://127.0.0.1:7788/v1/models` → connection refused
2. Send a WhatsApp message to the connected number → fallback string

### Recommended fix
**Immediate (P0, manual):**
1. RDP into the VPS and open `C:\app\chrome-profile` with a regular
   Chrome pointed at that user-data-dir, log into chatgpt.com, close
   Chrome. The mse-llm restart will then reuse the cookies.
2. `nssm restart mse-llm` and confirm port 7788 listens.

**Sustained (P1, code change — not a new feature):**
1. Add a real `/healthz` to `main.py` that returns 200 without
   touching the browser. Have NSSM run a watchdog (`AppExitAction`
   pointing at a watchdog script) that kills the service when
   `/healthz` is unreachable from inside.
2. Wrap the in-house provider behind a circuit breaker in
   `saas/lib/llm.ts` so when the upstream is unhealthy we don't
   send 200 ms-spaced retries — back off for 60 s.
3. **Strongly recommended**: configure the merchant bot to use an
   external provider (`openai`, `gemini`, etc.) so the in-house
   browser bot is no longer on the hot path. The UI for this
   already exists at `/dashboard/settings/ai-provider`.

### Deployment risk
- Manual re-login: zero risk.
- Code change for `/healthz` + circuit-breaker: low risk; existing
  caller already catches errors.

### Verification
- `Invoke-WebRequest http://127.0.0.1:7788/healthz` → 200
- `Invoke-WebRequest http://127.0.0.1:7788/v1/chat/completions ...`
  → 200 with non-empty content
- Send a WhatsApp message and observe a non-fallback reply.

---

## Issue #2 — Broadcasts 4/4 failed (P0)

### Symptoms
Latest broadcast `cmp79aah…`: `total=4, sent=0, failed=4`. All
items recorded the same upstream error:
```
{"error":"No LID for user\ns (https://static.whatsapp.net/rsrc.php/v4/yI/r/A3PSxQB1RSd.js:79:180)"}
```
even for a clean number like `+201111111111`.

### Root cause
`whatsapp-service/src/sessions.js:409`:
```js
const cleaned = toPhone.replace(/^\+/, '').replace(/[^\d]/g, '');
const jid = `${cleaned}@c.us`;
return s.client.sendMessage(jid, text);
```
WhatsApp Web's modern wire protocol resolves the recipient's
**LID** (privacy-friendly internal id) before sending. Calling
`sendMessage("201111111111@c.us", …)` for a contact the session
has **never chatted with before** fails inside the SDK because no
LID exists in the local address book. The error
`"No LID for user\ns"` is thrown from
`https://static.whatsapp.net/rsrc.php/v4/yI/r/A3PSxQB1RSd.js`,
i.e. WhatsApp's own bundle, not whatsapp-web.js.

This is a regression of WhatsApp's web protocol that broke
direct `@c.us` sends for cold contacts. whatsapp-web.js fixed it
by exposing `client.getNumberId(phone)` which does the lookup
through `Store.WidFactory.createWid` and returns the LID-aware
JID.

### Evidence
4/4 failed items, including the real `+201111111111`, all with
identical error string. WA service itself is healthy
(`/sessions/stats` → connected).

### Affected files
- `whatsapp-service/src/sessions.js` (`send` method, line 395-412)

### Fix
Resolve the JID first; fail fast and clearly if the number is not
on WhatsApp. Single function, ~15 lines.

```js
async send(userId, toPhone, text) {
  let s = this.sessions.get(userId);
  if (s && s.status === 'idle-closed') {
    s = await this.start(userId);
    const start = Date.now();
    while (Date.now() - start < 15000 && s.status !== 'connected') {
      await sleep(500);
    }
  }
  if (!s || s.status !== 'connected') throw new Error('session not connected');
  s.lastActivityAt = Date.now();

  // Reject obviously-broken inputs from old data (LID stored as phone).
  if (toPhone.startsWith('lid:') || toPhone.includes('@lid')) {
    throw new Error('cannot send to WhatsApp LID; no public phone available');
  }

  const cleaned = toPhone.replace(/^\+/, '').replace(/[^\d]/g, '');
  if (cleaned.length < 8 || cleaned.length > 15) {
    throw new Error(`invalid phone format: "${toPhone}"`);
  }

  // Modern WA Web requires a LID-aware JID for cold contacts.
  // getNumberId() returns null if the number is not on WhatsApp.
  const numberId = await s.client.getNumberId(cleaned);
  if (!numberId) {
    throw new Error('number not registered on WhatsApp');
  }
  return s.client.sendMessage(numberId._serialized, text);
}
```

### Deployment risk
Medium. `getNumberId` adds one network round-trip per send (~200 ms).
Broadcast cron already delays `SEND_DELAY_MS=2500` between sends,
so throughput is unchanged. The inbox auto-reply path also uses
`wa.send`; the extra hop is negligible compared with LLM latency.

### Regression risk
Low. Existing behavior (warm contacts) still works because
`getNumberId` returns the same JID for them.

### Verification
1. Re-run the existing failed broadcast `cmp79aah…` after the fix.
2. Confirm the real number `+201111111111` ends in `status='sent'`.
3. Confirm the LID rows (`+162693377974496…`) end in `status='failed'`
   with a clearer error string than today's WhatsApp internal one.

---

## Issue #3 — Stale buggy phones in customer DB (P1)

### Symptoms
Two `Customer` rows share the same `name="Yahya Kashkoush"`:
- `+162693377974496`
- `+162693377974496@lid`
Both are WhatsApp **LIDs**, not phones. Created before the
`looksLikePhone` fix shipped.

### Root cause
Before the recent fix to `whatsapp-service/src/sessions.js`, any
JID that ended in `@lid` was stored as `+<digits>` (and one path
even kept the `@lid` suffix). The Customer.phone field is
treated as the unique identity, so two malformed rows now exist
for the same physical user.

### Affected files
- `saas/prisma/prod.db` (data only)

### Fix
One-shot SQL migration:

```sql
-- 1. Drop the literal @lid duplicate (it's the same person)
DELETE FROM Customer WHERE phone LIKE '%@lid';

-- 2. Re-stamp the LID-as-phone rows so the UI shows them as LIDs
UPDATE Customer
   SET phone = 'lid:' || REPLACE(phone, '+', '')
 WHERE LENGTH(REPLACE(phone, '+', '')) > 15
   AND phone NOT LIKE 'lid:%';
```

### Deployment risk
Low. Only 2 rows affected. Conversation/Message rows reference
`customerId` which is unchanged.

### Regression risk
Low. The phone formatter shipped last session (`lib/phone.ts`)
already handles the `lid:` prefix.

### Verification
- `SELECT phone, name FROM Customer WHERE LENGTH(phone) > 16;`
  → empty
- `/dashboard/customers` shows the affected row labelled as
  "معرّف واتساب" instead of a fake phone.

---

## Issue #4 — AI suggestions endpoint failing (rolled up under #1)

`/api/inbox/conversation/[id]/suggest-reply` returns HTTP 502 with
`{error:"llm_error", detail:"…"}`. Pure downstream of #1; resolves
when mse-llm is healthy. No code change needed here.

Optional minor polish:
- `saas/app/dashboard/inbox/inbox-ui.tsx` could surface
  `detail` to the merchant instead of a generic toast so the
  failure mode is identifiable.

---

## Issue #5 — mse-llm `/healthz` (rolled up under #1)

No `/healthz` route exists. Adding a non-browser-touching one is
both observability and a precondition for any future automated
watchdog/restart. Single-route change in `main.py`.

---

## Issue #6 — WhatsApp service stability (no current incident)

Audit found wa-service healthy: 1 session connected for ~2h, no
errors in `/sessions/stats`. The `wa.start` issues from earlier in
the project (re-locking after Chromium eviction) appear to be
resolved by the existing `auto-resume on send()` path
(`sessions.js:398-405`). No fix recommended at this time.

---

## Issues NOT triggered today (verified)

| Area                        | Result                                              |
|-----------------------------|-----------------------------------------------------|
| Login / auth                | OK (200 from `/login`)                              |
| Caddy → SAAS routing        | OK                                                  |
| Customer phone formatter UI | OK after last session's fix                         |
| Lead scoring                | Read-side OK; write side depends on LLM             |
| Order creation              | Code path unchanged; no failures in last 24h        |
| Inbox polling               | OK                                                  |
| Inbox metrics               | OK                                                  |
| Memory engine               | Depends on LLM (fails gracefully when down)         |
| Sales intel pages           | OK (heuristic-only)                                 |
| Mobile UX                   | Pending audit (deferred per "no UI polish" rule)    |
| Reconnect flows             | OK; wa-service auto-restores sessions on boot       |

---

## Prioritized fix plan

| #   | Change                                                          | Files                                          | Risk |
|-----|-----------------------------------------------------------------|------------------------------------------------|------|
| F1  | Manual: re-login Chrome profile + `nssm restart mse-llm`        | (operational, no code)                         | none |
| F2  | wa-service `send()` uses `getNumberId` + rejects LIDs           | `whatsapp-service/src/sessions.js`             | low  |
| F3  | SQL fix-up of stale LID rows                                    | `saas/prisma/prod.db`                          | low  |
| F4  | Add `/healthz` to `main.py` (no browser touch)                  | `main.py`                                      | low  |
| F5  | Log the actual LLM error before falling back to Arabic message  | `saas/app/api/chat/route.ts`, `…/whatsapp/incoming/route.ts` | low  |
| F6  | Circuit-breaker in `lib/llm.ts` so failed in-house LLM short-circuits for 60 s instead of waiting 60 s per request | `saas/lib/llm.ts` | medium |

F1–F4 are the **production-breaking fixes**.
F5–F6 are **reliability hardening**, also strictly bug-fixing,
not features.

---

## Verification matrix (after F1–F4 deployed)

| Verification                                                | Expected            |
|-------------------------------------------------------------|---------------------|
| `curl http://127.0.0.1:7788/healthz`                        | 200                 |
| `curl http://127.0.0.1:7788/v1/chat/completions` (ASCII)    | 200, non-empty text |
| WhatsApp message → bot                                      | real reply          |
| Inbox suggest-reply button                                  | 3 suggestions       |
| Re-queue a broadcast item for `+201111111111`               | status=sent         |
| Re-queue a broadcast item for `+162693377974496` (LID row)  | status=failed, "cannot send to WhatsApp LID" |
| Customer list                                               | no `@lid` rows      |
