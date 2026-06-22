# KEYONE — Final Production Readiness Audit (2026-06-22)

**Verdict: NOT READY** — but every code-level CRITICAL/HIGH defect found is now **FIXED and verified**. The residual blockers are a short, concrete **operational go-live checklist** (set one env flag + migrate, run the cron installer, supply live keys), not scattered bugs.

Method: 16 areas audited end-to-end by independent deep-read agents (areas 1–11 + security 10.1–10.5 + 12–15), each CRITICAL/HIGH finding then **adversarially re-verified** against the real code by a second skeptical agent. 31 agents, ~2.1M tokens, **0 findings refuted** (all confirmed). Fixes were then implemented additively and re-verified with `tsc` (0 errors), `next build` (green), and targeted runtime tests.

---

## Confirmed blockers & status

### CRITICAL

| ID | Issue | Status |
|---|---|---|
| **META-1 / A12-01 / A14-4** | `planMetaAccess()` had no `k_*` keys → Meta Cloud silently blocked (`plan_blocked` → QR) for **every paying plan that advertises it**. | ✅ **FIXED + verified** — `planMetaAccess` now derives from the catalog (`getTier(slug).metaAccess`). Runtime test: k_pro=limited, k_business=limited, k_scale=full, k_enterprise=full, legacy slugs unchanged. `lib/messaging/feature-flags.ts` |
| **A6-1** | Approving a plan-purchase proof credited the wallet the full price **AND** activated the plan → one payment = paid subscription **+** equal Meta wallet balance (money loss). | ✅ **FIXED + verified** — `reviewPaymentProof` now branches: plan purchase → activate only; pure top-up → credit only. E2E test: plan purchase → wallet $0 + plan active; top-up → wallet $50 + no plan. `lib/payments-ops/proofs.ts` |
| **A15-2** | Production installer ran only `seed.ts` (legacy archived plans + admin) — the 6 `k_*` plans were **never seeded**, so on a fresh install every activation 404s `plan_not_found`. | ✅ **FIXED + verified** — `seed.ts` now calls `seedPlans()`; any seed run creates all 6 `k_*` rows (verified 6/6 with correct metaAccess). `prisma/seed.ts`, `prisma/seed-plans.ts` |
| **A11-1 / A15-3** | 17 of 21 cron routes had **no scheduler** (incl. Meta webhook processor, payments reconcile, QR scheduler, monthly credits) → silently never run in prod. | ✅ **FIXED (artifact)** — new `deploy/run-cron.ps1` + `deploy/install-all-cron-tasks.ps1` register all 21 at documented cadences; setup-vps instructions updated. **Operator must run the installer on the VPS** (see checklist). |
| **A1-1 / ENF-1** | `FREE_TIER_ENFORCEMENT` defaults OFF → any no-subscription / legacy user gets **all premium features free** (fail-open path). | ⚠️ **GO-LIVE CONFIG** — flipping it in code would lock out legacy subscribers (the non-regression design), so it is an operational decision. Added a **loud production startup warning** when it is not `1`. `lib/env.ts` |

### HIGH

| ID | Issue | Status |
|---|---|---|
| **A14-1 / A15-1 / A8-1** | No UI/API to grant `finance`/`admin` role → payment approval could only be delegated via DB edit / env-secret (the "operate without a developer" gap). | ✅ **FIXED** — role accepted on user-create + new `POST /api/admin/users/[userId]/role` (last-admin guard, audited) + role selector in the create-user modal. |
| **META-3** | Switching to Meta Cloud was allowed **without an app secret** → every inbound webhook silently rejected (`signature_invalid`); merchant looks "connected" but deaf. | ✅ **FIXED** — settings PUT blocks `meta_cloud` without an app secret; `metaCloudAllowedForUser` now treats a missing secret like a missing token (fail-safe to QR). |
| **A5-1** | QR overbooking prevented only by a non-atomic check-then-create → concurrent bookings could exceed lane capacity. | ✅ **FIXED + verified** — booking now runs in a transaction (Serializable on Postgres, write-serialized on SQLite) with a post-insert lane-clash guard. Concurrency test: 2 simultaneous same-window bookings → exactly 1 wins, 0 overbooked. |
| **WA-1** | Admin "disconnect"/"resend-QR" POSTed `/sessions/logout` (a contract the service doesn't expose) → DB flipped but live session kept running; admin reconnect was a dead link. | ✅ **FIXED** (route now uses the proven `lib/wa.ts` client: `DELETE /sessions/{id}`, `POST /sessions/{id}/start`). ⚠️ Needs one E2E pass against the running whatsapp-service. |
| **A9-1** | `/projects` "Case studies" fabricated named customers, 5-star ratings, and invented before/after metrics under "real success stories". | ✅ **FIXED** — relabeled as **illustrative use cases**, removed fake testimonials/stars, honest metadata + disclaimer. |
| **A9-2 / A13-1** | Self-serve `/signup` was orphaned — every public CTA went to WhatsApp; no marketing surface linked to signup. | ✅ **FIXED** — added "Create account / إنشاء حساب" to desktop nav + mobile drawer (WhatsApp CTA kept for the hybrid model). |
| **A11-2** | Deferred outbound WhatsApp messages could stall (outgoing-messages drain cron unscheduled). | ✅ **FIXED** — included in the master cron installer (1-min cadence). |
| **A2-1 / A7-1** | Admin per-plan toggles & `api_access` gate are inert for legacy/free users (same root as ENF-1). | ⚠️ **GO-LIVE CONFIG** — resolved by the enforcement go-live (flag + migration); startup warning added. |
| **A12-02** | Meta settings UI told `k_*` customers they could connect while routing blocked it. | ✅ **RESOLVED by META-1** (routing eligibility now correct). |

---

## Go-live checklist (operational — cannot be done from code)

1. **Enforce paid features**: migrate active paying customers to `k_*` plans, then set `FREE_TIER_ENFORCEMENT=1`. (Until then, premium features are free for non-`k_*` users. Startup now warns loudly.)
2. **Schedule crons**: on the VPS, `Copy-Item deploy\run-cron.ps1 C:\app\run-cron.ps1` then run `deploy\install-all-cron-tasks.ps1`. Verify `schtasks /Query /TN KEYONE-Cron-*`.
3. **Live keys**: set `META_CLOUD_ENABLED=1` + per-tenant Meta credentials (incl. app secret), payment-gateway keys (Paymob/Stripe) if used, and decide `WALLET_BILLING_ENABLED` / `BROADCAST_MONTHLY_CREDITS_ENABLED` / `BRAIN_MONTHLY_CREDITS_ENABLED`.
4. **Rotate secrets**: `SAAS_INTERNAL_SECRET` and `AUTH_SECRET` off the public defaults (prod boot now rejects weak values via `validateEnv`).
5. **Verify WA admin control** (WA-1) end-to-end against the running whatsapp-service once.

---

## Remaining MEDIUM / LOW (documented, not launch-blocking)

Open items worth a follow-up pass — none block launch once the checklist above is done:

- **Admin-without-developer depth**: no UI to **create/delete** a plan (PUT-only) or edit the capability→tier ladder (A14-5/A14-6); Meta not configurable per tenant from admin (A14-3); env-only switches have no admin toggle (A8-3). `StaffMember` is decorative — the new role API is now the real permissions path (A8-2/A14-2).
- **Reality/consistency**: pricing-card CTAs become dead `#` links if `supportWhatsapp` unset (A13-3); WhatsApp handoff points to login-gated billing without "create an account first" (A13-2); manual-proof amount isn't validated against plan price (A13-4).
- **WhatsApp UX**: dashboard home can show a stale "connected" status when the service is unreachable (WA-2); admin reconnect button query-param dead (WA-3); connect screen can hang on "preparing" with no timeout (WA-4).
- **QR**: no calendar-style customer booking surface (A5-2); `completeReservation` lacks a lifecycle guard (A5-3); activation cron re-activates without re-checking capacity (A5-4); no reschedule (A5-5).
- **Payments**: manual `PaymentTransaction` can sit `pending` forever (A6-2); refund blocked once funds spent (A6-3); orphaned admin payment-reviews client can't reject (A6-4); no `refunded` Arabic label (A6-5).
- **Enforcement hardening**: capability gates fail-open on internal error (ENF-2); a few write routes enforce RBAC but not plan capability (ENF-3); API gate fails open (A7-2) and skips metering on auth failure (A7-3).
- **Feature flags**: catalog ladder + visibility hardcoded (A2-2/A2-3); admin toggles don't propagate to the marketing FeatureMatrix.

---

## Verified production-grade (positives)

- **Tenant isolation**: every `:id` customer route scopes by the authed user/tenant (findFirst/updateMany/deleteMany with owner guard); export/analytics aggregate per-tenant. **No IDOR found.**
- **RBAC/secrets**: all `/api/admin/*` enforce `requireAdmin` server-side; team members never inherit platform-admin; secrets are AES-256-GCM at rest, masked in GET, never logged; `validateEnv` fail-closes on weak prod secrets.
- **Wallet**: ledger-first, idempotent (DB-unique `idempotencyKey` + `reversalOf`) — webhook replays / double-approve cannot double-credit; refund reverses the ledger.
- **API keys**: SHA-256 hashed, identity derived server-side (no cross-tenant), every request re-checks revoke/expiry/scope/rate-limit.
- **Capability ladder** for `k_*` plans is wired consistently through pricing → seed `featureFlags` → `getEffectivePlan` → `apiGate/pageGate` across ~80 routes.

---

*Generated 2026-06-22. Source branch: `recovery/inspiring-meninsky-wallet-billing-qr`. Fixes verified: `tsc` 0 errors, `next build` green, runtime tests pass for META-1, A6-1, A5-1, A15-2.*
