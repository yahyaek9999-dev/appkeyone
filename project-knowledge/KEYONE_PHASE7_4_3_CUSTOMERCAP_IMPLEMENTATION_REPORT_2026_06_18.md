# KEYONE — Developer Center + QR Broadcast Credits + One-Time Import + Customer Cap

**Date:** 2026-06-18 · **Branch:** `claude/fervent-aryabhata-d45230`
**Scope:** Phase 7 (Developer Center), Phase 4 (QR Broadcast Credit System), Phase 3 (One-Time QR Import), and Customer-Cap enforcement — built end-to-end, additive-only, on top of the verified Wallet vertical. **All gates green; 21/21 runtime checks pass.**

---

## 1. What was built (all additive — no existing logic file rewritten; send pipeline untouched)

### Schema — 9 new models + 4 additive columns (both schema.prisma + schema.postgres.prisma, parity **76**)
`ApiKey`, `ApiRequestLog`, `ApiUsageDaily` (Phase 7) · `QrSlotJob` (shared scheduler) · `BroadcastCreditWallet`, `BroadcastCreditLedger`, `BroadcastCreditPurchaseRequest` (Phase 4) · `ImportSession`, `ImportLog` (Phase 3). Additive columns: `Broadcast.{viaCredits,creditsReserved,qrJobId}`, `Subscription.contractedCustomers`. Catalog `TierLimits.customers` + `featureFlagsForTier` + `entitlements.limits.customers`.

### Engines (`saas/lib/…`)
- **QR slot scheduler** `lib/qr-pool/scheduler.ts` + `flags.ts` — FIFO queue over the **existing Smart QR Pool** (whatsapp-service hibernation): atomic claim (priority→age), capacity = `min(QR_SCHEDULER_MAX_SLOTS, HIBERNATE_MAX_ACTIVE)`, stuck-slot reclaim, `queuePosition`. No session pinned.
- **Developer Center** `lib/developer/{api-core,keys,api-gate,metering}.ts` — hash-only keys (sha256, shown once), constant-time verify, scopes, rotate/revoke (tenant-scoped → no IDOR), `withApiKey` gate (auth + plan-capability `api_access` + scope + per-key rate-limit + metering) for `/api/v1`, daily usage rollups + abuse detection.
- **Broadcast credits** `lib/credits/{credits-core,credits,flags,broadcast-handler}.ts` — ledger-first integer-credit engine (same atomic/idempotent/never-negative pattern as the wallet). `broadcast-handler` orchestrates **without touching the send pipeline**: creates campaigns as `status:"credit_queued"` (invisible to the existing drain cron), the scheduler **promotes** them to `"queued"` + wakes the session, and on completion **refunds unsent credits** (tenant pays only for messages sent).
- **One-Time Import** `lib/import/import-engine.ts` — `requestImport` (one-time via `ImportSession.userId @unique`), `runImportJob` (wake → read-only `wa.exportData` → build), and the pure builder `importData` → permanent `Customer` rows (`historicalImported=true`, NOT activated until first live inbound) + `CustomerMemory` (heuristic summary + facts, no LLM tokens). One additive read-only `GET /sessions/:id/export` endpoint added to whatsapp-service (no send code touched).
- **Customer cap** `lib/membership/customer-cap.ts` — `getCustomerCapState` (current/planLimit/contracted/effective/remaining; 0=unlimited) + `checkCustomerCap` (**grandfathered: effective cap ≥ current, never blocks existing tenants; only gates new growth when `CUSTOMER_CAP_ENFORCEMENT=1`**) — NOT wired into the protected creation paths.
- `lib/wa.ts` extended with `wake` / `stats` / `exportData` pool-control helpers (additive; existing send unchanged).

### Crons
`app/api/cron/qr-scheduler` (drives the shared queue: reclaim → reconcile broadcast slots → start jobs up to capacity; `checkInternalSecret`).

### API routes (30 new) — owner routes plan/RBAC-gated, admin routes `requireAdmin`, `/api/v1` key-gated
Developer: `/api/developer/keys`(+`/[id]`), `/api/developer/usage`, `/api/v1/me`, `/api/v1/customers`, `/api/admin/api-keys`(+`/[id]`). Broadcast credits: `/api/broadcast-credits`(+`/purchase`,`/campaigns`,`/queue`,`/analytics`), `/api/admin/broadcast-credits`(+`/[userId]`,`/purchases`,`/purchases/[id]`,`/queue`). Import: `/api/import`(+`/results`), `/api/admin/import`(+`/[id]`). Customer cap: `/api/admin/customer-cap`.

### Frontend (Arabic RTL, matches design system)
Customer: `/dashboard/developer` (keys, usage chart, rate limits, API + webhook docs), `/dashboard/broadcasts-pro` (credit balance, campaign creator, buy credits, queue, history, analytics), `/dashboard/import` (one-time stepper, progress, results), `/dashboard/usage` customer-cap card. Admin: `/admin/api-keys` (all keys + abuse), `/admin/broadcast-credits` (queue control, credit control, purchase approvals, monitoring), `/admin/import` (queue, monitoring, logs, stats), `/admin/customer-cap` (cap table + contracted-floor control). Nav wired in both shells.

---

## 2. Verification evidence
| Gate | Result |
|---|---|
| `tsc --noEmit` (full project) | **0 errors** |
| `next build` | **success** — 30 new routes emitted |
| `verify:schema-parity` | **PASS** — 76 models lock-step |
| `verify:rbac` | **PASS** — 174 routes, 101 gated, every mutating route gated |
| `verify:wallet` (prior vertical) | **PASS** — intact |
| **Runtime E2E** (built routes + real DB + stub WA) | **21/21 PASS** |

**Runtime E2E proved:** dev-key auth (`/api/v1/me` 200, bad key 401, revoked 401), scope-gated `/api/v1/customers`, metering (logs + daily rollup); credit-broadcast **promote** (`credit_queued`→`queued` + slot running), **settle** (refund unsent = reserved−sent, balance correct), **idempotent re-run** (no double-refund, one refund row); import **full builder** (session closed/one-time, 3 contacts + 2 conversations imported, ≥4 CRM customers + AI memory built, **no duplicate on re-run**).

**Screenshots captured (live, authenticated):** Developer Center, Credit Broadcasts, Import (customer); Admin Broadcast Credits, Admin Import, Admin API Keys, Admin Customer Cap. Demo data seeded then fully deleted (0 leftover rows).

---

## 3. Safety / gating
- **Send pipeline untouched** — broadcasts use the promote-trick (new `credit_queued` status invisible to the existing drain); the scheduler only wakes sessions + flips status. The wallet guard asserts no `@/lib/wallet` import in messaging/*; the same isolation holds for credits/import (they call `wa.*`/`messaging.*` facades only).
- **Smart QR Pool reused, not rewritten** (`whatsapp-service/src/sessions.js` hibernation).
- **Customer cap is grandfathered + observe-only by default** (`CUSTOMER_CAP_ENFORCEMENT=0`); never deletes or strands existing tenants.
- **Plan gating:** Developer Center gated by `api_access` (k_scale+); credit broadcasts by `broadcasts`; both fail-open for non-enforced legacy/no-sub tenants (non-regressive). Hidden from nav for roles lacking the permission.
- Flags (all safe defaults): `QR_SCHEDULER_ENABLED` (on; idle no-op), `BROADCAST_CREDITS_ENFORCE` (on), `CUSTOMER_CAP_ENFORCEMENT` (off), `BROADCAST_CREDIT_PER_RECIPIENT` (1).

## 4. Activation runbook
Deploy (additive `prisma db push`). Schedule `POST /api/cron/qr-scheduler` (e.g. every 1 min, `x-internal-secret`). Set `WHATSAPP_SERVICE_URL` for the import export endpoint. Developer Center / credit broadcasts / import are opt-in by usage. Flip `CUSTOMER_CAP_ENFORCEMENT=1` only after confirming grandfather floors. Live QR import requires a real connected session (export endpoint is functional; verified here via a stub).
