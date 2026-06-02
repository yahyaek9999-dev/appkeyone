# Meta Cloud API — Phase 2 Integration Plan

**Date:** 2026-06-02  
**Status:** Planning doc. No implementation yet.  
**Prerequisite reading:** `lib/messaging/index.ts`, `lib/messaging/meta-provider.ts`, `lib/messaging/qr-provider.ts`, `lib/messaging/outgoing-queue.ts`

---

## Current State

KEYONE has **three WhatsApp messaging layers** that must be unified:

| Layer | Purpose | Provider Dispatch |
|-------|---------|------------------|
| `messaging.send()` (facade) | Commerce automations | ✅ Uses `resolveProvider()` — already dispatches to QR or Meta |
| `wa.send()` (enqueueSend) | Broadcasts, follow-ups, order updates | ❌ Always routes through QR microservice |
| `wa.sendNow()` (direct) | Admin inbox replies, queue drainer | ❌ Always routes through QR microservice |

The **provider abstraction exists** (`lib/messaging/index.ts` → `resolveProvider()` → `QRProvider` / `MetaCloudProvider`) but only **one caller uses it**: `lib/commerce/notifications.ts`.

All other send paths bypass the provider facade entirely.

---

## Architecture

```
                    Current (Phase 1)                     Future (Phase 2)
                   
  wa.send()──────► enqueueSend ──► drain ──► wa.sendNow   wa.send()──────► enqueueSend ──► drain ──► messaging.send()
                         │                                            │                           │
                    WaMessage (SQLite)                             WaMessage (SQLite)          resolveProvider()
                                                                                                  │
                                                                                          ┌───────┴───────┐
                                                                                          │               │
                                                                                    QR Provider    Meta Cloud Provider
                                                                                          │               │
                                                                                    wa.sendNow()    meta-api.ts
                                                                                          │               │
                                                                                    WA Service    Graph API
                                                                                    (:7799)       (facebook.com)
```

### Target Flow (Phase 2)

```
Any send path
  │
  ├──→ wa.send(userId, to, text, reason)
  │      │
  │      ├──→ enqueueSend() → WaMessage.queued
  │      │      │
  │      │      └──→ drainOutgoingQueue()
  │      │             │
  │      │             ├──→ resolveProvider(userId)
  │      │             │      ├──→ MetaCloudProvider.sendMessage() if eligible
  │      │             │      └──→ QRProvider.sendMessage() otherwise
  │      │             │
  │      │             └──→ WaMessage.sent / failed
  │      │
  │      └──→ messaging.send() (already works — commerce automations)
  │
  └──→ wa.sendNow(userId, to, text)  [admin inbox only]
         │
         └──→ QRProvider.sendMessage()  [always direct, no queue]
```

---

## Migration Steps

### Step 1: Wire `drainOutgoingQueue` to `resolveProvider()` (3–5 days)

**What:** The queue drainer (`lib/messaging/outgoing-queue.ts:275`) currently hardcodes `wa.sendNow()` for ALL sends. Change it to use `messaging.send()` (the provider facade) when a `routeProvider` is specified or when the merchant is Meta Cloud-eligible.

**Changes:**
- `lib/messaging/outgoing-queue.ts` — replace `wa.sendNow()` at line 275 with `messaging.send()` dispatch
- `lib/messaging/index.ts` — expose `messaging.send()` as a standalone function (currently it's a property on the `messaging` object)
- Add cached `resolveProvider()` result (per-request or short TTL) so the eligibility check doesn't run on every queue drain call

**Risks:**
- QR fallback must be flawless — any eligibility check bug could cause dropped messages
- `messaging.send()` writes its own `WaMessage` ledger row — the queue drainer ALSO writes status updates. Must ensure no double-writes or status conflicts

**Rollback:** Revert `drainOutgoingQueue` to always use `wa.sendNow()`

### Step 2: Migrate Broadcast Cron to Provider Facade (2–3 days)

**What:** The broadcast send cron (`app/api/cron/broadcasts/route.ts:214`) calls `wa.send()` which bypasses the provider facade. Change it to pass through `messaging.send()` so Meta Cloud-eligible merchants get their broadcasts via the API.

**Changes:**
- `app/api/cron/broadcasts/route.ts` — replace `wa.send(bc.userId, ...)` with `messaging.send(bc.userId, ...)`
- Add `reason: "broadcast"` propagation through the facade

**Risks:**
- Broadcast pacing (2.5s delay between sends) must be preserved — Meta Cloud API has different rate limits than QR
- Personalization (LLM rewrite) must happen BEFORE the facade call, not after

**Rollback:** Revert broadcasts cron to `wa.send()`

### Step 3: Meta Cloud Default for New Signups (2 days)

**What:** When a new merchant signs up and has Meta Cloud API credentials configured, default their `connectionMode` to `"meta_cloud"` instead of `"qr"`.

**Changes:**
- `app/api/settings/meta-cloud/route.ts` — on successful Meta config save, optionally set `connectionMode: "meta_cloud"`
- Bot default: change `connectionMode` default from `"qr"` to `"meta_cloud"` when meta config is present

**Risks:**
- Legacy QR-only merchants must NOT be auto-switched — only new Meta-configured merchants
- Must verify webhook is receiving inbound messages before switching

**Rollback:** Set `connectionMode: "qr"` via settings page

---

## Coexistence with QR Mode

Both providers MUST coexist indefinitely:

| Scenario | QR Provider | Meta Cloud Provider |
|----------|-------------|-------------------|
| Legacy QR merchants | ✅ Default | Not available |
| New merchants (no Meta config) | ✅ Fallback | Not eligible |
| Meta-configured merchants | Fallback on API error | ✅ Primary |
| Meta API rate-limited | ✅ Auto-fallback | Temporarily disabled |
| Meta API down | ✅ Auto-fallback | Error state |

**Coexistence rules:**
1. `resolveProvider()` already handles this — returns `QRProvider` when merchant isn't eligible for Meta
2. The `routeProvider` field on `EnqueueOutboundTextInput` (already exists) allows per-message provider override
3. No merchant should ever experience message loss during provider switch — always drain through the available provider

---

## Risk Register

| Risk | Impact | Probability | Mitigation | Rollback |
|------|--------|-------------|------------|----------|
| Queue drainer sends through wrong provider | Messages not delivered | Low | Always keep QR as default; Meta only when explicitly eligible | Revert to wa.sendNow() |
| Double WaMessage ledger writes | Duplicate entries in DB | Medium | Use idempotency keys on all sends | Remove duplicate ledger writes |
| Meta API rate limit during broadcast | Batch of sends fails | Medium | Implement per-provider rate limiting (QR: 2.5s spacing, Meta: tier-dependent) | Fall back to QR per-message |
| Webhook not configured → inbound lost | Merchant misses customer messages | High | Validate webhook delivery BEFORE switching provider | Set connectionMode back to qr |
| `NEXT_PUBLIC_SENTRY_DSN` not set on VPS | Errors not captured | Medium | Verify env var during deploy | Set env var |

---

## Rollback Strategy

1. **Per-merchant rollback:** Merchant sets `connectionMode: "qr"` in settings → all sends immediately route through QR
2. **Global rollback:** If `META_CLOUD_ENABLED !== "1"`, `resolveProvider()` returns QR for ALL merchants
3. **Code rollback:** Revert the `drainOutgoingQueue` change → `wa.sendNow()` restores all sends through the QR microservice
4. **Database rollback:** No schema changes needed for Phase 2 — all config is in existing `Bot.connectionMode`

---

## Estimated Effort

| Step | Engineering Days | Risk | Capacity Gain |
|------|-----------------|------|---------------|
| 1. Wire drainer to facade | 3–5 | Medium | +0 (enables Meta for queued sends) |
| 2. Migrate broadcast cron | 2–3 | Medium | +0 (broadcasts via API) |
| 3. Meta default for new signups | 2 | Low | Enables 100+ customers (no Puppeteer) |
| **Total** | **7–10 days** | | **25 → 150 customers** |

---

## Why Not Now

Phase 2 is deferred to a separate session because:
1. Changes the send path of every queued message — highest-risk production change
2. Requires testing with an actual Meta Cloud API test WhatsApp number
3. Needs the webhook receiver to be validated for inbound message flow before switching
4. The queue drainer (`outgoing-queue.ts`) is complex — every change needs careful code review

The **infrastructure is ready** when you are:
- ✅ `MetaCloudProvider.sendMessage()` — live and working
- ✅ `resolveProvider()` — routes by eligibility
- ✅ `routeProvider` field on `EnqueueOutboundTextInput` — already stored in DB
- ✅ Commerce automations already using the facade (production-proven pattern)
