# KEYONE — Meta Cloud API Plan Gating Report

**Date:** 2026-06-02
**Scope:** Meta Cloud API eligibility by subscription tier, plan detection, activation flow, and customer-facing messaging.
**Goal:** Meta Cloud API remains a **premium feature for Max and Companies only**. Starter and Pro continue on QR mode. Remove misleading / technical messaging.

---

## 1. Current Behavior (Before Fix)

### Plan → access mapping (was already correct)
The plan-tier mapping was correct in all three sources of truth:

| Plan slug | Tier | metaAccess |
|-----------|------|-----------|
| starter | basic | `none` |
| pro | pro | `none` |
| max | max | `limited` |
| companies | companies | `full` |
| business *(legacy)* | max | `limited` |
| enterprise *(legacy)* | companies | `full` |

- `lib/messaging/feature-flags.ts` → `PLAN_META_ACCESS`
- `lib/membership/plan.ts` → `META_BY_TIER`
- `lib/membership/seed-defaults.ts` → `PLAN_DEFAULTS`

### The core bug (misleading message for paying customers)
The Meta Cloud settings UI derived `planAccess` from `metaCloudAllowedForUser()`. That function is the **send-routing eligibility** check and applies a **4-layer guard**:

1. Global env kill switch `META_CLOUD_ENABLED=1`
2. Plan tier (`max` / `companies`)
3. `Bot.connectionMode === "meta_cloud"`
4. `Bot.metaAccessTokenEnc` present

Layer 1 short-circuits **first** and returns `access: "none"` when the global flag is off. The platform default is `META_CLOUD_ENABLED=0` (`.env.example:60`, no override in `.env`).

**Consequence:** with the global flag off, the UI saw `planAccess === "none"` for **every** user — including Max and Companies — and rendered:

> ❌ "باقتك الحالية لا تدعم Meta Cloud. يحتاج اشتراك في باقة Max أو Companies."

i.e. **paying Max/Companies customers were told their plan does not support Meta Cloud.** This is the misleading message the task required removed.

### Other misleading / technical strings exposed to users
| Location | Problem |
|----------|---------|
| `meta-cloud/page.tsx` | Platform readiness banner referencing internal "غير مفعّل حالياً على المنصة" state |
| `meta-cloud-form.tsx` | "(يتطلب باقة Max أو أعلى)" — vague ("أعلى" implies tiers above Max) |
| `compliance/page.tsx` | "تنبيه: Meta routing مغلق (`{eligibility.reason}`)" — **leaked internal reason codes** (`global_disabled`, `missing_token`, `mode_not_meta`) and developer term "routing" |
| `usage/page.tsx` | Pill "Meta Access: `none` / `limited` / `full`" — raw developer enum shown to customers |

---

## 2. Fixes Applied

All changes are **additive and UI-only**. The WhatsApp send pipeline (`resolveProvider`, `metaCloudAllowedForUser`, `meta-provider.ts`, `feature-flags.ts` routing) was **not modified**, per project rule "Never modify WhatsApp send pipeline without explicit approval."

### Decoupling UI gating from the global kill switch
UI eligibility now reads the merchant's **plan tier directly** via the existing `getEffectivePlan(userId).metaAccess`, which is independent of the `META_CLOUD_ENABLED` runtime flag. The global flag remains a silent backend ops kill switch (when off, sending falls back to QR with no message loss — unchanged behavior).

### File-by-file

**`app/dashboard/settings/meta-cloud/page.tsx`**
- Replaced `metaCloudAllowedForUser()` with `getEffectivePlan()` for UI gating.
- `planAccess = plan.metaAccess` (plan-based, global-flag-independent).
- Removed the platform-readiness banner (internal state).
- Removed `globalEnabled` and `eligibilityReason` from the props passed to the form.
- New customer-friendly banners:
  - **Max / Companies:** "يمكنك الآن ربط Meta Cloud API. أكمل إعدادات Meta Business للبدء."
  - **Starter / Pro:** "Meta Cloud API متاحة ضمن باقات Max و Companies. يمكنك الاستمرار باستخدام QR Code أو الترقية لتفعيل Meta Cloud." + link to `/pricing`.
- Setup checklist ("خطوات الربط") is now shown **only** to Max / Companies.

**`app/dashboard/settings/meta-cloud/meta-cloud-form.tsx`**
- Removed `globalEnabled` and `eligibilityReason` from `InitialState` (technical fields no longer surfaced).
- Meta Cloud radio stays disabled for Starter / Pro; label changed to "(متاحة في باقات Max و Companies)".

**`app/dashboard/compliance/page.tsx`**
- Removed the leaked reason-code message. Replaced with: "ملاحظة: رسائلك تُرسل حالياً عبر QR Code. أكمل إعداد Meta Cloud لتفعيل الإرسال الرسمي." (no internal codes, no "routing" jargon).

**`app/dashboard/usage/page.tsx`**
- Pill relabeled "Meta Cloud" with friendly values: `none → "غير متاحة"`, `limited`/`full → "متاحة"`.

---

## 3. Plan Matrix (After Fix)

| Plan | Meta Cloud radio | Setup checklist | Activation flow | Banner | QR mode |
|------|------------------|-----------------|-----------------|--------|---------|
| **Starter** | Disabled | Hidden | Blocked | "متاحة ضمن باقات Max و Companies …" + upgrade link | ✅ Available |
| **Pro** | Disabled | Hidden | Blocked | "متاحة ضمن باقات Max و Companies …" + upgrade link | ✅ Available |
| **Max** | Enabled | Shown | Allowed | "يمكنك الآن ربط Meta Cloud API …" | ✅ Available |
| **Companies** | Enabled | Shown | Allowed | "يمكنك الآن ربط Meta Cloud API …" | ✅ Available |
| No subscription / expired / suspended | Disabled | Hidden | Blocked | Upgrade message | ✅ Available |

Note: actual send-time routing still requires the backend guards (global flag + mode + token). When those are not satisfied, sending uses QR automatically — no customer-visible error.

---

## 4. Verification Results

### Logic / plan detection
- `getEffectivePlan()` resolves tier from `plan.tier` (fallback `TIER_BY_SLUG`) → `metaAccess` from `plan.metaAccess` (fallback `META_BY_TIER`). Starter/Pro = `none`; Max = `limited`; Companies = `full`. ✅
- No-subscription / expired / suspended → fallback `metaAccess: "none"` → correctly blocked. ✅
- UI gating no longer depends on `META_CLOUD_ENABLED`, so Max/Companies see availability regardless of the global flag state. ✅

### Messaging audit
- No environment variable names shown to users. ✅
- No internal reason codes (`global_disabled`, `missing_token`, etc.) shown. ✅
- No developer enums (`none`/`limited`/`full`) shown. ✅
- Exact required copy applied for both Starter/Pro and Max/Companies. ✅

### Build / typecheck / regression
### Build / typecheck / regression
- `npx tsc --noEmit`: **PASS** (exit 0, no errors).
- `npm run build`: **PASS** (Next.js production build completed; `/dashboard/settings/meta-cloud` compiled successfully at 2.43 kB).
- `npm run verify:all`: **PASS** — `{"ok":true,"counts":{"pass":35,"skip":4,"warn":1}}`. The single warn (`whatsapp:service-stats`) is the local WA service endpoint being unreachable in this environment (no sends attempted); 4 skips require a live base URL. No failures.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `app/dashboard/settings/meta-cloud/page.tsx` | Plan-based gating, customer-friendly banners, checklist gated to Max/Companies |
| `app/dashboard/settings/meta-cloud/meta-cloud-form.tsx` | Removed technical props, friendlier disabled label |
| `app/dashboard/compliance/page.tsx` | Removed leaked reason code, friendly QR-fallback note |
| `app/dashboard/usage/page.tsx` | Customer-friendly Meta Cloud pill |

**Not modified (intentionally):** `lib/messaging/feature-flags.ts`, `lib/messaging/index.ts` (`resolveProvider`), `lib/messaging/meta-provider.ts`, `lib/membership/plan.ts` — send pipeline and plan resolution logic preserved.
</content>
