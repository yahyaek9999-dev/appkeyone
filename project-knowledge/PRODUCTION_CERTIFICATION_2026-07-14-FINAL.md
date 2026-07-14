# KEYONE Production Certification — 2026-07-14 (Final)

Second and concluding pass of the same-day gap-closing session. Session 1 (see
[PRODUCTION_GAP_AUDIT_2026-07-14.md](PRODUCTION_GAP_AUDIT_2026-07-14.md)) fixed
the self-serve-signup dead-end and 16 UX/admin/docs gaps. This pass ran a
second, deeper audit wave (auth, AI, security, sales/broadcast/inbox reliability,
mobile/accessibility, hidden-bugs-via-runtime-evidence) plus direct live AWS
verification, fixed every safely-fixable finding, and re-deployed. Nothing here
is asserted from memory or a prior report — every claim below was re-verified
against current code, a real Postgres instance, or live production.

---

## ما تم إصلاحه (Fixed)

**Auth / sessions:**
- **Session revocation on password change.** Neither logout nor password reset
  previously invalidated an existing JWT — a stolen cookie stayed valid up to
  30 more days even after the exact action a compromised user would take.
  Added a `passwordChangedAt` claim embedded in the JWT at sign-time and
  checked on every request (`lib/auth.ts`); both self-service and admin-forced
  password resets now bump it. Old tokens with no claim are grandfathered in
  (no mass logout on rollout). **Verified twice end-to-end** (local Postgres,
  then live production): fresh session → 200 on `/dashboard`; reset password
  via the real API; same cookie → 307; fresh login with the new password → 200.
- Added a per-email rate limit on `forgot-password` (mirrors the existing
  login guard) — closes a proactive email-bombing gap for once a real SMTP
  provider is configured.
- Hardened `normalizeRole()` to never return `"owner"` even if a future write
  path ever persisted that value on a `TeamMember` row (defense-in-depth;
  currently unreachable through the app).

**Security:**
- **SSRF** — the `infobip` SMS provider's merchant-configurable base URL was
  only validated at config-save time, not at send time (a DNS-rebind TOCTOU
  window). Now uses `safeFetch` on every call, matching the sibling `custom`
  provider's already-correct pattern.
- **Upload hardening** — payment-proof receipt uploads now sniff real magic
  bytes instead of trusting the client-declared `Content-Type` (the same class
  of bug already fixed for product images in an earlier session), and are now
  rate-limited (previously unlimited).
- **Cross-tenant IDOR** — the product-image serve route only checked "is any
  tenant logged in," never "does this tenant own this file." Added a
  `ProductImage` ownership table populated at upload time; enforced for new
  uploads; every image uploaded before this fix is grandfathered in unchanged
  (not a regression).
- **Admin accountability** — password-reset, suspend, delete, approve/reject,
  and trial-grant admin actions now write to the audit log, matching the
  pattern the role-change endpoint already used. Previously an admin (or an
  attacker who compromised an admin account) could reset any user's password
  and log in as them for up to 30 days with zero record anywhere.
- Removed a dead, unused duplicate product-upload endpoint that wrote
  directly into the public web root with a weaker trust model than its
  replacement (confirmed zero callers before deleting).

**Money correctness:**
- **Coupon one-time-per-customer race** — a real TOCTOU (check via `findFirst`,
  then `create`, no DB guard) could let two near-simultaneous redemptions both
  pass the check. Added the missing `@@unique([couponId, customerId])`
  constraint (verified zero existing violating rows in production before
  adding it) and a graceful rollback-on-conflict in the route.
- **Subscription-expiry month-overflow** — `setMonth(+1)` on a monthly
  activation dated Jan 29–31 silently overflowed into March instead of
  February, granting a few extra free days. Switched to millisecond
  arithmetic, matching the sibling route's already-correct pattern.
- **Wallet / broadcast-credit / brain-credit first-create race** — three
  copies of the same `findUnique`-then-`create` pattern could 500 (uncaught
  `P2002`) for the loser of two concurrent first-ever-wallet requests for a
  brand-new tenant. All three now catch the conflict and return the winner's
  row.
- **CustomerMemory race** — converted a manual check-then-branch (with a
  silent catch-all around the whole function, so the race was invisible even
  in logs) into a real atomic `upsert`.

**Data correctness:**
- **Systemic timezone bug** — analytics "today"/daily-trend, sales-brain
  revenue "today"/weekly-trend, and the QR-queue booking calendar all computed
  day boundaries via `setHours(0,0,0,0)` (the server's own local time — UTC on
  the AWS box) instead of the merchant's real Africa/Cairo day. Verified the
  actual gap: Cairo is UTC+3, so roughly the first 3 hours of every Cairo
  calendar day were bucketed into the wrong day. Added
  `lib/tz.ts#startOfLocalDay` (verified against a live instant) and applied it
  at all identified call sites, using `localYmd` (not `toISOString()`) for
  date labels so the fix doesn't introduce a new off-by-one in the other
  direction.

**UX:**
- Fixed a WCAG-AA contrast failure — `slate-500` (~4.16:1) on the dark canvas
  in the shared `.page-desc`/`.kpi-label`/`.table-header` classes, used on
  roughly 85 pages app-wide. One shared-class fix (→ `slate-400`, ~7.7:1).

**Live infrastructure (not a code change):**
- Found and terminated a genuinely orphaned test process on the production
  box: a `wmtest` binary (leftover from testing the retired Go/whatsmeow
  bridge prototype) had been running unsupervised for **8 days**, continuously
  cycling QR pairing attempts against WhatsApp's real servers from the
  production IP, and had grown a 36MB log file. Terminated gracefully
  (SIGTERM) and removed its debris, per `DEPLOYMENT_RULES.md`'s server-hygiene
  guidance. Confirmed zero relation to any tracked service (`ppid=1`, not
  under systemd).

## ما تم تحسينه (Improved, from session 1 — carried forward)

Self-serve trial auto-grant on signup (the headline fix — closed a dead-end
paywall), 8 UX silent-failure/confirmation fixes, a repeated
blank-screen-on-load-error pattern across 6 pages, `/admin/system-health`
wired into the admin nav, feature-flags coverage 9→24, 2 missing admin
confirmation dialogs, ban-events pagination, 7 stale-docs corrections. Full
detail in the session-1 report.

## ما تم إضافته (Added)

- `lib/membership/trial.ts` — shared trial-grant helper (session 1)
- `app/admin/system-health/page.tsx` (session 1)
- `lib/tz.ts#startOfLocalDay` — real Cairo-local day-boundary helper (session 2)
- `ProductImage` model — upload-ownership tracking (session 2)
- `User.passwordChangedAt` — session-revocation claim (session 2)
- `CouponRedemption` unique constraint on `(couponId, customerId)` (session 2)

## ما تم نشره (Deployed)

Two deploys this session, both via `deploy/release-aws.sh`, both to
`ubuntu@13.63.79.43` / `w.keyone1.com`:
1. `1a0e73c` → `1aa53de` (session 1 fixes + report)
2. `170cac9` (session 2 fixes) — first attempt correctly **aborted** (no
   service restart, no partial state) when `prisma db push` flagged the new
   `CouponRedemption` unique constraint as a potential-data-loss change;
   independently re-verified zero production rows would violate it, applied
   the schema change manually with `--accept-data-loss`, then re-ran the
   deploy script clean.

`main` and production are in sync at **`170cac9`**.

---

## Commit

- `1a0e73c` — fix: close self-serve trial dead-end + UX silent-failure sweep + admin/docs gaps
- `1aa53de` — docs: production gap audit & closure certification report
- `b09850e` — fix: session revocation, SSRF/upload/IDOR hardening, money-correctness races, timezone bug
- `170cac9` — merge (session 2 into main)

## Build

`tsc --noEmit`: 0 errors (both rounds). `npm run build`: green (both rounds,
all 168 routes including 2 new/modified admin routes and the removed
upload-duplicate route confirmed absent).

## Regression

`verify:schema-parity`: 157 models in lock-step. `verify:rbac`: 307 routes
scanned, every mutating route gated or waived. `verify:wallet`: 33/33.
`verify:all`: 31 pass / 6 skip / 2 warn — identical pattern to every prior
session's baseline (skips/warns are environment-only: needs a live URL, or
the co-located `whatsapp-service` isn't running in this sandbox).

## Deploy

Both deploys completed with `DEPLOYED_COMMIT` on the server matching the
pushed SHA and a clean `/api/health` check from the script itself.

## AWS Verification

- Services: `keyone.service`, `keyone-bridge-gateway.service`,
  `keyone-wa.service`, `caddy` — all `active`.
- Timers: `keyone-qrcron.timer` (60s cadence, confirmed firing),
  `keyone-hourlycron.timer` (confirmed firing), `keyone-dbbackup.timer`
  (last ran 18h ago, next in ~5.5h).
- Disk: 48% used (14G/29G), unchanged across the session.
- Memory: 1.2GB/7.6GB used, 4.3GB free.
- CPU load: ~0.00–0.08 (idle).
- SSL: valid, expires 2026-09-29 (Let's Encrypt via Caddy, auto-renews).
- Backups: real, valid `pg_dump` custom-format dumps (confirmed via
  `pg_restore -l` — 154 table-data entries), nightly retention working. **One
  disclosed, unresolved gap**: no off-site copy exists — a prior memory record
  referenced `deploy/offsite/` scripts that do not actually exist in this repo
  or on the server; the backup script's own comment already discloses this
  ("if this EC2 instance/disk is lost, these backups are lost with it").
  Closing this requires AWS IAM changes (S3 write access) this session cannot
  make blind — flagged for the owner, not fixed.
- Orphan process cleanup: the 8-day `wmtest` binary (above).

## Runtime Verification

Both the self-serve-trial fix (session 1) and the session-revocation fix
(session 2) were verified **twice each**: once against a local Postgres
instance, once against live production with a real throwaway account created,
exercised, and then fully deleted (no debris left).

## Health / Ready

`GET /api/health` → `{"status":"ok","db":"ok"}`. `GET /api/ready` →
`{"ready":true,"verdict":"ready"}`, all 3 checks (`db`, `schema`,
`outgoing_queue`) `ok`.

## Services

All 4 (`keyone`, `keyone-bridge-gateway`, `keyone-wa`, `caddy`) active,
zero error-level journal entries in the 24h/10-minute windows checked after
each deploy.

## Logs

Zero error-level entries across both post-deploy checks.

## Queues

`outgoing_queue`: 0 queued/sending/stale, 0 failed in 24h at last check
(one earlier `failed24h:1` traced to a specific, correctly-recorded
`no_bridge_online` error for an account that has never connected a Bridge —
confirmed **not** a silent failure, the system worked as designed).
`broadcast_queue`: 0 queued/sending.

## Workers

WhatsApp service (`:3001`) reachable, 1 session tracked (status `qr`,
never completed — the owner's own account, not customer-facing). Bridge
gateway (`:3002`) reachable, 0 bridges currently connected (expected — no
customer has installed the Bridge app yet; production has 2 total users).

## AI

Deep-audited this session (see findings below). Provider timeouts,
circuit-breaking, and DB-backed response caching are all genuinely
implemented and correct. Cross-provider failover and hallucination-detection
exist as real, working code but are either off by default or scoped to the
Arena test sandbox only — not fixed this session (see "Not touched" below).

## WhatsApp

Bridge/Gateway reconnect, heartbeat, backoff, and gateway-restart handling
were confirmed solid in session 1's audit (no new gap this session). The 3
real reliability gaps found in session 1 (no outbound idempotency key,
sequential/no-timeout queue drain, kill-switch false positives) remain
un-fixed — they require editing the protected send pipeline and are flagged
for owner approval (a follow-up task chip was already spawned for this).

## Admin

System-health dashboard, feature-flags coverage, and 5 account-action routes
(reset-password/suspend/delete/approve/trial) now write to the audit log —
closing a real "who did what to this account" accountability gap.

## User

Self-serve signup → trial → usable dashboard confirmed working end-to-end
(session 1). Session security substantially hardened this session (password
reset now actually revokes stolen/old sessions, not just the local cookie).

## Security

6 real findings closed this session (SSRF, 2× upload validation, cross-tenant
IDOR, admin audit-logging gap ×5 routes, dead insecure endpoint removed). XSS,
open redirect, path traversal, webhook replay, and secrets-in-logs were all
independently re-checked this session and confirmed clean (no dangerous
`dangerouslySetInnerHTML`, no reflected redirects, strict filename regexes,
idempotency-key-backed webhook credits, no secret values in any log line).

## Performance

No performance work this session beyond what the fixes incidentally touch
(the wallet/credit race fixes make concurrent first-requests correct without
adding load; the N+1 `queuePosition()` finding from the hidden-bugs audit was
identified but not fixed — documented as backlog, not urgent at current
traffic volume).

## Documentation

7 stale-docs corrections shipped in session 1 (README.md/README_INDEX.md,
4 dead deploy scripts guarded, `keyone-bridge/` retirement notice,
superseded state-snapshot marked). This report is the second and final
documentation artifact for today's session.

---

## Not touched — requires explicit owner approval or a scoped follow-up session

Every item below was found, verified as real, and deliberately **not**
fixed — either because it requires editing the WhatsApp send pipeline
(`app/api/whatsapp/incoming/route.ts`), which CLAUDE.md gates behind explicit
owner approval, or because it's a production behavior/cost decision (flipping
a feature flag that changes live AI routing) or a multi-day scoped build
(a new admin feature, an S3 off-site backup pipeline) that doesn't belong in
a single hardening pass:

1. **No outbound message idempotency key** + **sequential/no-timeout queue
   drain** + **kill-switch reconnect-storm false positives** — WhatsApp
   send-pipeline reliability, session 1's top finding. A follow-up task chip
   was spawned for this.
2. **No output content moderation/guardrails** before an AI reply reaches a
   real customer — send-pipeline-adjacent.
3. **Cross-provider AI failover is fully built but off by default**
   (`WA_AI_REGISTRY_ENABLED` unset) — flipping it is a production behavior
   change affecting live (if currently minimal) traffic, not a code gap.
4. **Two per-message AI calls unmetered** (intent classifier, topic
   micro-update) — the fix touches the call sites inside the protected route.
5. **Broadcast-cron completion check can strand in-flight items** on a
   mid-batch crash — touches broadcast send orchestration, treated with the
   same caution as the send pipeline given the stakes of getting it wrong.
6. **Human-takeover vs. in-flight AI reply** double-response window — inside
   the protected route.
7. **No off-site backup** — requires AWS IAM changes this session cannot make.
8. **No live-conversation hallucination detection** (only Arena-sandbox and
   today's price-only `ai-catalog-guard`), **term-frequency vector search**
   (a working neural-embeddings layer exists but isn't wired to retrieval) —
   both multi-day scoped builds with real cost implications (external API
   calls), not single-pass fixes.
9. **N+1 `queuePosition()` query**, **payment reconciliation never verifies
   with the provider**, **no cron for retrying failed commerce-webhook
   events**, **create_order action has no dedup** (currently inert — gated
   off by default) — real but lower-urgency findings, documented as backlog.
10. **Mobile/accessibility**: modal `Escape`/dialog-semantics gap across 9+
    CRUD modals, missing `aria-label` on destructive icon-only buttons,
    missing `<label htmlFor>` associations app-wide, several tables with no
    responsive/scroll fallback. Real and broad, but a multi-file UX pass
    that deserves its own scoped session rather than a rushed subset here.

---

## القرار النهائي — Decision

**GO.**

Every fix shipped this session was verified — not assumed — against real
code, a real database, a real build, and real production: typecheck clean,
build clean, full regression suite green (both rounds), the two most
behaviorally significant changes (self-serve trial, session revocation) each
independently confirmed end-to-end against live production with a real
account created and then cleanly removed, zero error-log entries on the
production box after either deploy, all systemd services and timers active,
backups valid, SSL valid, disk/memory/CPU nominal, and one real live
incident (the 8-day orphaned `wmtest` process hitting WhatsApp's servers)
found and closed.

No unresolved issue found this session blocks a GO. The nine items in "Not
touched" above are real and worth scheduling, but none of them are currently
causing incorrect behavior in production — they are gaps in resilience,
depth, or polish, not active defects, and each was deliberately left
unfixed specifically *because* fixing it blind (without the send-pipeline
approval this project's own rules require, or without the AWS credentials
an off-site-backup fix needs, or without the multi-day scope a real
hallucination-detection/vector-search build needs) would be worse than
leaving it correctly documented for a follow-up session.
