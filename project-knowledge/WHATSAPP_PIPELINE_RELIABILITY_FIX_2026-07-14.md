# WhatsApp Send-Pipeline Reliability Fixes — 2026-07-14 (owner-approved)

Follow-up to [PRODUCTION_GAP_AUDIT_2026-07-14.md](PRODUCTION_GAP_AUDIT_2026-07-14.md)'s
top finding. These three fixes touch code CLAUDE.md gates behind explicit owner
approval (`app/api/whatsapp/incoming/route.ts`, `lib/wa.ts`,
`lib/messaging/outgoing-queue.ts`). **Explicit per-fix approval was obtained before
any code was written** — all three were approved.

## Re-verification before implementation

Each finding was re-confirmed against current code with file:line evidence before
touching anything (see conversation record). All three held exactly as originally
reported.

## What changed

1. **Outbound idempotency key** — `enqueueSend()` derives a deterministic
   `sha256(userId:to:reason:5minBucket:text)` key and threads it into
   `enqueueOutboundText()`, which already supported one at the DB layer. Fixing
   this correctly required first closing a latent bug in `enqueueOutboundText`'s
   upsert: its `update` branch unconditionally reset `status` to `"queued"`
   regardless of current status — once a key was wired in, reusing it after the
   row already resolved would have **resurrected and resent an already-delivered
   message**. Added a short-circuit mirroring `QRProvider.sendMessage`'s already-
   correct pattern: a terminal-status (`sent`/`failed`/`expired`) row returns
   as-is; only `queued`/`sending` rows are legitimately re-enqueueable.

2. **Send timeout + queue fairness** — `wa.sendNow()`'s fetch to
   `whatsapp-service` now has a 25s `AbortSignal` timeout (scoped to `sendNow`
   only, not every `wa.*` call — `start`/`pair`/`exportData` weren't audited for
   their own latency expectations). `drainOutgoingQueue()` now fetches a wider
   candidate pool and applies the per-user cap while *selecting* into the batch
   (round-robin), not after a plain oldest-first `take(batchSize)`.

3. **Kill-switch reconnect-storm false positives** — the `disconnected` event
   handler in `app/api/whatsapp/incoming/route.ts` now only counts toward the
   6-in-10-minute auto-kill threshold when the reason represents a real
   WhatsApp-session state change, not a pure transport/infra blip
   (`bridge_offline`, `bridge_heartbeat_stale`, `gateway_restart`,
   `health_probe_stale`, `ephemeral_stale`).

## Verification (not just typecheck)

- **Idempotency**: a temporary debug route (added, exercised, then deleted before
  commit) confirmed two rapid enqueues with the same key produce exactly one row,
  and re-enqueuing after the row is `"sent"` returns the same row without
  resetting its status.
- **Fairness**: seeded one tenant with 15 old queued messages and two tenants
  with 2 each in the real local Postgres instance; a `batchSize=6` drain via the
  real `/api/cron/outgoing-messages` endpoint distributed **2/2/2** across all
  three tenants (confirmed via DB inspection of `attempts`/`errorCode` on every
  row) — the old code would have taken all 6 from the single oldest tenant.
- **Kill-switch**: 6 real webhook calls (3 non-bridge reason strings, 3
  bridge-sourced) against the real route — the true-disconnect case incremented
  `SafetyState.recentReconnects`, all 4 transport/infra reasons left it
  unchanged. **Repeated against live production** with a throwaway test account
  (created, exercised, then fully deleted): real disconnect 0→1, `ephemeral_stale`
  stayed at 1 — identical behavior to the local test.
- `tsc --noEmit`: 0 errors. `npm run build`: green. `verify:rbac`,
  `verify:wallet`, `verify:schema-parity`: all pass.

## Deploy

Commit `4644fa2` → merged to `main` at `5408706` → deployed to AWS production via
`deploy/release-aws.sh`. Post-deploy: `/api/health`/`/api/ready` green, zero
error-log entries, `whatsapp-service`/`bridge-gateway` both reachable and
unaffected, a real drain cycle against production ran cleanly with the new
fairness/timeout code path, and the kill-switch fix re-verified live as above.
