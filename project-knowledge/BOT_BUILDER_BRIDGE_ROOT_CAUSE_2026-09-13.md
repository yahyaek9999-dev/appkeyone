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
