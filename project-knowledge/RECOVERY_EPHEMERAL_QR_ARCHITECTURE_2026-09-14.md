# Recovery for Bridge tenants — architecture review

Date: 2026-09-14 · **Read-only investigation. No code changed.**

The mechanism the product wants already exists and is already used. The blocker
is not design — it is that the service which implements it is not deployed.

---

## 1. Current architecture

**Import/Recovery** (`saas/lib/import/import-engine.ts`) runs as a QR-pool slot
job. `runImportJob()` (line 208) is already the exact lifecycle described in the
product brief:

    wa.wake(userId)            // bring the session up
    wa.markEphemeral(userId)   // TEMPORARY: never reconnects, never restores
    wa.exportData(userId, …)   // read-only contacts + recent chats
    …import…
    wa.logout(userId)          // destroy client, wipe auth, offline forever

Its own comment calls this the "TEMPORARY-QR LIFECYCLE".

**The QR runtime** (`whatsapp-service/src/sessions.js`, 1306 lines) is
**one whatsapp-web.js Client per tenant**: `this.sessions = new Map()` keyed by
`userId`, each with `LocalAuth({ clientId: userId })` and its own Chromium. Not
a singleton, not shared. Slot-based concurrency via `QrSlotJob` +
`lib/qr-pool/scheduler.ts`.

**The ephemeral primitive already exists end to end:**

| Piece | Where |
|---|---|
| `POST /sessions/:id/start {ephemeral:true}` | `whatsapp-service/src/index.js:170` |
| `ephemeral: !!opts.ephemeral` at birth | `sessions.js:762` |
| TTL armed immediately (`WA_EPHEMERAL_TTL_MIN`, default **15 min**) | `sessions.js:766, 1252` |
| reconnect suppressed for ephemeral | `sessions.js:552-557` |
| on end: delete session + **wipe the auth folder** | `sessions.js:882-895` |
| `POST /sessions/:id/ephemeral` (flag a running one) | `index.js:181` |
| QR served for display | `GET /sessions/:id/status` → `{status, qr}` |

`wa.markEphemeral()` is already called by the import engine (line 219).

---

## 2. Is parallel Bridge + temporary QR technically safe?

Four contention points were checked. Three are provably safe; one is unknown.

**a) Transport mode — SAFE, already guaranteed.**
`app/api/whatsapp/incoming/route.ts:141` writes `connectionMode` **only** when
the event came from the Bridge and Bridge is enabled:

    ...(bridgeModeSwitch ? { connectionMode: "bridge" } : {}),

A QR `connected` event cannot flip a tenant's primary transport. This is the
single most important property and it needs no new code.

**b) Inbound duplication — SAFE by construction.**
While a recovery QR is linked, WhatsApp delivers inbound to *every* linked
device, so both Bridge and QR would report the same message. They cannot
double-process:

- `Message` carries `@@unique([conversationId, providerMessageId])` (schema:661)
- Bridge sends `providerMessageId: m.id?._serialized` (`bridge-node/keyone-wa-bridge.js:653`)
- the QR service sends `providerMessageId: msg.id?._serialized` (`sessions.js:1012`)

Both are whatsapp-web.js, so the id is byte-identical. The second insert raises
P2002 → `blocked:"duplicate_event"` (route:575), which returns **before**
`triggerBotFlow` (657) and `generateBotReply` (1023). No double reply, no double
bot run, no double usage.

**c) Server-side session collision — SAFE.**
The QR `sessions` Map is keyed by `userId`, but a Bridge tenant has no
server-side QR session, so a recovery session occupies a free key. The Bridge
itself runs whatsapp-web.js on the *customer's* machine and talks to the gateway
over its own WebSocket — a different process, a different transport, no shared
state with `whatsapp-service`.

**d) WhatsApp linked-device slots — UNKNOWN. Requires approval.**
Both the Bridge and a recovery QR are companion devices on the same WhatsApp
account. WhatsApp caps companions (commonly 4) and evicts when the cap is
exceeded. **Nothing in this repository establishes the cap or the eviction
order**, so I cannot prove a recovery scan will not evict the Bridge for a
merchant who already has several linked devices. This is platform behaviour,
not our code, and it is the one item that needs an explicit decision.

Relevant precedent, though not the same mechanism:
`INCIDENT_2026-07-23` — two Bridge processes sharing one bridge *identity*
caused an eviction war at the gateway with silently dropped replies. That was
gateway identity, not WhatsApp devices, but it is why (d) deserves care rather
than assumption.

**Known cosmetic side effect.** When the ephemeral session ends it emits
`disconnected`, and route:166 stomps `whatsappStatus:"disconnected"`
unconditionally for non-Bridge disconnects. Impact is display-only — **no send
path reads `whatsappStatus`** — and `/api/whatsapp/status` re-syncs a Bridge
tenant back to `connected` on the next poll. The kill-switch already ignores
`ephemeral_stale` (route:186), so this cannot trigger a 24h lockout.

---

## 3. THE ACTUAL BLOCKER — the QR runtime is not deployed

    ~/whatsapp-service        ABSENT on the production host
    systemd unit              does not exist
    port 3001                 nothing listening
    WHATSAPP_SERVICE_URL      unset (falls back to http://127.0.0.1:3001)
    release-aws.sh            ships only saas/ and bridge-gateway/

So `wa.wake`, `wa.exportData`, `wa.start` and `wa.markEphemeral` all resolve to
a dead address. This is why the bot-builder QR test produced
`[flow] send failed: fetch failed`.

**Import/Recovery is therefore broken for every tenant today, not only Bridge
tenants.** The four QR-mode tenants cannot import either. The Bridge dead-end
the brief describes is the visible half of a larger gap.

Host capacity for hosting it: 7.6 GB RAM / 6.7 GB available, 2 vCPU, no system
Chromium and no puppeteer cache. One ephemeral session (~250-400 MB of headless
Chromium) fits comfortably; it is new infrastructure, not a capacity problem.

---

## 4. Files and functions involved

| Concern | Location |
|---|---|
| transport gate that blocks Bridge | `saas/lib/import/import-engine.ts:91-110` |
| the temporary-QR lifecycle | `saas/lib/import/import-engine.ts:208-250` |
| SaaS→service client | `saas/lib/wa.ts` — `start:107`, `markEphemeral:121`, `exportData:127`, `logout` |
| ephemeral session runtime | `whatsapp-service/src/sessions.js:762, 766, 552, 882, 1246-1257` |
| service HTTP surface | `whatsapp-service/src/index.js:170, 181, 187, 242` |
| slot queue | `saas/lib/qr-pool/scheduler.ts`, `QrSlotJob` (schema:2178) |
| inbound + dedupe + mode write | `saas/app/api/whatsapp/incoming/route.ts:141, 166, 546-578` |
| Recovery UI | `saas/app/dashboard/import/import-client.tsx:168-220` |

---

## 5. Bridge protocol — unchanged

Nothing in this design touches the Bridge protocol, the gateway, or the Bridge
runtime. The recovery session is a separate server-side whatsapp-web.js client;
the Bridge never learns it exists.

## 6. Normal QR visibility — unchanged

The recovery QR is rendered only inside the Recovery flow and the session is
ephemeral from birth, so it can never become a normal connection: it never
reconnects (`sessions.js:552`), never survives restart, self-destructs on TTL,
and wipes its auth folder on teardown (`sessions.js:892`). `connectionMode` is
untouched (§2a). No QR settings/pairing navigation is exposed.

---

## 7. Recommended minimal implementation — **Option A/B, reusing what exists**

Smallest change set, in dependency order:

1. **Deploy `whatsapp-service`** (the real prerequisite): ship it in
   `release-aws.sh`, add a systemd unit, install Chromium deps, set
   `WHATSAPP_SERVICE_URL`. Nothing else works until this exists.
2. **`saas/lib/wa.ts`** — let `start` pass the flag the service already accepts:
   `start(userId, { ephemeral })` → `body: JSON.stringify({ ephemeral: true })`.
   One line; the service side needs nothing.
3. **`whatsapp-service/src/sessions.js`** — skip the `notifySaas({event:"incoming"})`
   forward when `session.ephemeral`. Belt-and-braces only: §2b shows the webhook
   already de-duplicates, but a recovery session has no business forwarding
   inbound at all.
4. **A recovery-only job path** beside `runImportJob` that starts an ephemeral
   session, polls for QR, waits for connect, then reuses the *existing*
   `exportData → importData → logout` tail unchanged.
5. **Recovery UI** — for `bridgeMode`, replace the dead-end copy with the
   brief's wording and the state machine (preparing → qr_ready → scanning →
   connected → importing → completed / failed / expired / cancel). Poll
   `/api/whatsapp/status` for the QR; render it only inside this flow.
6. **Relax the transport gate narrowly**: today `import-engine.ts:93` fails
   closed for any non-QR mode. It would allow a bridge tenant only on the
   recovery-session path, never on the plain import path — Import stays QR-only
   in the sense the product decision means: it still requires a QR session, it
   just now creates a temporary one.

Security posture: session keyed by the authenticated `userId` (no cross-tenant
reach), one-time, TTL-bounded, auth wiped on teardown, QR is a data-URL image
rather than a credential, nothing new persisted.

---

## 8. Safety blockers requiring explicit approval

1. **WhatsApp companion-device eviction (§2d)** — unproven. If the merchant is
   at the device cap, a recovery scan may evict the Bridge. Mitigations to
   choose between: warn before starting; require the merchant to confirm they
   have a free device slot; or accept + document that the Bridge may need
   re-linking. **Needs a product decision.**
2. **Deploying `whatsapp-service` to production** — new infrastructure
   (a Chromium-hosting service, a new unit, a new port, a new env var) on a
   2-vCPU box. Out of the scope of a Recovery UI change and needs approval on
   its own terms.

Neither is a code problem. Everything else is already built.
