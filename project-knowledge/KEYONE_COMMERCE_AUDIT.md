# KEYONE — Commerce Integrations Audit

**Date:** 2026-06-02  
**Auditor:** Claude Sonnet 4.6  
**Scope:** Shopify, WooCommerce, Salla, Zid, Custom API/Webhook

---

## Executive Summary

| Platform | Connect Flow | Credentials | Webhook Reception | Order Sync | Product Sync | Disconnect |
|----------|-------------|-------------|-------------------|------------|--------------|------------|
| **Shopify** | ✅ WORKING | ✅ WORKING | ✅ WORKING | ✅ WORKING | ❌ BROKEN | ✅ WORKING |
| **WooCommerce** | ✅ WORKING | ✅ WORKING | ✅ WORKING | ✅ WORKING | ❌ BROKEN | ✅ WORKING |
| **Salla** | ✅ WORKING | ✅ WORKING | ✅ WORKING | ✅ WORKING | ❌ BROKEN | ✅ WORKING |
| **Zid** | ✅ WORKING | ✅ WORKING | ✅ WORKING | ✅ WORKING | ❌ BROKEN | ✅ WORKING |
| **Custom API** | ✅ WORKING | ✅ WORKING | ✅ WORKING | ✅ WORKING | N/A | ✅ WORKING |

---

## Classification

### WORKING (Full End-to-End)

**Connect Flow:**
- `POST /api/commerce/integrations` — generates API key (`ko_live_*`) + webhook secret (`whsec_*`)
- Credentials stored: API key as SHA-256 hash, webhook secret AES-256-GCM encrypted
- Returns raw credentials to display once — user saves them
- Seeds 7 default automation rules per integration

**Credentials Validation:**
- API key lookup: `sha256(rawKey) === apiKeyHash` — timing-safe comparison
- Webhook secret decrypted on each request for HMAC verification
- Signature verification: `X-Keyone-Signature: sha256=<hmac>` validated with `crypto.timingSafeEqual`

**Webhook Registration:**
- Users manually add the Webhook URL to their platform
- Webhook URL format: `https://app.keyone1.com/api/commerce/webhooks`
- Rate limiting: 120 req/min per IP, 120 req/min per tenant

**Order Sync (via Webhook):**
- Full normalization for all 4 platforms (`lib/commerce/normalize.ts`)
- Shopify: reads `payload.order`
- WooCommerce: reads `payload.order`
- Salla: reads `payload.data.order`
- Zid: reads `payload.order` or `payload.data.order`
- Customer upsert by phone number
- Order upsert with `externalSource + externalOrderId` deduplication
- Order items replaced on update
- Timeline entry created
- Commerce automations triggered (WhatsApp + email notifications)
- Deduplication: `integrationId + externalEventId` unique constraint

**Retry Logic:**
- `POST /api/commerce/events/retry` — re-processes failed events
- Increments `attempts` counter
- Sets `status` back to `processed` or `failed`

**Disconnect Flow:**
- `DELETE /api/commerce/integrations/[id]` → sets `enabled: false` (soft delete)
- Preserves event history and order data
- Immediately stops processing new webhooks

---

### PARTIAL

**Manual Sync (`POST /api/commerce/integrations/[id]/sync`):**
- Does NOT pull fresh orders from platform APIs
- Only lists last 10 processed webhook events from DB
- Updates `lastSyncStatus` to "syncing"
- Misleading UX: button says "مزامنة" (sync) but it's really just a status refresh

**Test Connection (`POST /api/commerce/integrations/[id]/test`):**
- Works end-to-end for custom platform format
- Creates a test order in the DB
- Marks as `signatureOk: true` (bypasses real signature check for test)
- Uses generic test customer (`+201000000000`) — creates fake order in DB each time
- Could clutter the orders list with test orders

---

### BROKEN / NOT IMPLEMENTED

**Product Sync:**
- No Shopify/WooCommerce/Salla/Zid API clients
- No OAuth flow for any platform
- System is entirely webhook-push (platform pushes to us)
- Cannot pull product catalog from platforms
- KEYONE's own Product Catalog is separate (manually managed)

**Platform-Specific Notes:**

**Shopify:**
- Webhook headers: `X-Shopify-Topic`, `X-Shopify-HMAC-SHA256` — normalized to our format
- No Shopify Admin API client (REST or GraphQL)
- No OAuth app flow

**WooCommerce:**
- Webhook headers: `X-WC-Webhook-Topic`, `X-WC-Webhook-Signature`
- No WooCommerce REST API client (no Consumer Key/Secret usage)

**Salla:**
- Webhook headers: `X-Salla-Event`, `X-Salla-Signature`
- No Salla OAuth/API integration

**Zid:**
- Webhook headers: `X-Zid-Event`, `X-Zid-Signature`
- No Zid OAuth/API integration

---

## Security Assessment

| Check | Status |
|-------|--------|
| API keys stored as SHA-256 hash | ✅ |
| Webhook secrets AES-256-GCM encrypted | ✅ |
| HMAC-SHA256 signature verification | ✅ |
| Timing-safe comparison (`crypto.timingSafeEqual`) | ✅ |
| Timestamp validation (5-min window) | ✅ |
| Rate limiting per IP + per tenant | ✅ |
| User ownership validation on all operations | ✅ |
| Email provider secrets encrypted | ✅ |

---

## Automations (Commerce Notifications)

**Channels:** WhatsApp, Email, Dashboard, Analytics, AI Follow-up

**Triggers:** `order.created`, `order.confirmed`, `order.preparing`, `order.shipped`, `order.out_for_delivery`, `order.delivered`, `payment.failed`, `order.cancelled`, `customer.created`

**Status:** ✅ WORKING — real WhatsApp and email sending via existing queue

**Email Providers supported:**
- SMTP (real TCP connection, AUTH LOGIN, RFC2822)
- Resend (API: `api.resend.com`)
- Brevo (API: `api.brevo.com`)

---

## Recommendations

1. **Clarify sync button UX** — rename "مزامنة" to "عرض آخر الأحداث" to accurately describe what it does
2. **Test orders** — add a way to delete or mark test orders, or prevent test orders from appearing in the orders list
3. **Platform OAuth** — future work for Shopify/WooCommerce native integration (pull model)
4. **Product sync** — future work once OAuth is implemented
