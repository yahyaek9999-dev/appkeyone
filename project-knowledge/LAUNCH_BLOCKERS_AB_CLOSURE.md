# Launch Blockers — Category A & B Closure Report

Date: 2026-06-19 · Branch: `recovery/inspiring-meninsky-wallet-billing-qr`
Scope: close every Category A (payment/activation/trust) and Category B (operations health) launch blocker found in the Death Audit. Additive only; WhatsApp send pipeline untouched. No placeholders, no display-only pages — every workflow is executable from the UI and was verified at runtime.

## Files changed / added

Schema (both `schema.prisma` + `schema.postgres.prisma`, parity 107 models):
- `PaymentProof` +`proofImagePath` +`rejectionReason` +`reviewerName` +`reviewStartedAt` +`decidedAt` +`activatedAt`; status now `pending|under_review|approved|rejected|canceled`.
- `PaymentAccount` +`accountHolder` +`instructions`.
- `Incident` +`priority` +`dueDate` +`updatedAt`. New model `IncidentEvent` (append-only history).

Library:
- `lib/payments-ops/storage.ts` (NEW) — private receipt-image storage (`uploads/proofs`, served via gated route).
- `lib/payments-ops/proofs.ts` — image, `startReview`, status timestamps, `rejectionReason`/`reviewerName`, **audit on every money decision**, `resubmitProof` (rejection recovery).
- `lib/payments-ops/accounts.ts` — `accountHolder`/`instructions`; `customerPayableMethods()` (only methods with an active account → no dead checkout).
- `lib/finance/access.ts` (NEW) — `requireFinanceOrAdmin` gate (added to rbac-coverage recognized gates).
- `lib/incidents/engine.ts` — ownership + `IncidentEvent` logging, `assignIncident`, `setIncidentPriority`, priority→SLA due date, fallback assignment (no orphans).

Routes:
- `api/payments/proof` (multipart image create) · `api/payments/proof/[id]` (cancel + resubmit) · `api/payments/proof/[id]/image` (NEW, gated serve).
- `api/admin/payment-accounts` (uses `createAccount` + audit) · `api/admin/payment-accounts/[id]` (holder/instructions).
- `api/admin/payment-reviews/[id]` (finance-or-admin, start_review/approve/reject+reason, actor audit).
- `api/admin/incidents/[id]` (assign/priority/resolve).
- `api/settings/ai-provider/probe` (NEW, live active-provider probe).
- `api/auth/login` (finance role → `/finance/payments`).

UI:
- `dashboard/billing` + `billing-client` — account display + copy, image upload + preview, status timeline, rejection recovery, empty-state when no payable method.
- `finance/` (NEW area, gated) — `layout` + `payments` + `finance-payments-client` (image+zoom, start/approve/reject+reason). `admin/payment-reviews` reuses the same client.
- `admin/payment-accounts` form — accountHolder + instructions.
- `dashboard/meta-health`, `dashboard/whatsapp-health`, `dashboard/ai-operations` (NEW) + nav entries.
- `admin/incidents` + `incidents-client` — owner/priority/due/history/assign/resolve.
- `dashboard/audit-log` — labels for payment_approved/rejected + money family badge.

## Workflows completed (runtime-verified on a live server)

1. **Customer can pay** — sees receiving account (holder `KEYONE LLC`, id `binance-uid-7788`, instructions, copy) and uploads a real receipt image → proof stored with `proofImagePath`.
2. **Customer can track** — timeline Submitted→Received→Under Review→Approved/Rejected→Activated with timestamps + reviewer name.
3. **Customer can recover** — reject requires a reason (shown to customer); customer resubmits a new image → back to pending (never stuck).
4. **Finance can approve** — a `role=finance` user (blocked from `/admin`, 307) approved a payment from `/finance/payments`.
5. **Membership activates** — approve credited the wallet `$119` (idempotent `proof:<id>`) and set subscription `active plan=k_pro`; `decidedAt`/`activatedAt` stamped; audit `admin.payment_approved` by `finance@keyone.test` role `finance`.
6. **Meta can be monitored** — `/dashboard/meta-health` (200) + test-connection endpoint (gated, reachable).
7. **WhatsApp can be monitored** — `/dashboard/whatsapp-health` (200) + live `/api/whatsapp/status` (200) + reconnect/restart/replace.
8. **AI can be monitored** — `/dashboard/ai-operations` (200) + live provider probe (200) + switch + usage/latency/failure metrics from `ProviderCallLog`.
9. **Incidents always have owner** — rejected payment → incident-scan created an incident `status=assigned, owner set, dept=finance, dueDate set`, history `created,assigned`; priority→urgent and resolve added `priority_changed,resolved` events.

Verification gates: `tsc 0` · `build green` · `rbac-coverage PASS` · `schema-parity 107`.

## Remaining blockers (out of A/B code scope)
- External (Category-B infra): real Meta credentials, payment-provider live keys, the in-house LLM proxy (`mse_ai_api`, not in repo), production cron scheduling, multi-VPS/Postgres scale-out for WhatsApp-web sessions.
- Not in this batch: refunds/disputes model; per-customer-browser WhatsApp scaling limit (architectural).

## Launch readiness (A/B money+ops loop)
The money loop is now operable by a non-developer: configure receiving accounts → customer pays to a shown account with a real receipt → finance (no owner access) reviews the image and approves/rejects with a reason → wallet credited + plan activated → customer tracks/recovers. Operations health (Meta/WhatsApp/AI) is monitorable and actionable from the UI, and incidents are owned and tracked. Category A & B launch blockers: **closed and verified.**
