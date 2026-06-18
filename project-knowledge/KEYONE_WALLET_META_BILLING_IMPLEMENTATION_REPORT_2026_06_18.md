# KEYONE — Wallet + Meta Cost Engine — Implementation Report

**Date:** 2026-06-18
**Branch / worktree:** `claude/fervent-aryabhata-d45230`
**Scope delivered:** Requirements **#1 (Wallet + Meta Billing)** and **#2 (Meta Cost Engine)** from the production brief — built end-to-end (schema → engine → APIs → cron → customer UI → admin UI → permissions → audit → analytics), additive-only, and **verified at runtime**.
**Status:** ✅ Complete & verified. Gated OFF for actual money movement (`WALLET_BILLING_ENABLED=0`) so deploying is byte-neutral; the wallet/admin surfaces are live regardless because they touch only new tables.

---

## 1. Why this scope (honest framing)

The full brief lists 14 systems. Several already exist and must not be rewritten (per CLAUDE.md): the **Smart QR Pool** is already implemented in `whatsapp-service/src/sessions.js` (hibernation, LRU eviction, wake-on-demand); **subscription/entitlement gating** is already wired via `lib/pricing/catalog.ts` + `pageGate`/`apiGate`. The recovery-plan memory described a designed-but-uncommitted Wallet/API-key/customer-cap layer — **none of that code is in this worktree** (verified), so it had to be built.

The **Wallet + Meta Cost Engine** was chosen as the first complete vertical because it is: (a) the brief's #1/#2 priority and the core of the stated business model (KEYONE owns Meta, customers prepay KEYONE); (b) **genuinely missing**; (c) **purely additive** (5 new tables, new files, new routes) with **zero changes to the protected WhatsApp send pipeline**; (d) self-contained enough to finish and verify properly rather than leaving 14 stubs.

Meta cost is **derived from the existing append-only `WaMessage` ledger by a cron** — it never edits `meta-provider.ts`/`qr-provider.ts`/`outgoing-queue.ts`.

---

## 2. What was built

### Database (additive — both `schema.prisma` + `schema.postgres.prisma`, parity 67 models)
| Model | Purpose |
|---|---|
| `Wallet` | one prepaid USD wallet per tenant; `balanceUsd` cache |
| `WalletLedger` | append-only money truth; `idempotencyKey @unique`, `reversalOf @unique` |
| `WalletTopupRequest` | customer top-up request → admin approval (mirrors `UpgradeRequest`) |
| `MetaUsageRecord` | one billable Meta conversation (per tenant/customer/category/UTC-day); `@@unique([userId, conversationKey])` |
| `MetaRateCard` | admin-editable rate per (country, category): `rateUsd` charged vs `metaCostUsd` cost |

Money convention: **USD `Float`, rounded to 6 decimals** (micro-dollar) on every write — exact at these magnitudes, no Int overflow, no BigInt JSON pain (matches `ApprovalRequest.amount` precedent).

### Engine (`saas/lib/wallet/`)
- `money.ts` — rounding/format helpers.
- `flags.ts` — `WALLET_BILLING_ENABLED` (debit on/off, default OFF), `WALLET_ENFORCE_SENDS` (gated, unwired).
- `wallet-core.ts` — pure math (balance-from-ledger, never-negative debit decision, reversal key).
- `wallet.ts` — **ledger-first atomic engine**: credit / debit (atomic guarded `updateMany WHERE balanceUsd >= amount`, count≠1 ⇒ rollback ⇒ never negative) / adjust / reverse (deterministic per-entry key) / reconcile / `listLedger` / `walletAllowsSend` (gated, **not** called by the pipeline).
- `meta-rates.ts` — in-code default rate card + `countryFromPhone` (E.164 prefix map) + DB override resolver + idempotent seeder.
- `meta-cost.ts` — **reconciler**: reads sent outbound `WaMessage` (provider `meta_cloud`), resolves template **name→category via `WaTemplate`**, buckets into per-day conversations, prices by country, upserts `MetaUsageRecord`, debits the wallet idempotently (`meta:<id>`), locks priced fields once billed.
- `analytics.ts` — platform stats (revenue/cost/profit/cost-per-customer·message·conversation/top customers/category breakdown) + per-tenant breakdown.
- `alerts.ts` — low-balance/empty sweep (24h cooldown, writes `SafetyAudit` category `billing`).

### API routes
**Customer (owner-only via `billing` permission):**
- `GET /api/wallet` · `GET /api/wallet/ledger` · `GET|POST /api/wallet/topup` · `POST /api/wallet/calculator`

**Admin (`requireAdmin`, every money action audited):**
- `GET /api/admin/wallet` (platform stats)
- `GET|POST /api/admin/wallet/[userId]` (credit/debit/adjust/reverse/set_status/set_threshold/retry_billing)
- `GET /api/admin/wallet/topups` · `POST /api/admin/wallet/topups/[id]` (approve→credit/reject)
- `GET|PUT /api/admin/meta-rates`

**Cron (`checkInternalSecret`):** `GET|POST /api/cron/meta-cost` (reconcile + low-balance sweep).

### Frontend
- **Customer** `/dashboard/wallet` (+ `wallet-client.tsx`): balance hero, low-balance alert, lifetime totals, Meta usage breakdown (30d), top-up request form + history, cost calculator, paginated transactions ledger. Nav item added (settings workspace, `billing` perm → owner-only).
- **Admin** `/admin/wallet` (+ `admin-wallet-client.tsx`): money tiles (balance/revenue/Meta charged/Meta cost/**profit**/customer spend/unbilled debt/active tenants), **unit economics** (cost per customer·message·conversation), category breakdown, **top-up review queue**, **per-tenant table with inline credit/debit/suspend/threshold/retry controls**, **Meta rate-card editor**. Nav link added.

All UI is Arabic-first RTL, matches existing design tokens (`card`, `page-title`, `btn-primary/outline/danger`, dark theme), real data only.

---

## 3. Verification evidence

| Gate | Result |
|---|---|
| `tsc --noEmit` (full project) | **0 errors** |
| `next build` | **success** — 12 new routes emitted (`/dashboard/wallet`, `/admin/wallet`, `/api/wallet/*`, `/api/admin/wallet/*`, `/api/admin/meta-rates`, `/api/cron/meta-cost`) |
| `verify:schema-parity` | **PASS** — 67 models SQLite↔Postgres lock-step |
| `verify:rbac` | **PASS** — every mutating route gated (89 gated) |
| `verify:wallet` (new guard) | **PASS** — 33 invariant checks |
| **Runtime E2E** (built server + real dev.db) | **15/15 PASS** |
| **Security smoke** (runtime) | unauthenticated API → 401; dashboard → 307; cron w/o secret → 401 |

**Runtime E2E (through the real built `/api/cron/meta-cost` route)** proved: cron auth; conversation bucketing; template→category resolution (the one bug found & fixed mid-build — `WaMessage.templateName` is a name, not a category, so it's joined to `WaTemplate`); country pricing (EG 0.075 + SA 0.045); atomic debit (10 → 9.88); **idempotent re-run (no double-charge, no duplicate ledger rows)**; service category free; **ledger-truth == cached balance**. Test data was cleaned up (0 leftovers).

---

## 4. Safety / constraints honored

- **WhatsApp send pipeline untouched** — `verify:wallet` asserts the pipeline files do not import `@/lib/wallet`, and the cost engine does not import the messaging layer.
- **Additive only** — 5 new models (all defaults), new files/routes; no existing model altered; no column dropped/renamed (safe under `prisma db push`).
- **Gated money movement** — debits require `WALLET_BILLING_ENABLED=1`; until then the reconciler records projections only (UI labels them تقديري). `WALLET_ENFORCE_SENDS` is provided but **not wired** into sends (would need approval).
- **Audit + RBAC** — all admin money actions write `AuditLog`; wallet is owner-only (`billing` perm); cross-tenant reversal blocked.

---

## 5. Activation runbook

1. Deploy (byte-neutral; flags OFF). Run `prisma db push` in prod (additive `CREATE TABLE` only).
2. Schedule the cron: `POST /api/cron/meta-cost` (e.g. every 15 min) with header `x-internal-secret: $SAAS_INTERNAL_SECRET`. Recording starts immediately (safe projections).
3. Review/seed rates at `/admin/meta-rates`; review projected spend at `/admin/wallet`.
4. When ready to bill: ensure tenants have balances (admin credit or approve top-ups), then set `WALLET_BILLING_ENABLED=1`. Debits begin; insufficient balance → conversation stays unbilled (retried after top-up). Instant rollback: set `=0`.
5. (Future, approval-gated) wire `walletAllowsSend()` into the send path + set `WALLET_ENFORCE_SENDS=1` to stop sends at zero balance.

---

## 6. Remaining brief items (not in this pass)

QR Onboarding Import (#3), QR Bulk Broadcast + credits (#4), Smart QR Pool **admin visibility** on the existing service (#5), Developer Center/API keys (#7), Customer Cap enforcement (#8), and the broader Admin Super-Center/Analytics tabs (#9/#10) for those systems. Each is a follow-on additive vertical; the wallet `WalletLedger` (kind `broadcast`) is already shaped to meter broadcast credits when #4 is built.

**Files:** see `saas/lib/wallet/*`, `saas/app/api/wallet/*`, `saas/app/api/admin/wallet/*`, `saas/app/api/admin/meta-rates/route.ts`, `saas/app/api/cron/meta-cost/route.ts`, `saas/app/dashboard/wallet/*`, `saas/app/admin/wallet/*`, `saas/scripts/verify/wallet.js`.
