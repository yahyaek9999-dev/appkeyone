# Bot Builder did nothing on a working Bridge — root cause

Date: 2026-09-13 · Fix: `1189d67` · Not yet deployed (contains runtime code)

## It was never a Bridge problem

Normal chat through Bridge worked. Bot Builder did not. The divergence is one
function.

**Working (normal chat / AI reply)**

    wa.send -> enqueueOutboundText -> WaMessage -> drainOutgoingQueue
      -> wa.sendNow -> maybeRouteBridgeSend -> Bridge | QR | Meta

**Broken (Bot Builder)**

    sendBotMessage -> prisma.outgoingMessage.create(...)   <- model does not exist

`OutgoingMessage` is not in `schema.prisma`. Verified against the real generated
client: `prisma.waMessage` is an object, `prisma.outgoingMessage` is
`undefined`. `lib/bot/executor.ts:86` was its only writer, and the `as any` cast
hid that from TypeScript.

Three things then compounded:

1. `undefined.create()` throws **synchronously**, so the `.catch()` chained onto
   it was never attached — the fallback that wrote a `Message` row was
   unreachable dead code.
2. The enclosing `try { } catch { }` swallowed the throw ("Swallow — bot message
   delivery failure should not crash the execution").
3. The webhook still answered `200 {"ok":true}`. Nothing logged, nothing failed.

Every reply a flow produced was discarded in silence — **on every transport**,
not just Bridge. Bridge tenants noticed because Bot Builder was the only thing
they had that did not work.

## Why nine months of green tests missed it

`__tests__/bot-executor.test.ts` mocked a `prisma.outgoingMessage` delegate into
its fake client and asserted against that. The mock invented a model the schema
never had, so 22 tests passed while production dropped every message. The test
now observes the real seam (`wa.send`).

## The fix

`sendBotMessage()` calls `wa.send()` — the same public API the AI reply path
uses. No second abstraction; the existing transport resolver is what carries a
reply to Bridge. Two details:

- **Buttons** ride in the message body, listed bare and deliberately *not*
  numbered: a `buttons` node matches the reply with `b.label === userInput`, so
  prompting for "1" would produce an answer that can never select a branch.
- The reply is **persisted as an assistant message**. The send path does not
  persist; every other caller records its own.

## Runtime proof (scratch DB, synthetic tenants, no customer data)

A real inbound webhook for a bridge tenant, with a listener standing in for the
co-located gateway:

    POST /api/whatsapp/incoming  {"event":"incoming","source":"bridge",...}
      -> 200
    gateway received:
      url    = /internal/outbound
      secret = true
      to     = +966500000777
      text   = رد جديد 193650 عبر البريدج        <- the configured flow text

Reverting the fix and repeating the identical request delivers **nothing** to
the gateway — and returns the identical `200 {"ok":true}`. That is the whole
bug in one comparison.

A QR tenant under the same flow queues its reply (`WaMessage`, status `queued`)
and is **never** handed to the Bridge gateway — no cross-transport fallback.

Browser: `/dashboard/bot-builder` renders for the bridge tenant, shows the flow
as `مفعّل` / `افتراضي` with `4 تنفيذ`, zero console errors.

Tests: 373 pass (27 files), typecheck clean. Mutation-checked — reverting the
fix turns 14 tests red.

## Limitation

The last physical hop — gateway -> WebSocket -> the customer's Bridge -> WhatsApp
— was not exercised. It needs a linked, online Bridge; the only production
Bridge row is revoked and offline. Everything up to and including the gateway
handoff is proven.

## Unchanged on purpose

Import stays unsupported on Bridge. It reads contacts from a connected QR
session, which the Bridge protocol does not expose, and the existing guard
correctly fails closed rather than routing a Bridge tenant into QR recovery.

---

## Release — 2026-09-14

Deployed. Production went `1dd56b4` → `198476d` → **`1ad741f`**.

The second deploy was not planned: post-deploy verification on the box found a
defect in `198476d` that no local test could have caught.

### What production's configuration exposed

Production runs **`WA_SMART_QUEUE_ENABLED=0`**. In that mode `wa.send` skips the
queue entirely and calls `sendNow`, so there is no `WaMessage` row and no queued
id. `198476d` keyed the assistant message to that id unconditionally:

    if (!conversationId || !queuedId) return;

so on production every successful bot reply was sent and then recorded nowhere.
Every test until then ran with the queue ON — the default, and not what we run.

`1ad741f` makes the rule *one row per message that actually went out*:

- queue **on** — `wa.send` de-duplicates on (userId, to, text, reason) and
  returns the same id, so three runs give one row
- queue **off** — no de-duplication, every call is a real send, so each earns
  its own row

`__tests__/bot-builder-queue-off.test.ts` pins production's setting before
`wa.ts` loads and covers both transports plus the failed-send case. Reverting
the guard turns it red.

### Production evidence

Two synthetic tenants, created and removed, run twice — identical both times:

    [flow] send failed: no_bridge_online   ×3   <- bridge tenant, bridge path
    [flow] send failed: fetch failed       ×1   <- qr tenant, QR gateway

`no_bridge_online` is bridge-exclusive vocabulary and `fetch failed` is the QR
gateway call, so the split proves no cross-transport fallback in either
direction. Those markers are themselves new: before this fix the same failures
produced complete silence.

Both runs ended with the database back at its baseline — 5 users, 5 bots,
2 customers, 1 flow, 6 messages — and zero synthetic rows left behind.

Health `1ad741f`, `db:ok`, `/api/ready` ready on all three checks; 0
prisma/runtime errors since the restart; the 22 errors in stderr are all
historical, ahead of the restart marker.

### Still unverified

The physical hop — gateway → WebSocket → the customer's Bridge → WhatsApp.
A synthetic tenant has no Bridge linked, so its sends can only ever fail with
`no_bridge_online`; a real send needs the one online Bridge
(`test@wkeyone.com`), whose only flow is a draft, and no test conversation or
recipient was approved. Nothing was modified to force it.
