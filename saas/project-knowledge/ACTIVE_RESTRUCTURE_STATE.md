# WKEYONE — Active Restructure State
**Updated:** 2026-08-14 (Session 6)

Compact working state. Update in place; do not regenerate.

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
| Canonical Feature Registry (16 fields: rollout %, version, allowed roles, limit, deprecated, history) | NON-BLOCKING | Current `FeatureControl` has ~14 of the 16 fields and the kill switch is wired into entitlements. Missing: per-feature `limit`, `allowedRoles`, change history UI. |
| Release → feature availability binding | NON-BLOCKING | `FeatureControl.releaseId` exists and `/admin/releases` manages lifecycle, but release status does not yet gate `isFeatureEnabled()`. |
| Automated card checkout | OPTIONAL / NEEDS DECISION | See payment finding above — this is a new feature, needs owner sign-off on gateway + market. |
| Full 78-route customer crawl with authenticated session | NON-BLOCKING | Requires a seeded test account; not run this session. |
| UI normalization pass across all pages | NON-BLOCKING | Nav is normalized; per-page typography/spacing/empty-state sweep not done. |
| Database legacy/test-data cleanup | NON-BLOCKING | Deliberately not attempted — requires production data inspection and owner sign-off per DEPLOYMENT_RULES. |
| Security attack-scenario test suite | NON-BLOCKING | Existing isolation is enforced server-side and covered by 12 employee-privacy tests; adversarial suite not added. |
| Per-number isolated bot/routing/notifications | NON-BLOCKING | `NumberSettings` model + API + 5-tab UI exist; per-number bot binding at message-handling time not wired. |
| Customer employee invite/roles/departments UI | NON-BLOCKING | `TeamMember` model + server enforcement exist; owner-facing management UI incomplete. |
