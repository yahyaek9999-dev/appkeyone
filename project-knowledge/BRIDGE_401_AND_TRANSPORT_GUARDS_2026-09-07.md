# Bridge Cloud 401 + QR transport guards

**Period:** 2026-09-05 → 2026-09-07
**Production at close:** `1dd56b4` (verified live, `/api/health`)
**Baseline at open:** `6b4b0e4`

Field-reported symptoms, all resolved. Every claim below carries its evidence;
anything unproven says so.

---

## 1. The Bridge Cloud 401 — a regression I introduced

### Symptom
```
keyone-bridge login  → 401
cloud rejected this bridge's token (401)   [retrying every 60s]
```
Plus an earlier `301` on the WebSocket.

### Root cause
Commit `5038111` added `apiGate()` to **all nine** `bridge/v1` routes. Two of
them are machine-facing and never carry a KEYONE session:

| Route | Its own auth | Effect of the gate |
|---|---|---|
| `device/start` | device-code + PKCE (RFC 8628/7636) | **401 on every `login`** |
| `token/rotate` | `Authorization: Bearer <bridge_token>` | token rotation 401s |

`apiGate` answers 401 when `getAuthContext()` finds no session, so gating these
did not paywall them — it made them permanently unreachable. `device/start` is
the first call `login` makes.

**Both files said so in their own headers.** `device/start` line 9 read *"No auth
(the Bridge has no token yet)"*. An earlier audit of mine even classified
`device/token` and `health` as correctly-ungated machine endpoints and still
missed that these two are the same kind.

### Evidence
- Reproduced against live production before the fix:
  `POST /api/bridge/v1/device/start` → `401 {"error":"unauthorized"}`
- **`BridgeAuthCode = 0`** in production — not one device-code had ever been
  minted, proving the endpoint never once reached its insert.

### All three symptoms, one chain
| Symptom | Cause |
|---|---|
| `login` 401 | the gate on `device/start` |
| WebSocket 401 | `Bridge = 0`, `BridgeToken = 0` — the gateway's `verifyToken()` matched nothing, because login could never complete |
| `301` | `KEYONE_CLOUD_WS` pointing at `w.keyone1.com`, which 301-redirects. **WebSocket clients do not follow redirects.** Config does not persist URLs, so this was an env override on that machine |

The WS 401 was a downstream symptom, not a second bug.

### Fix — `66b598d`
Un-gated the two Bridge-facing routes; the other seven (`requirePermission` /
session-scoped) keep the gate, so Bridge entitlement is still enforced on the
surfaces that have a session. Both files carry a `DO NOT add apiGate()` marker.

The coverage test only checked for *missing* gates and was blind to this
direction. It now also asserts that machine-facing endpoints carry **no**
`apiGate` call — `device/start`, `device/token`, `token/rotate`, `health`,
`whatsapp/incoming`, the Meta webhook. Mutation-checked.

### Verified end-to-end on the real device
| Step | Evidence |
|---|---|
| login succeeded | `BridgeAuthCode` rows exist (was 0) |
| token accepted | `BridgeToken` created 19:11:39, **`lastUsedAt` 19:17:41** — the gateway query matched and touched it |
| WS stayed up | `lastHeartbeatAt` 19:18:56 |
| Bridge registered | `DESKTOP-QW8E9T`, version `1.0.11-wweb` |
| **WhatsApp connected** | `BridgeTransport` state `connected`, identity `201227704155` |
| dashboard reflects it | tenant auto-flipped `qr` → `bridge` at 19:19:40 |

---

## 2. Version mismatch — the store advertised older code than it shipped

`bridge-node/package.json` said `1.0.3`; the runtime constant says
`1.0.11-wweb`. The installer store was published at 1.0.3.

Not cosmetic: `isNewer()` strips the suffix and compares `1.0.11` vs `1.0.3`, so
an installed Bridge considers itself **newer** and never updates. Verified by
running the real comparison — `isNewer("1.0.11-wweb", "1.0.3")` → `false`.

Fixed in `782fbe7` (package.json aligned). **The store still advertises 1.0.3
until re-published** — follow-up, not done:

```bash
KEYONE_SSH_KEY=~/.ssh/keyone-prod.pem KEYONE_HOST=ubuntu@16.171.230.84 \
  bash deploy/publish-wwebjs.sh 1.0.11-wweb
```

Same commit corrected a header comment still documenting `w.keyone1.com` as the
default cloud URL — the source of the 301.

---

## 3. Bridge tenants routed into the QR queue

### Symptom (customer-visible timeline)
```
تم طلب الاستيراد وإدخاله في طابور QR
تم إيقاظ جلسة QR، جاري سحب البيانات
متعذّر سحب بيانات الواتساب        (repeating)
```
Three false statements: nothing was woken, the export did not fail (it was never
possible), and the retry promised a recovery that could not arrive.

### Root cause
`requestImport()` (`lib/import/import-engine.ts`) enqueued into the QR pool
**unconditionally** — it read no transport at all. The slot handler then ran
`wa.wake()` + `wa.exportData()` against a whatsapp-service session a Bridge
tenant does not have.

### Why it fails closed rather than routing through Bridge
Proven before assuming — the Bridge **cannot** do the operation:
- Control actions are `disconnect | logout | reconnect | restart | start_qr | update`
- `getContacts` / `getChats` / `exportData` appear **zero times** in `bridge-node`
- Meta has no contact-list or history endpoint at all

Adding one means a new WS frame type shipped to every installed Bridge — a
protocol change, not a fix.

### Fix — `1207ce8`
Transport gate before any queue write, using `normalizeConnectionMode` over
`Bot.connectionMode` (the resolver the send path and status route already
share). UI shows a truthful unsupported state; the action is disabled rather
than inviting a retry that cannot succeed.

| | Bridge tenant | QR tenant |
|---|---|---|
| status | `failed` / `import_unsupported_on_bridge` | `queued` |
| **QrSlotJob** | **0** | `1` |
| queuePosition | 0 | 3 |

---

## 4. Credit campaigns — same class, with money attached

Found by searching for the same pattern after fixing §3. Product decision
(2026-09-07): **credit campaigns are QR-only.**

`app/api/broadcast-credits/campaigns/route.ts` had the same missing check, and
`lib/credits/broadcast-handler.ts:32` called `wa.wake()`.

**Ordering is the fix, not a detail.** Credits are debited (Step 4) *before* the
enqueue (Step 5), so a guard at the enqueue would take a Bridge tenant's money
for a campaign that can never run. The guard sits immediately after the
entitlement gate — above the rate limiter, the body parse, the debit and the row
creation.

### Fix — `1dd56b4`
| | Bridge tenant | QR tenant |
|---|---|---|
| HTTP | **409** `campaign_unsupported_on_transport` | **200** |
| QrSlotJob / Broadcast | **0 / 0** | 1 / 1 |
| **credits debited** | **0** | 1 |

Second guard before `wa.wake()` in the handler: `connectionMode` changes *after*
a job is queued — the inbound webhook flips a tenant to `bridge` when their
Bridge connects, which happened in production. It parks the campaign rather than
draining it; reserved credits refund via the existing reconcile path on cancel.
No new refund route was invented.

Response carries `detail`, not `message`, because `broadcasts-pro-client.tsx`
renders `j.detail || j.error` — anything else prints the raw English code onto an
Arabic RTL screen. Verified in-browser.

12 tests pin the **ordering**; mutation-checked by moving the guard below the
debit.

---

## 5. Method note

Two defects in this set were found only by clicking in a browser, not by reading
code:
- The Import dead button for **bridge-mode** tenants — an earlier fix handled
  `service_unreachable` (what a QR tenant sees), but a Bridge tenant reports
  `disconnected`, so it never applied. Since new tenants now default to Bridge,
  that was the path every future signup would take.
- The `detail` vs `message` key, which would have leaked a raw token.

Authenticated verification used a **synthetic tenant on a scratch PostgreSQL**
running the production commit locally — no production data, no real credentials,
no password resets.

---

## 6. State at close

`main` == `origin/main` == `production` == live == **`1dd56b4`**
Tenants: 4 `qr`, 1 `bridge` — no customer row was mutated at any point.

### Open items
- **Re-publish the installer store at `1.0.11-wweb`** (§2) so self-update works.
- **`BridgeToken` is revoked and the Bridge is offline** after the test session —
  normal; `keyone-bridge login` then `start` re-links.
- A stale `BridgeTransport` row reads `connected` while the Bridge is offline.
  It does **not** mislead the dashboard: `/api/whatsapp/status` joins on
  `bridge.status = "online"`. Cosmetic.
- 17 pre-existing `phase3-admin-features` failures (stale 77-vs-98 counts); the
  rewrite sits unreleased on `claude/wkeyone-system-audit-hardening-ae550e`.
