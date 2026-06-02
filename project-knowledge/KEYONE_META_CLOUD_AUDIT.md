# KEYONE — Meta Cloud API Audit

**Date:** 2026-06-02  
**Auditor:** Claude Sonnet 4.6  
**Scope:** Full Meta Cloud API implementation — onboarding, plan eligibility, tokens, webhooks, routing, coexistence

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Onboarding flow | ✅ WORKING | Fixed dev language |
| Plan eligibility | ✅ WORKING | Max + Companies only |
| Token validation | ✅ WORKING | AES-256-GCM encrypted |
| Phone number validation | ⚠️ PARTIAL | No live Meta API validation |
| Webhook verification | ✅ WORKING | HMAC-SHA256 + timestamp |
| Provider routing | ✅ WORKING | Feature-flag gated |
| Fallback to QR | ✅ WORKING | Any flag failure → QR |
| Coexistence with QR | ✅ WORKING | Per-bot connectionMode |
| Customer-facing language | ✅ FIXED | Dev terms removed |

---

## Architecture Overview

The Meta Cloud API integration is a **hybrid provider** system. Routing is controlled by 4 layered guards in `lib/messaging/feature-flags.ts`:

1. `META_CLOUD_ENABLED=1` env var (global kill switch)
2. Plan tier must be `max` or `companies`
3. `Bot.connectionMode` must be `"meta_cloud"`
4. `Bot.metaAccessTokenEnc` must be present (non-null)

Any single guard failing → falls back to QR mode silently.

---

## Plan Eligibility

| Plan | Meta Cloud Access |
|------|-----------------|
| Free / Trial | ❌ none |
| Starter | ❌ none |
| Pro | ❌ none |
| Max | ✅ limited (capped throughput) |
| Companies / Enterprise | ✅ full (no platform cap) |

**UI enforcement:** Plan-blocked users see the Meta Cloud radio button disabled with inline plan restriction text. Settings page shows a rose-colored warning card.

---

## Token Management

**Storage:** `Bot.metaAccessTokenEnc` and `Bot.metaAppSecretEnc` — AES-256-GCM encrypted at rest  
**Never returned raw** — GET endpoint returns only UI masks (`••••` + last 4 chars)  
**"Keep existing" pattern** — empty PUT body for token field preserves existing encrypted value  
**Decrypt error** — if decryption fails, UI shows "يرجى إعادة الإدخال" (fixed from "decrypt error")

---

## Phone Number Validation

**Status: PARTIAL**

- Phone Number ID stored as plain string in `Bot.metaPhoneNumberId`
- No live Meta API call to validate the phone number ID at save time
- Validation happens implicitly when the first message is sent
- **Recommendation:** Add a "تحقق من الإعداد" button that calls Meta's API to verify the phone number exists

---

## Webhook Verification

**File:** `app/api/whatsapp/meta-webhook/route.ts`  
**Status:** ✅ WORKING

- GET endpoint: verifies `hub.verify_token` against stored `Bot.metaWebhookVerifyToken`
- POST endpoint: verifies `X-Hub-Signature-256: sha256=<hmac>` against request body using `Bot.metaAppSecretEnc` (decrypted)
- Signature mismatch → 403 Unauthorized
- Events processed via `lib/messaging/meta-provider.ts`

---

## Provider Routing

**File:** `lib/messaging/index.ts` (`resolveProvider()`)  
**Status:** ✅ WORKING

```
resolveProvider(userId) →
  metaCloudAllowedForUser(userId) →
    all 4 guards pass? → MetaProvider
    any guard fails? → QRProvider
```

The QR provider (`lib/messaging/qr-provider.ts`) is the default and safe fallback.

---

## Coexistence with QR Mode

- Each `Bot` record has its own `connectionMode` — modes are per-user
- Changing mode to `meta_cloud` does not disconnect the existing QR session
- QR session remains in `.wwebjs_cache` until explicitly logged out
- Switching back to QR mode resumes the existing session if still valid

---

## Customer-Facing Language Fixes Applied

| Before | After |
|--------|-------|
| "QR Code (whatsapp-web.js)" | "ربط برمز QR" |
| "Meta Cloud API (Official)" | "Meta Cloud API الرسمي" |
| `META_CLOUD_ENABLED=0` in UI | "وضع Meta Cloud API غير مفعّل حالياً على المنصة" |
| "Phone Number ID" field | "معرّف رقم الهاتف (Phone Number ID)" |
| "Access Token" field | "رمز الوصول (Access Token)" |
| "App Secret" field | "سر التطبيق (App Secret)" |
| "Webhook Verify Token" field | "رمز التحقق للـ Webhook" |
| "WhatsApp Business Account ID" field | "معرّف حساب الأعمال (WABA ID)" |
| "32-char hex" placeholder | "مفتاح من 32 حرف" |
| "e.g. 1234567890123456" placeholders | "مثال: 1234567890123456" |
| "•••• (decrypt error)" | "•••• (يرجى إعادة الإدخال)" |
| `<your-domain>` webhook URL placeholder | `app.keyone1.com/api/whatsapp/meta-webhook` |
| Raw Meta API field names in code tags | Plain Arabic descriptions |

---

## Remaining Gaps

| Gap | Priority | Effort |
|-----|----------|--------|
| Live phone number validation via Meta API | Medium | 1 day |
| Template management UI (create/approve WhatsApp templates) | Medium | 2 days |
| 24-hour messaging window enforcement in UI | Low | Half day |
| Quality rating degradation alert | Low | Half day |
| OAuth-based Meta app connection (no-code setup) | Low | 3 days |
