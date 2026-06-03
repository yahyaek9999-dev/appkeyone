# WA Service Investigation Report

**Date:** 2026-06-03
**Trigger:** `verify:all` and `verify:reliability` both returned FAIL on a single check — `reliability:wa-service — fetch failed` — during a pre-deployment gate.
**Objective:** Determine, with evidence only (no assumptions), whether the failure is (A) a local verification-environment limitation, or (B) a real production issue.
**Mode:** Read-only SSH investigation against the production VPS. No deployment, no production mutation, no database writes.

---

## Verdict

> ### B) Production issue confirmed
>
> The **specific** `reliability:wa-service` check failure is, in isolation, a **local-environment artifact** — the whatsapp-service is reachable and returns healthy on the VPS. **However**, the read-only investigation it prompted uncovered a **separate, genuine production problem**: WhatsApp message delivery is stalled. The WhatsApp session is not connected, 12 messages have been stuck in the outgoing queue for ~34 hours, and **zero messages have been sent in the last 24 hours**.
>
> Because production is **not** fully healthy, deployment remains **stopped** pending approval. (Note: this delivery stall is pre-existing and independent of the pending build — the deploy does not touch the WhatsApp send pipeline.)

---

## Evidence collected (read-only)

All commands executed over SSH to `Administrator@217.154.163.16` (Windows VPS). No writes to production state or database.

### 1. Service status — `mse-saas` (SaaS app)
```
nssm status mse-saas  →  SERVICE_RUNNING
```
✅ SaaS application service is running.

### 2. Service status — `mse-wa` (whatsapp-service)
```
nssm status mse-wa  →  SERVICE_RUNNING
```
✅ WhatsApp service process is running.

### 3. whatsapp-service `/health` (http://127.0.0.1:3001/health)
```
HTTP 200
{
  "ok": true,
  "sessions": [
    {
      "id": "cmpbui2w70000bsbkee75htjf",
      "status": "connecting",        ← NOT connected
      "phone": null,                 ← no number bound
      "pairingCode": null,
      "lastActivityAt": 1780414362960,
      "idleMs": 64904621,            ← ~18h idle
      "connectedAt": null,           ← never connected this lifetime
      "reconnectAttempts": 1,
      "hibernated": false,
      "priority": 0
    }
  ]
}
```
✅ Service endpoint is **reachable and returns HTTP 200** (this disproves the local "fetch failed" as a production reachability problem).
⚠️ But the only session is **`connecting` / `phone: null` / `connectedAt: null`** — the WhatsApp session is **not actually connected** and cannot send.

### 4. App liveness — `/api/health` (http://127.0.0.1:3000/api/health)
```
HTTP 200
{"status":"ok","db":"ok","uptime":64277,"version":"a0fb40f-20260602","timestamp":"2026-06-03T09:34:27.631Z","latencyMs":4}
```
✅ App is live, DB reachable (latency 4 ms). **Deployed version = `a0fb40f`** (the older, currently-live build).

### 5. App readiness — `/api/ready` (http://127.0.0.1:3000/api/ready)
```
ERROR: (404) Not Found
```
ℹ️ **404 is expected and local-only-explained.** The `/api/ready` route is an **untracked new file** (`git status` → `?? saas/app/api/ready/route.ts`) that has **not been committed or deployed**. It exists only in the pending changes on this dev machine. The live VPS build (`a0fb40f`) predates it. This is part of the pending deployment, not a production regression.

### 6. Deployed commit vs. verify-suite scope
```
VPS HEAD = a0fb40f
node scripts/verify/run.js reliability --json  →  {"ok":false,"results":[{"name":"verify:scope","status":"fail","detail":"Unknown verification scope: reliability"}]}
```
ℹ️ The VPS build (`a0fb40f`) does not yet contain the `reliability` verify scope — it is part of the pending, undeployed changes. Confirms the live build is older than the working tree.

### 7. Outgoing queue health (read-only Prisma counts against prod DB)
```
QUEUE_HEALTH = {
  "queued": 12,
  "sending": 0,
  "staleQueued": 12,        ← all 12 older than 30 min
  "failed24h": 0,
  "sent24h": 0,             ← ZERO sends in last 24h
  "oldestAgeSec": 123377    ← oldest queued ~34.3 hours
}
```
❌ **12 messages queued, all stale; 0 sent in 24h; oldest waiting ~34 hours.** No failures recorded (they are not failing — they are simply never being drained).

### 8. Recent message processing (last 5 `waMessage` rows)
```
RECENT_MESSAGES = [
  {"id":"cmpwwr84i...","status":"queued","queuedAt":"2026-06-02T17:25:04Z","sentAt":null},
  {"id":"cmpwn3zch...","status":"queued","queuedAt":"2026-06-02T12:55:03Z","sentAt":null},
  {"id":"cmpvts59t...","status":"queued","queuedAt":"2026-06-02T03:16:27Z","sentAt":null},
  {"id":"cmpogxki5...","status":"queued","queuedAt":"2026-06-01T23:22:08Z","sentAt":null},
  {"id":"cmpnngqwo...","status":"sent",  "queuedAt":"2026-06-01T23:21:39Z","sentAt":"2026-06-01T23:22:02Z"}
]
```
❌ The **last successfully sent** message was `2026-06-01T23:22:02Z` — **over 34 hours before this investigation**. Every message queued since then is stuck.

---

## Analysis

| Question | Finding | Evidence |
|----------|---------|----------|
| Is whatsapp-service reachable on prod? | ✅ Yes — HTTP 200 | §3 |
| Was the `reliability:wa-service` FAIL a local artifact? | ✅ Yes — local `.env` points `WHATSAPP_SERVICE_URL` at `127.0.0.1:3001`, which isn't running on the dev Mac; on the VPS it is healthy | §3, local `.env:6` |
| Was the `/api/ready` 404 a real regression? | ❌ No — route is untracked/undeployed (`?? saas/app/api/ready/route.ts`) | §5 |
| Is production fully healthy? | ❌ **No** | §3, §7, §8 |
| Is WhatsApp delivery working? | ❌ **No** — session never connected (`connectedAt: null`, `phone: null`), 12 stale queued, 0 sent/24h | §3, §7, §8 |

**Root cause of the delivery stall:** The WhatsApp session is in `connecting` state with no bound phone and has never connected this lifetime. With no live session, the outgoing-queue drainer has nothing to send through, so messages accumulate in `queued` indefinitely (not `failed` — they are simply never dispatched). This matches the local DB snapshot where all 3 bots show `status: "disconnected"`.

**Relationship to the pending deployment:** None causal. The pending build does **not** modify the WhatsApp send pipeline (per CLAUDE.md constraint). This stall is a **pre-existing production operational issue**, surfaced — not caused — by the verification gate.

---

## Conclusion & recommendation

- The **`reliability:wa-service` check failure itself is a local-environment limitation** (Conclusion A for that single check, narrowly).
- **But production is not healthy** — WhatsApp delivery is stalled (session disconnected, 34h backlog, 0 sends/24h). Per the stop-on-failure contract, the honest overall verdict is **B) Production issue confirmed**.

**Deployment status: STOPPED. Awaiting approval.**

Recommended next actions (not yet taken — read-only investigation only):
1. **Reconnect the WhatsApp session** on the VPS (re-scan QR / re-pair the bot whose session is `connecting`/`phone: null`). This is the actual production fix and is independent of the code deploy.
2. After reconnection, confirm the 12 stale queued messages drain (`sent24h` > 0, queue depth drops).
3. Separately decide whether to proceed with the code deployment — it is functionally unrelated to the delivery stall, and it ships the `/api/ready` readiness probe and the `reliability` verify scope that would make this condition observable in-suite going forward.
4. If proceeding with deploy, re-run `verify:reliability` **on the VPS** (post-deploy) where `WHATSAPP_SERVICE_URL` resolves correctly, so the wa-service check passes rather than skips.

---

*Investigation performed read-only. No production state modified, no database writes, no messages sent, no deployment executed.*
