# Production Gap Audit & Closure — 2026-07-14 (evening session)

**Branch:** `claude/production-gap-audit-4bc566` → fast-forward merged into `main` (`ff99a5f` → `1a0e73c`) → pushed to `origin/main` → deployed to AWS production.

**Mission scope:** find and close genuine remaining production gaps after three earlier sessions today (production hardening, v1.1 completion, AI enterprise layer) had already shipped and deployed a large batch of work. This session's job was to find what those sessions *didn't* cover, not repeat them.

## Baseline check (before any changes)

Production `DEPLOYED_COMMIT` was `ff99a5f` — exactly matching local `main`. All three systemd services (`keyone.service`, `keyone-bridge-gateway.service`, `keyone-wa.service`) active, 13-day uptime, `/api/health` and `/api/ready` both green. **Nothing from earlier sessions was sitting undeployed.** This ruled out the most common failure mode ("built but never shipped") before any new work started.

## Discovery method

Six parallel research agents audited distinct, previously under-covered domains against the *current* code (not trusting prior reports at face value): admin diagnostics/monitoring backlog, Bridge reliability code paths, dashboard UX silent-failure patterns, WhatsApp outbound-reliability code paths, onboarding-flow completeness, and docs staleness + cron-dispatcher wiring. Each finding below was independently re-verified against the live code (and in the flagship case, against a real database) before being acted on.

## The headline finding: self-serve signup was a dead end

**`app/api/auth/signup/route.ts` + `app/dashboard/activation-guard.tsx`.** A brand-new self-serve signup (`SIGNUP_AUTO_APPROVE` is on by default) creates a `User` + empty `Bot` but **no `Subscription`**. `isActiveSubscription(sub)` — the single function that gates dashboard nav, entitlements, and the hard activation lockdown — returns `false` for a subscription-less user. The onboarding wizard (`app/onboarding/wizard.tsx`) finishes and redirects to `/dashboard/whatsapp` → `/dashboard/qr-queue`, which is **not** on `ActivationGuard`'s allow-list. Result: every new self-serve signup finished onboarding and landed on a full-screen "activate your subscription to continue" lock, with **zero self-serve way past it** — the only trial-grant mechanism in the codebase was an admin-only endpoint (`POST /api/admin/users/:id/trial`).

This is not a stale-memory artifact: an earlier memory record described the trial system as "flag-gated default-OFF," but the current code has no such flag anywhere in the activation path — that description was accurate for a since-superseded version of the trial subsystem, and was treated as such (current code wins over memory, per standing instruction).

**Fix:** extracted the admin route's existing trial-grant logic into `lib/membership/trial.ts` (`grantTrial()`), refactored the admin route to use it (behavior-preserving), and call it from signup's `approved` branch with a 72-hour default trial on the cheapest `k_*` catalog plan — the same resolution logic the admin route already used. Best-effort: a missing/misconfigured plan catalog can never block signup itself, it just leaves that one edge case on the paywall (same as today).

**Verified, not assumed:** ran this against a real Postgres instance twice — once against an empty local test DB (confirmed it fails gracefully with zero plans seeded, matching the fallback semantics), then against a seeded one (confirmed a `Subscription(status=trial, 72h, trialGrantedBy="signup:auto")` row is created and the previously-locked `/dashboard/qr-queue` renders real content instead of the lock screen). Then repeated the exact same test against **live production** after deploy: signed up a throwaway account at `w.keyone1.com`, confirmed via direct `psql` query that a real trial `Subscription` was created (`k_enterprise`, 72h), confirmed the lock screen does not render, then deleted the test account (`User`/`Bot`/`Subscription` rows) — no debris left behind.

## Other fixes shipped this session (all additive, all in dashboard/admin UI or docs — none touch the WhatsApp send pipeline)

### UX: 8 silent-failure / missing-confirmation bugs
- `bot/bot-form.tsx` — save() had no error path at all; a failed save just stopped the spinner with zero feedback. Now toasts on failure.
- `white-label/white-label-ui.tsx` — a failed initial load left the page stuck on "Loading..." forever (`loading` cleared but `!cfg` stayed true). Now shows a retry button.
- `developer/developer-client.tsx` — API key rotate/revoke used bare `confirm()` and silently swallowed failures. Swapped to the app's `useConfirm()` dialog + toast on failure (highest-stakes of this batch — security-adjacent).
- `settings/team/team-settings-ui.tsx` — removing a team member fired immediately with **no** confirmation step at all (not even a native `confirm()`). Added a danger-confirm dialog.
- 4 remaining native `confirm()`/`window.confirm()` calls swapped to `useConfirm()`: `settings/bridge/control-center.tsx` (×2 — device unlink, generic bridge actions), `settings/providers/[domain]/providers-client.tsx` (delete credential), `automations/rule-builder-ui.tsx` (delete rule).
- `quick-replies/quick-replies-ui.tsx` — add/update/remove had zero error handling; a failed save silently cleared the input fields as if it worked.
- `broadcasts-pro/broadcasts-pro-client.tsx` — a failed wallet-balance fetch defaulted to displaying `0`, indistinguishable from "you have zero credits."
- `monitoring/monitoring-ui.tsx` — a failed fetch rendered the same copy as "no scan has ever been run" — actively misleading. Now shows a distinct failure state.

### UX: repeated blank-screen-on-load-error pattern (6 files)
`analytics/analytics-ui.tsx`, `ai-audit/audit-ui.tsx`, `arena/arena-ui.tsx`, `arena/fixes/fixes-ui.tsx`, `arena/optimize/optimize-ui.tsx`, `arena/hallucinations/hallucinations-ui.tsx` all shared `loading ? <Spinner/> : !data ? null : <Content/>` — a failed fetch rendered nothing at all, with no error message and no way to retry short of a full page reload. Added a `loadFailed` state and a consistent retry-button block to all six.

### Admin
- The platform already had a comprehensive system-health aggregator (`/dashboard/system-health` — DB/Redis/queue/worker/AI-provider status) but it was unlinked from any admin nav, reachable only via the dashboard help drawer. Added a thin `/admin/system-health` page reusing the same component + a nav entry.
- `/admin/feature-flags` tracked 9 of the ~24 real feature flags in the codebase (missing all of `lib/scaling-flags.ts`, `lib/actions/flags.ts`, `lib/brain/flags.ts`, `lib/credits/flags.ts`, `lib/qr-pool/flags.ts`, `lib/qr-queue/flags.ts`). Extended to read the real flag modules directly (not re-implemented env-var comparisons, to avoid drift).
- Two unguarded destructive admin actions — suspend business (`suspend-button.tsx`), suspend staff (`staff-client.tsx`) — fired on a bare click (business suspend had only an optional `prompt()`, staff suspend had nothing at all). Added confirm dialogs to the suspend direction only (reactivate stays a single click, as before).
- `/admin/protection-logs`'s ban-events sub-table was hard-capped at 20 rows with no pagination, unlike the main table on the same page. Gave it the same `page`/`skip`/`take` treatment.

### Docs
- `README.md` / `README_INDEX.md` described the retired Windows VPS (`keydeploy`, NSSM, `C:\app`) and a dead domain (`app.keyone1.com`, confirmed non-resolving) as current. Corrected both to the real AWS/`deploy/release-aws.sh` deploy path.
- 4 dead bash deploy scripts (`deploy.sh`, `deploy/build.sh`, `deploy/release.sh`, `deploy/rollback-release.sh`) had zero in-file warning and would silently attempt to SSH into a box that no longer exists. Added a hard-stop guard (env-var override to bypass, for anyone who genuinely needs the old script for reference).
- 3 PowerShell deploy scripts got the same warning as a header comment (no hard-stop — less familiar territory, lower risk of accidental execution than a bash script someone might pipe to).
- `keyone-bridge/` (the original Go/whatsmeow implementation, rejected by WhatsApp's pairing servers and never shipped) had no retirement notice in its own README and still read as a live spec. Added one.
- `project-knowledge/PROJECT_STATE_2026_06_05.md` — a 5-week-old snapshot with stale production facts — was still linked from `PROJECT_CONTEXT.md` as "latest state snapshot." Marked superseded in both places.
- `deploy/cron/README.md`'s endpoint count/list hadn't been updated when `ai-catalog-guard` was added earlier today. Corrected (cosmetic only — the actual dispatcher script was already correct).

## Real gaps found and deliberately NOT fixed this session

Per `CLAUDE.md`'s hard rule (never modify the WhatsApp send pipeline without explicit owner approval) and the identical judgment call every prior session today made on the same boundary, three genuine reliability gaps were found and are **not** touched in this diff:

1. **No outbound message dedup** (`bridge-gateway/index.js`, `lib/messaging/outgoing-queue.ts`, `lib/wa.ts`) — the dominant send path (`wa.send`/`enqueueSend`) never forwards an idempotency key into `enqueueOutboundText`, unlike `QRProvider.sendMessage`, which does. Combined with the 10-minute stale-`sending` auto-reset, a crash between "message delivered to WhatsApp" and "DB write confirming it" can produce a genuine duplicate customer-facing message.
2. **Sequential, no-timeout outgoing-queue drain** (`lib/messaging/outgoing-queue.ts`) — `wa.sendNow()` has no `AbortSignal`, and the drain loop processes its batch one row at a time; a single hung send can stall the entire tick for every tenant in that batch. A secondary finding in the same file: the per-user fairness cap (`perUserLimit`) is applied only *after* the global fetch, so one tenant's large backlog can starve every other tenant's throughput for extended periods.
3. **Reconnect-storm kill-switch false positives** (`app/api/whatsapp/incoming/route.ts`, `lib/safety/kill-switch.ts`) — the gateway fires a `disconnected` event on *any* Bridge↔Gateway socket loss, not just a real WhatsApp-session drop, and `recordReconnect()` counts every one toward the 6-in-10-minutes auto-kill threshold. A customer's flaky home network can trip a 24h send lockout on their own account. Already documented as a known false-positive risk in the ops runbook; the code confirms the root cause is unaddressed.

Also found, lower severity, same reasoning (not send-pipeline-adjacent enough to block, but large enough in scope to deserve their own session): no independent WhatsApp-session liveness check (only the Bridge↔Gateway transport is heartbeated — the whatsapp-web.js session itself can die silently while the dashboard still shows "Connected"); no aggregated cron-run-success/failure visibility anywhere (24 cron endpoints, zero UI showing whether any of them ran or failed); no per-tenant admin diagnostics page (support staff must currently cross-reference 4+ separate admin pages by email to debug one tenant); `/admin/payments` has no search/filter/pagination unlike its sibling pages; no CSV/JSON export on the highest-value admin tables (businesses, users, payments, wallet, audit log) despite the exact pattern already existing elsewhere in the codebase.

## Verification performed

**Local (worktree build environment: symlinked `node_modules`, provisioned a real local Postgres instance since the shared `.env` had no working `POSTGRES_URL`, installed the `pdfkit` dependency that was declared in `package.json` but missing from the shared `node_modules` — an environment gap left over from an earlier session, not a code bug):**
- `tsc --noEmit` — 0 errors, before and after every batch of changes
- `npm run build` — green, all 168 routes compile including the 2 new/modified admin routes
- `verify:schema-parity` — 156 models in lock-step
- `verify:rbac` — 308 routes scanned, every mutating route gated or waived
- `verify:wallet` — 33/33 invariants
- `verify:all` — 31 pass / 6 skip / 2 warn (identical pattern to every prior session's baseline — skips/warns are all environment-only: needs a live URL, or the co-located whatsapp-service isn't running in this sandbox)
- Full `next build && next start` runtime smoke test against real Postgres: signup → trial-grant → previously-locked dashboard route renders real content (see above); public pages 200; unauthenticated admin pages 307; unauthenticated mutating API 401 not 500

**Production, after deploy:**
- `deploy/release-aws.sh` — clean run, `DEPLOYED_COMMIT=1a0e73c` confirmed
- `GET /api/health` → `{"status":"ok","db":"ok"}`; `GET /api/ready` → all 3 checks `ok`
- `/`, `/login`, `/signup` → 200; `/dashboard`, `/dashboard/settings/bridge`, `/dashboard/ai-audit`, `/admin/system-health` → 307 (unauthenticated, correctly gated)
- Signed up a real throwaway account against `w.keyone1.com`, confirmed via direct `psql` query that a trial `Subscription` was created and the activation lock does not render for that account, then deleted all rows created by the test (no debris left on production)
- `journalctl -u keyone.service -u keyone-bridge-gateway.service` since deploy, `-p err` — zero entries

## Bottom line

One critical, currently-live gap closed and verified end-to-end in production: self-serve signups now actually get to use the product instead of dead-ending on a paywall with no way past it — this was very plausibly costing real signups before today. Sixteen additional UX/admin correctness fixes shipped, all additive, all in dashboard/admin UI code, none touching the WhatsApp send pipeline. Seven documentation files corrected to stop pointing at retired infrastructure. Three real WhatsApp-reliability gaps were found, are not fabricated as fixed, and are flagged above for an explicit owner decision — consistent with every prior session's handling of the same CLAUDE.md boundary. `main` and production are in sync at `1a0e73c`. Full regression suite green before and after, against both the worktree build and the live production instance.
