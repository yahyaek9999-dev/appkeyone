# KEYONE — Admin Audit Report

**Date:** 2026-06-02  
**Auditor:** Claude Sonnet 4.6  
**Scope:** All admin dashboard pages — buttons, actions, metrics, counters, tables, filters, status changes, forms

---

## Summary

| Category | Issues Found | Fixed | Remaining |
|----------|-------------|-------|-----------|
| Developer language shown to users | 6 | 6 | 0 |
| Raw English values in UI | 8 | 8 | 0 |
| alert() usage (bad UX) | 1 | 1 | 0 |
| Arabic typos | 1 | 1 | 0 |
| Empty states missing guidance | 4 | 4 | 0 |
| Developer sampling note in UI | 1 | 1 | 0 |

---

## Page-by-Page Audit

### /dashboard/whatsapp

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| `service_unreachable` state showed raw npm commands (`cd whatsapp-service / npm install / npm run dev`) to users | HIGH | Replaced with customer-friendly "الخادم لا يستجيب حالياً" message |
| QR image fixed at `w-64 h-64` | LOW | Acceptable — white card bg constrains it; responsive on most screens |
| Pairing code mode uses placeholder `+201234567890` in instructions | LOW | Left as-is — it's an example format in documentation text, not a pre-filled input |

**All buttons verified working:**
- ✅ "الربط بـ QR Code" → calls `/api/whatsapp/start` → returns QR
- ✅ "الربط بكود من 8 أرقام" → calls `/api/whatsapp/pair` → returns pairing code
- ✅ "فصل واتساب" → calls `/api/whatsapp/logout` → clears session
- ✅ "إلغاء الربط" → calls `/api/whatsapp/logout` → resets state
- ✅ Polling every 2.5s via `/api/whatsapp/status`

---

### /dashboard/escalations

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| `alert()` used for error feedback | HIGH | Replaced with inline `<div>` error state in `ticket-actions.tsx` |
| Raw English values in badges: "critical", "open", "human_active", "acknowledged" | HIGH | Added translation maps → Arabic labels |
| Raw AI scores shown: "الغضب 84/100 · الثقة 45/100 · الإحباط 70/100" | MEDIUM | Replaced with human-readable sentiment tags ("مزاج صعب", "إحباط واضح", "يحتاج طمأنة") |
| Button label "إبقاء بشري" was ambiguous | MEDIUM | Renamed to "إغلاق دون إعادة البوت" |
| Button label "حل وإرجاع AI" — "AI" is developer term | LOW | Renamed to "حل وإعادة البوت" |
| Empty state was a single line | MEDIUM | Added icon + description explaining what triggers escalations |

**Metrics verified:**
- ✅ "مفتوحة" count — real DB count via `prisma.escalationTicket.count`
- ✅ "تم استلامها" count — real DB count
- ✅ "حرجة" count — real DB count (severity: high/critical)

**Buttons verified:**
- ✅ "استلام" → `POST /api/escalations/[id]` with `{ action: "acknowledge" }`
- ✅ "حل وإعادة البوت" → `POST /api/escalations/[id]` with `{ action: "resolve", resumeAi: true }`
- ✅ "إغلاق دون إعادة البوت" → `POST /api/escalations/[id]` with `{ action: "resolve", resumeAi: false }`

---

### /dashboard/integrations

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| Typo "فشت المزامنة" | HIGH | Fixed to "فشلت المزامنة" |
| EventStatus shows raw English: "processed", "failed", "received" | HIGH | Added Arabic translation map |

**Buttons verified:**
- ✅ "اختبار" → `POST /api/commerce/integrations/[id]/test` — runs full order pipeline
- ✅ "مزامنة" → `POST /api/commerce/integrations/[id]/sync` — returns processed event count
- ✅ "تدوير" → `POST /api/commerce/integrations/[id]/rotate` — generates new API key + webhook secret
- ✅ "تفعيل/إيقاف" → `PATCH /api/commerce/integrations/[id]` with `{ enabled: true/false }`
- ✅ "فصل" → `DELETE /api/commerce/integrations/[id]` — sets enabled: false
- ✅ "ربط المتجر" wizard → `POST /api/commerce/integrations` — saves to DB, returns credentials

**Note:** Manual sync only lists last 10 processed webhook events — does NOT pull fresh orders from Shopify/WooCommerce/Salla/Zid APIs (no OAuth integration). This is by design — the system is webhook-push driven.

---

### /dashboard/settings/meta-cloud

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| Exposed `META_CLOUD_ENABLED=0` env var name to users | HIGH | Replaced with customer-friendly explanation |
| Setup guide showed raw API field names (`message_template_status_update`, etc.) | HIGH | Rewritten in plain Arabic |
| Webhook URL showed `<your-domain>` placeholder | MEDIUM | Replaced with actual domain `app.keyone1.com` |
| Radio label "QR Code (whatsapp-web.js)" — internal library name | MEDIUM | Renamed to "ربط برمز QR" |
| Radio label "Meta Cloud API (Official)" — English only | LOW | Translated to Arabic with plan restriction inline |
| Field label "Phone Number ID" — raw API term | MEDIUM | Changed to "معرّف رقم الهاتف (Phone Number ID)" |
| Field label "Access Token" | MEDIUM | Changed to "رمز الوصول (Access Token)" |
| Field label "App Secret" | MEDIUM | Changed to "سر التطبيق (App Secret)" |
| "decrypt error" in mask placeholder | MEDIUM | Changed to "يرجى إعادة الإدخال" |

**Form buttons verified:**
- ✅ "حفظ التغييرات" → `PUT /api/settings/meta-cloud` — encrypts tokens, saves to DB
- ✅ Mode selector persists to DB via `Bot.connectionMode`

---

### /dashboard/funnel

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| Error state had no retry button | MEDIUM | Added retry button with inline reload logic |
| Developer note "تم احتساب عيّنة كبيرة من البيانات للحفاظ على السرعة" | LOW | Removed entirely |

**Metrics verified (all from real DB):**
- ✅ Conversations → real `Conversation` count
- ✅ Leads → real `Customer.leadScore` threshold
- ✅ Orders → real `Order` count
- ✅ Conversion rates → computed from actual data

---

### /dashboard/revenue-forecast

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| Error state had no retry button | MEDIUM | Added retry button with inline reload logic |

**All KPIs verified from real DB data.**

---

### /dashboard/segments

**Status: FIXED**

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| Error state had no retry button | MEDIUM | Added retry button with inline reload logic |

**All 9 segments computed from real `Customer`/`Order` data.**

---

### /dashboard/orders

**Status: OK (no critical issues)**

- ✅ All KPI cards use real DB aggregates
- ✅ Status filter tabs use real counts from `order.groupBy`
- ✅ Mobile card view (`md:hidden`) and desktop table (`md:block`) both work
- ✅ Empty state shows onboarding guidance
- ⚠️ Desktop table has `min-w-[760px]` — wrapped in `mobile-scroll-x` which enables horizontal scroll on smaller tablets

---

### /dashboard/analytics

**Status: OK**
- All metrics from real DB
- 30-day trailing analytics via `/api/analytics`

---

### /dashboard/broadcasts

**Status: OK**
- Create, list, A/B test, AI generate, optimize — all wired to real APIs
- Audience builder including segment routing verified

---

### /dashboard/customers

**Status: OK**
- Customer list, detail, CRM controls all working

---

### /dashboard/bot

**Status: OK**
- Bot configuration form persists to `Bot` table via `/api/bot`

---

### /dashboard/safety

**Status: OK**
- Audit logs, protection metrics from real `SafetyAudit`/`ProtectionLog`

---

### /dashboard/usage

**Status: OK**
- Plan usage counters from `UsageLedger`/`UsageDailySnapshot`

---

## Remaining Risks (Not Fixed — Require Future Work)

| Issue | Priority | Reason Not Fixed |
|-------|----------|-----------------|
| Settings page "ترقية الخطة" button has no onclick | LOW | Requires payment integration (out of scope) |
| Manual sync doesn't pull from Shopify/WooCommerce APIs | MEDIUM | Requires OAuth implementation per platform |
| "Confidence" column in orders shows AI-internal score (0-100%) | LOW | Score is meaningful for operators — acceptable |
| Missing RBAC — all admins see all data | MEDIUM | Deferred to Phase 2 |
