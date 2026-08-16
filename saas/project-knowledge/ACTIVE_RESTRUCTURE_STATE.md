# WKEYONE — Active Restructure State
**Updated:** 2026-08-14 (Session 6)

Compact working state. Update in place; do not regenerate.

---

## BLOCKER 1 — FEATURE REGISTRY EMPTY → CLOSED

**Symptom (production screenshot):** "لا توجد ميزات بعد / الكل (0)"
**Root cause:** `FeatureControl` table was never seeded. `seedDefaultFeatureControls()` existed but had no call-site. Every gate silently passed; the admin control plane was inert.

**Fix:**
- `seedFeatureRegistry()` derives rows from the **pricing capability catalog**, not a hand-written list. This makes `featureId === capability key` structural — load-bearing, because `getEntitlements()` Step 5 kills `capabilities[featureId]`; any drift turns the kill switch into a silent no-op.
- Idempotent + non-destructive: `update` refreshes descriptive/plan metadata only, never `status`/`killSwitch`/`customerVisible`/`rolloutPct`.
- Seeded from the **instrumentation hook on server boot** (not lazily) — the lazy path only fires on an authenticated request, so a fresh deploy sat empty. That was observed and corrected.

**Production evidence (`342ed27`):**
```
[feature-registry] reconciled 44 features, 5 releases
FeatureControl rows: 44   FeatureRelease rows: 5
by category: core 5 · automation 7 · intelligence 9 · analytics 5 ·
             commerce 3 · team 5 · scale 4 · enterprise 6
requiredPlan correctly mapped: any / k_growth / k_pro / k_enterprise
```

---

## BLOCKER 2 — RELEASES DISCONNECTED → CLOSED

**Symptom:** "لا توجد إصدارات بعد"; lifecycle was a decorative CRUD page.

**Fix:** 5 baseline trains seeded from the *shipped* product (no fabricated history): `core`, `automation`, `intelligence`, `commerce`, `scale`. Release state now gates availability — `active`/`beta` → available; `draft`/`hidden`/`archived` → unavailable.

New `getDisabledFeatureIds()` resolves **every** disable reason (kill switch, status, release state, disabled dependency) into one set with bounded propagation. `getEntitlements()` Step 5 consumes it. Previously Step 5 checked `killSwitch` alone, so archiving a release had no effect on plan capabilities — the entitlement layer and `isFeatureEnabled()` could disagree. They cannot now.

**Adversarial proof, run against PRODUCTION data and fully restored:**

| Test | Expected | Result |
|------|----------|--------|
| baseline disabled set | only `white_label` (comingSoon) | ✅ 1 |
| `inbox` live at baseline | not disabled | ✅ |
| killSwitch ON → `multi_whatsapp` | disabled | ✅ |
| killSwitch restored | live again | ✅ |
| archive `commerce` train | k1sms + shipping_tracking + loyalty_rewards all disabled | ✅ |
| other train unaffected during archive | `inbox` still live | ✅ |
| train restored | all 3 live again | ✅ |
| **final state** | 0 kill switches, 0 non-active releases | ✅ restored |

Logic covered by 21 new unit tests (`__tests__/feature-registry.test.ts`): empty registry, key drift, ignored release state, dependency × release interaction, recovery paths.

---

## COMPLETED (this session, verified)

| Item | Evidence |
|------|----------|
| Admin nav → 11 business-domain sections (A–K) | `app/admin/nav-links.tsx`; all 51 hrefs verified to have a real `page.tsx` |
| Admin nav: zero duplicate entries | Each destination appears in exactly one section |
| Customer nav → 8 business areas | `app/dashboard/nav-items.tsx` — الرئيسية / المحادثات / العملاء / المبيعات / التسويق / الأتمتة / التحليلات / الإعدادات |
| Customer nav: internal diagnostics removed | 9 QA/internal surfaces delisted (documented in-file) |
| Customer nav: duplicates consolidated | 12 duplicate destinations delisted, canonical kept |
| Customer nav: unfinished features hidden | flow-builder, agents, white-label |
| Beginner-mode core set realigned | `CORE_HREFS` matches the new 8-area structure |
| TypeCheck | 0 errors |
| Build | 184 pages, 0 errors |
| Tests | 96/96 PASS |

---

## VERIFIED-BY-INSPECTION (no change needed)

### Payment / checkout — NOT a regression
The product uses a **manual receipt-approval** payment model, not automated card checkout. Traced end-to-end and confirmed working:

```
/pricing → WhatsApp contact (wa.me)
/dashboard/billing → upload receipt → POST /api/payments/proof
  → /admin/payment-reviews → reviewPaymentProof()
    → lib/payments-ops/proofs.ts:58
       prisma.subscription.upsert({ status:"active", expiresAt:+30d })
         → getEntitlements() resolves plan capabilities
```
Refund path also closes correctly (`proofs.ts:184` → `status:"canceled"`).

There is **no automated plan-checkout endpoint** and there is no evidence one ever existed (`git log` on `app/pricing/`, `app/dashboard/billing/` shows no removed checkout). The only automated checkout is `/api/wallet/topup/checkout`, which is for wallet credit, not plan subscription — and it is intact.

**Conclusion:** the payment path is complete for the manual model. Building an automated card checkout would be a NEW FEATURE, not a regression fix, and would violate "never rewrite working systems" without explicit approval.

### /dashboard/ai-audit and /dashboard/playground
Both have valid page shells, valid entitlement gates, and their backing APIs exist (`/api/ai-audit`, `/api/ai-audit/run`, `/api/chat`). No structural breakage found by inspection. Both are QA/diagnostic harnesses and have been **delisted from customer navigation** per the directive ("customer must not see internal technical diagnostics"), which is the correct treatment regardless of their internal state.

---

## REMAINING — NOT STARTED

Classified honestly. None of these were completed this session.

| Item | Class | Why |
|------|-------|-----|
| Per-feature `limit` + `allowedRoles` columns | NON-BLOCKING | Registry now populated with 14 of the 16 requested fields. These two are absent from the schema; plan limits are currently carried by the entitlement `limits` object instead, which is authoritative and enforced. |
| Feature change-history UI | NON-BLOCKING | `changedBy` + `changeNote` columns are written on every admin edit; no timeline view yet. |
| Automated card checkout | OPTIONAL / NEEDS DECISION | See payment finding above — this is a new feature, needs owner sign-off on gateway + market. |
| Full 78-route customer crawl with authenticated session | NON-BLOCKING | Requires a seeded test account; not run this session. |
| UI normalization pass across all pages | NON-BLOCKING | Nav is normalized; per-page typography/spacing/empty-state sweep not done. |
| Database legacy/test-data cleanup | NON-BLOCKING | Deliberately not attempted — requires production data inspection and owner sign-off per DEPLOYMENT_RULES. |
| Security attack-scenario test suite | NON-BLOCKING | Existing isolation is enforced server-side and covered by 12 employee-privacy tests; adversarial suite not added. |
| Per-number isolated bot/routing/notifications | NON-BLOCKING | `NumberSettings` model + API + 5-tab UI exist; per-number bot binding at message-handling time not wired. |
| Customer employee invite/roles/departments UI | NON-BLOCKING | `TeamMember` model + server enforcement exist; owner-facing management UI incomplete. |
