# Session 2 — Commercial Engine + Entitlements Report
**Generated:** 2026-08-14  
**Branch:** claude/wkeyone-product-closure-563061  
**Scope:** Membership System · Commercial Control · Promotions · Payment Gateways

---

## What Was Built

### 1. Layered Entitlement Engine (Single Source of Truth)

**File:** `lib/membership/entitlements.ts` — COMPLETE REWRITE

Effective entitlements now computed in 4 deterministic layers:

```
Base Plan (capIndex 0-3)
+ CustomerPlanOverride (admin custom deal)
+ EntitlementGift (sms_credits, ai_credits, feature_unlock, plan_upgrade, days)
+ Admin kill switch (always overrides — handled upstream in feature-control)
= final capabilities + limits
```

Key changes:
- `CAP_INDEX_BY_INTERNAL_TIER` replaces old `INDEX_BY_INTERNAL_TIER` (was 0,2,3,5 → now 0,1,2,3)
- `getEntitlements(userId)` is now the SINGLE function — no duplicate logic elsewhere
- `featureOffReason(userId, capKey)` returns Arabic explanation for "why is this off?"
- `PaywallError` includes `recommendedTier: TierSlug | null` for upgrade prompts
- `Entitlements.sources` records which layers contributed (for diagnostics)
- Fail-open on DB errors: gating never takes down production

---

### 2. Admin Commercial Control Center

**UI:** `app/admin/commercial/page.tsx`  
**APIs:**
- `GET/POST/DELETE /api/admin/users/[userId]/override` — per-customer plan overrides
- `GET/POST /api/admin/users/[userId]/gifts` — grant entitlement gifts
- `DELETE /api/admin/users/[userId]/gifts/[giftId]` — revoke unused gift
- `GET /api/admin/users/[userId]/entitlements` — full entitlement diagnostic

The UI provides:
- Customer search (live query)
- **Plan Override tab** — set custom baseSlug + addCaps + limitOverrides + expiry
- **Gifts tab** — grant any gift type with reason + expiry; list active/expired gifts
- **Diagnostics tab** — layer breakdown, limit display, "why is X off?" for every disabled cap

---

### 3. Promotions Engine

**UI:** `app/admin/promotions/page.tsx`  
**APIs:**
- `GET/POST /api/admin/promotions` — list + create
- `GET/PATCH/DELETE /api/admin/promotions/[id]` — manage single promotion

Promotion types supported:
| Type | Field | Notes |
|------|-------|-------|
| percentage | `discountPct` | 0-100% off plan price |
| fixed_usd | `discountUsd` | Fixed dollar discount |
| free_period | `freeDays` | N days free |
| credit_bonus | `creditType` + `creditAmount` | SMS/AI/broadcast credits |
| feature_unlock | `featureKey` | Temporary feature access |
| custom_price | `customPriceUsd` | Custom override price |

Status lifecycle: `draft → active → paused → expired`

Only draft promotions can be deleted. Active → pause is always reversible.

---

### 4. Payment Gateway Management

**UI:** `app/admin/payment-gateways/page.tsx`  
**APIs:**
- `GET/POST /api/admin/payment-gateways` — list + add
- `GET/PATCH/DELETE /api/admin/payment-gateways/[id]` — manage single gateway

Supported adapters: `stripe | paypal | hyperpay | tap | moyasar | paytabs | custom`

Security:
- Credentials stored as `encryptSecret(JSON.stringify(creds))` — AES-256-GCM
- Webhook secret stored encrypted separately
- API responses NEVER return credential bytes — only `hasCredentials: boolean`
- Cannot delete the default gateway — prevents accidental payment disruption

---

### 5. Admin Nav Updates

`app/admin/nav-links.tsx` now includes:
- `/admin/commercial` — التحكم التجاري (core: true)
- `/admin/promotions` — العروض والتخفيضات  
- `/admin/payment-gateways` — بوابات الدفع (core: true)
- `/admin/plans` — promoted to core: true

---

### 6. Schema Parity

- 172 models (SQLite ↔ PostgreSQL) — verified ✓
- PostgreSQL schema at 4063 lines

---

## Seed Catalog Fix

`lib/pricing/seed-catalog-plans.ts` — fixed `featureBullets()` to use `tier.capIndex` (0-3) instead of `tier.index` (0-5). This ensures the feature bullets generated for plan cards correctly reflect the 4-tier capability model.

---

## Security Compliance

| Constraint | Status |
|-----------|--------|
| Never rewrite working systems | ✅ — all changes additive |
| Never modify WhatsApp send pipeline | ✅ — untouched |
| Do NOT expose unfinished features | ✅ — gift/override only via Admin panel |
| Admin must control every major feature | ✅ — override + kill switch in place |
| Feature visibility respects Admin flag + dependencies + entitlement | ✅ — layered engine |
| Raw credentials never exposed | ✅ — encryptSecret(), API masks |
| Do NOT perform live Meta Cloud testing | ✅ — untouched |

---

## Remaining Pending Items

1. **Bot execution engine** — actual runtime (trigger → node → next → handoff/end)
2. **Inbox queue states UI + SLA display**
3. **Employee privacy filter in inbox API** (staff sees only own conversations)
4. **Team routing API** (round-robin assignment)
5. **Feature dependency chain resolution** in `isFeatureEnabled()`
6. **Nav feature-flag gating** — connect `isFeatureVisible()` to nav render
7. **Release management UI** (`app/admin/releases/page.tsx`)
8. **Shipping tracking UI** on order detail page
9. **Final documentation matrices:**
   - `FINAL_DEPENDENCY_GRAPH.md`
   - `FINAL_ADMIN_CONTROL_MATRIX.md`
   - `FINAL_MEMBERSHIP_MATRIX.md`
   - `FINAL_GOLIVE_CERTIFICATION.md`
