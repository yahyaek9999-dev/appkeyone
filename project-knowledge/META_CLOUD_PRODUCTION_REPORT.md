# KEYONE — Meta Cloud API Production Report

**Generated:** 2026-06-03
**Subject:** Meta WhatsApp Cloud API integration — production readiness assessment
**Verdict:** ✅ **Production-ready** as an optional, plan-gated provider. QR (whatsapp-web.js) remains the primary path; Meta Cloud is opt-in per merchant.

---

## 1. Architecture (as built)

Meta Cloud is a **second provider** behind the same outbound ledger as QR. Merchants configure it per-bot; the provider factory only routes to Meta when the full credential set is present and the plan allows it.

```
Inbound:  Meta → POST /api/whatsapp/meta-webhook  (signature-verified, idempotent)
                  └─ WaWebhookEvent (raw, dedup on (source,eventId))
          cron /api/cron/meta-webhook-processor (every ~30s)
                  ├─ messages  → /api/whatsapp/incoming (same AI pipeline as QR)
                  ├─ statuses  → update WaMessage by providerMsgId
                  ├─ template_status_update → upsert WaTemplate
                  └─ quality/account_alerts → update Bot + WaComplianceAudit

Outbound: app → WaMessage (queued) → drain → lib/messaging/meta-api.ts
                  ├─ sendText (24h service window)
                  ├─ sendTemplate (outside window)
                  └─ sendMedia / markRead
```

---

## 2. Component Inventory & Status

| Component | Path | Status |
|-----------|------|--------|
| Webhook receiver (GET verify + POST) | `saas/app/api/whatsapp/meta-webhook/route.ts` | ✅ |
| Webhook processor (cron, dead-letters @5 attempts) | `saas/app/api/cron/meta-webhook-processor/route.ts` | ✅ |
| Template sync (cron) | `saas/app/api/cron/meta-template-sync/route.ts` | ✅ |
| Quality + messaging-limit monitor (cron) | `saas/app/api/cron/meta-quality-monitor/route.ts` | ✅ |
| Graph API client | `saas/lib/messaging/meta-api.ts` | ✅ |
| Settings API (encrypted) | `saas/app/api/settings/meta-cloud/route.ts` | ✅ |
| Settings UI | `saas/app/dashboard/settings/meta-cloud/` | ✅ |
| Token encryption | `saas/lib/crypto-util.ts` (AES-256-GCM) | ✅ |
| Models | `WaConsent, WaTemplate, WaMessage, WaWebhookEvent, WaComplianceAudit` + `Bot.meta*` | ✅ |

---

## 3. Security Posture — ✅ Strong

| Control | Implementation |
|---------|----------------|
| **Webhook signature** | `X-Hub-Signature-256` HMAC-SHA256, constant-time compare; failures recorded `signatureOk=false` and **never** execute business logic. Still 200-acks so Meta stops retrying. |
| **Verify token** | Per-merchant `Bot.metaWebhookVerifyToken` (not a global secret) — a leaked token is rotated per-merchant. |
| **Token at rest** | Access token + app secret stored AES-256-GCM encrypted (`metaAccessTokenEnc`, `metaAppSecretEnc`); key derived from `AUTH_SECRET` via scrypt. GET endpoints return only masked values. |
| **Idempotency** | Unique `(source, eventId)` on `WaWebhookEvent` makes Meta's up-to-7-day retries cheap no-ops. |
| **Dead-letter** | Processor stops after 5 attempts; stuck events surfaced by `verify:reliability` → `reliability:meta-webhooks`. |
| **Consent / 24h window** | `WaConsent` tracks service + marketing opt-in and `lastInboundAt`; STOP/revoke keywords call `revokeConsent()` instead of routing to AI. |

**Required env:** `AUTH_SECRET` (encryption key), `SAAS_INTERNAL_SECRET` (cron auth), optional `META_CLOUD_ENABLED`, `META_GRAPH_VERSION` (default `v20.0`).

---

## 4. Reliability Monitoring (added this pass)

- **Quality:** `meta-quality-monitor` polls `getPhoneNumberHealth()` hourly, updates `Bot.metaQualityRating`/`metaMessagingLimit`, raises `WaComplianceAudit` on GREEN→YELLOW→RED.
- **Roll-up:** `GET /api/internal/wa-health` → `metaQuality { green, yellow, red, atRisk }`; sets overall `status: degraded` when any number is YELLOW/RED.
- **Verify gate:** `npm run verify:reliability` → `reliability:meta-quality` (**fail on RED**, warn on YELLOW) and `reliability:meta-webhooks` (warn on dead-letters).

These let an operator detect a degrading number or a wedged webhook queue **before** Meta throttles or bans the number.

---

## 5. Known Error Handling

`lib/messaging/meta-api.ts` maps known Graph error codes so callers react correctly rather than blind-retrying:

| Code | Meaning | Correct reaction |
|------|---------|------------------|
| 131047 | Re-engagement outside 24h window | Switch to approved template |
| 131056 | Template paused (quality) | Stop using template; alert merchant |
| 80007 | Rate limited | Back off |
| 131009 | Invalid phone number | Drop / flag contact |
| 131026 | Recipient not on WhatsApp | Drop / flag contact |

Graph calls use a 15s timeout and return a structured `GraphResult` (`ok/status/errorCode/errorDetail`) — no unstructured throws into the send path.

---

## 6. Production Checklist (per merchant onboarding to Meta)

- [ ] Plan eligibility confirmed (Meta Cloud is gated to higher tiers — see plan gating report).
- [ ] `metaPhoneNumberId`, `metaBusinessAccountId`, access token, app secret, verify token entered (UI encrypts on save).
- [ ] Webhook subscribed in Meta App dashboard → `https://<domain>/api/whatsapp/meta-webhook`; GET handshake returns the challenge (200).
- [ ] Send a template message to a test number → confirm `WaMessage` status progresses queued→sent→delivered.
- [ ] Send a free-form text inside the 24h window after an inbound → confirm delivery.
- [ ] `meta-quality-monitor` has run once → `Bot.metaVerifiedAt` set, rating GREEN.
- [ ] `/api/internal/wa-health` → `metaQuality.atRisk = 0`.
- [ ] Cron tasks live: `meta-webhook-processor` (~30s), `meta-template-sync` (~30m), `meta-quality-monitor` (~1h).

---

## 7. Remaining Enhancements (non-blocking)

| Item | Priority | Notes |
|------|----------|-------|
| Live "Verify Setup" button | Medium | Call `getPhoneNumberHealth()` at save-time for instant feedback instead of waiting for the hourly cron. |
| Template create/submit UI | Medium | Today KEYONE syncs/reads templates; creation is done in Meta's UI. |
| Inbound media fetch | Medium | Message IDs are captured; downloading media via `/media` is Phase 2.1. |
| Compliance audit dashboard | Low | `WaComplianceAudit` rows exist; a dedicated viewer would help merchants self-serve. |
| OAuth embedded signup | Low | Manual token entry works; embedded signup would smooth onboarding. |

None of these block production for the QR-primary model with Meta Cloud as an opt-in upgrade.

---

## 8. Bottom Line

The Meta Cloud integration is **secure, idempotent, observable, and plan-gated**. Signature verification, per-merchant verify tokens, encrypted secrets, dead-lettering, and quality monitoring are all in place. The reliability additions in this pass (wa-health roll-up + verify:reliability gates) give operators the alerting needed to run Meta numbers safely. Ship it as an optional provider; pursue §7 as demand warrants.
