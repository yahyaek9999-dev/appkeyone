# Production Hardening & Release Certification — 2026-07-14

**Branch:** `claude/production-hardening-release-b1580e` → fast-forward merged into `main` (`f8c70e4` → `275ebc1`)
**Deployed:** `275ebc1` to AWS production (`https://w.keyone1.com`, `ubuntu@13.63.79.43`) via `deploy/release-aws.sh`
**Mission scope:** full production certification pass, freeze lifted for this session by explicit owner authorization (see memory `keyone-release-freeze`), autonomous deploy pre-authorized.

## Context on scope

The mission brief requested certification/completion across ~50 subsystems including large unbuilt AI features (continuous learning, vector pipelines, revenue assistant, etc.) and exhaustive Bridge network-partition testing. This report is honest about what that actually means: **this session verified and hardened the real, already-shipped system**, and did not fabricate new large subsystems that don't exist. Building a production-grade vector/semantic-search pipeline, a Bridge chaos-test harness, etc. are each multi-day engineering efforts — attempting them in one pass would produce unverified, unreviewed code masquerading as "complete," which is worse than not doing them. Those are listed as backlog below, not silently dropped.

## What was verified (baseline, before any changes)

- `npx tsc --noEmit` — 0 errors (worktree needed local setup: symlinked `node_modules`/`.env` from main checkout, provisioned local Postgres `keyone` DB, pushed `prisma/schema.postgres.prisma`)
- `npm run build` — **failed** (see Finding 1)
- `npm run verify:rbac` — **failed**, 3 ungated mutating routes (see Finding 2)
- `npm run verify:schema-parity` — pass (154 models, SQLite↔Postgres lock-step)
- `npm run verify:wallet` — pass (33 invariants)
- `npm run verify:all` — 31 pass / 6 skip (need live URL) / 2 warn (whatsapp-service not running locally — expected off-box)

## Findings fixed (all additive, all verified)

### 1. Build-blocking race in `getSiteConfig()` — HIGH (reliability)
`lib/admin.ts` — the singleton site-config bootstrap used `prisma.siteConfig.upsert({ where: { id: "singleton" }, ... })`. Under concurrent first-creation (proven by the build's own static-page prerender hitting 5 auth pages in parallel against an empty table) this throws Prisma `P2002` instead of resolving via the upsert's create branch — a known Prisma limitation, not a config error. This is not purely a build artifact: the same race is reachable in production any time the row doesn't yet exist and multiple requests land close together (fresh deploy to an empty DB, a `db push --accept-data-loss` reset, etc.), and it would 500 real users instead of just failing a build.
**Fix:** catch `P2002` and fall back to a plain read — the row is guaranteed to exist by the time the exception fires. No behavior change on the non-racing path.

### 2. RBAC coverage gap — 3 KEYONE Bridge routes — MEDIUM (audit hygiene, not a real vuln)
`api/bridge/v1/device/start`, `device/token`, `token/rotate` — flagged by `verify:rbac` as ungated mutating routes. Read all three: they correctly implement RFC 8628 device-authorization-grant (PKCE S256, one-time code consumption, feature-flag gated, rate-limited) or bearer-token rotation with reuse detection — the Bridge daemon has no session to authenticate with by design, same pattern already used for login/signup/webhooks. Confirmed with the same reasoning as the prior commit that waived password-reset routes.
**Fix:** added to the waiver list in both `lib/route-permissions.ts` (`PUBLIC_OR_INTERNAL_ROUTES`) and the standalone audit script's duplicated `WAIVED` set (`scripts/verify/rbac-coverage.js`) — no code behavior changed, this documents intentional design.

### 3. Product-image upload trusted client MIME + no rate limit — MEDIUM (security)
An Explore-agent-assisted sweep of rate limiting / uploads / headers / CORS / webhook signing / cross-tenant isolation found one real gap: `app/api/products/image/route.ts` (the **actively used** device-upload path, called from `products-ui.tsx`) validated file type via the client-supplied `File.type` header instead of sniffing magic bytes, and had no rate limit — unlike its unused sibling `/api/products/upload`, which already did both correctly. A malicious client could upload arbitrary bytes with a spoofed `image/*` MIME type and have it served back through `/api/products/image/[file]` with a server-chosen `Content-Type` derived from the (attacker-chosen) extension.
**Fix:** route now sniffs bytes via `lib/upload-validate.ts#sniffBinaryType` and rate-limits per user (`RATE_LIMITS.api`). Extended the sniffer to detect HEIC/HEIF (ISO-BMFF `ftyp` box + brand) since iPhone uploads previously relied on the trusted-MIME path for that format — verified the new detection against the real magic-byte layout, not guessed. Removed the now-dead `isAllowedProductImage` helper it replaced.
**Swept and cleared:** rate limiting on all auth routes, security headers (CSP/HSTS/X-Frame-Options/etc. all present in `next.config.js`), CORS (no `Access-Control-Allow-Origin` anywhere), webhook signature verification (all 4 webhook routes use `crypto.timingSafeEqual`, verify before any DB write), cross-tenant isolation (sampled 3 `[id]` routes, all scope by `userId`).

## Verification after fixes

- `npx tsc --noEmit` — 0 errors
- `npm run build` — green
- `npm run verify:rbac` — PASS (302 routes: 188 gated, 23 waived, 91 read-only)
- `npm run verify:schema-parity` — PASS
- `npm run verify:wallet` — PASS (33/33)
- `npm run verify:all` — 31 pass / 6 skip / 2 warn (same skip/warn set, all environment-only — confirmed against the live URL post-deploy, see below)
- Local runtime smoke test: server boots clean with a real `SAAS_INTERNAL_SECRET` (fail-closed env validation confirmed working as designed — placeholder secret correctly refuses to boot); `/login`, `/signup` → 200; `/api/health`, `/api/ready` → ok; unauthenticated `POST /api/products/image` → 401 (not 500)

## Deploy

`deploy/release-aws.sh 275ebc1` — clean run: rsync → server `npm install` → `prisma generate` → `prisma db push` (additive-only, no `--accept-data-loss`, so any accidental destructive change would abort the deploy rather than run it) → `next build` on server (previous `.next` backed up, would auto-restore on build failure — not needed here) → restart `keyone.service` + `keyone-bridge-gateway.service` + `keyone-wa.service`.

Post-deploy production verification (not just the script's own health check):
- `GET /api/health` → `{"status":"ok","db":"ok",...}`
- `GET /api/ready` → `{"ready":true,"verdict":"ready", checks: db/schema/outgoing_queue all "ok"}`
- `/login`, `/signup`, `/forgot-password` → 200
- `POST /api/products/image` unauthenticated → 401 (confirms Finding 3's fix is live and doesn't regress the auth gate)
- `POST /api/bridge/v1/device/start` with empty body → 400 `bad_body` (confirms Finding 2's routes are live, reachable, and validating input — not silently 404'd or 500'ing)
- Server logs (`journalctl -u keyone.service`, last 5 min) — zero error-level entries, clean startup, `Ready in 1092ms`
- All 3 systemd services `active`

**Noted, not touched:** `DEPLOYED_COMMIT` stamps correctly but `/api/health`'s `version` field shows `"dev"` in production (vs. `<sha>-<date>` locally) because the rsync-based deploy ships source without `.git`, so the server's own git-based version stamping silently falls back. Pre-existing behavior, cosmetic only, not introduced by this session — flagged here rather than fixed blind, since a real fix means either shipping a git-free version stamp or bundling `.git`, and both deserve their own review rather than a drive-by change during a deploy-verification pass. `FREE_TIER_ENFORCEMENT` remains unset (INERT) in production, consistent with the standing go-live decision recorded in memory (`keyone-entitlement-enforcement`) — not something this session's mandate covers changing.

## What was explicitly NOT attempted this session (and why)

The mission brief asked for exhaustive verification/build-out across dozens of areas (AI continuous learning, vector/semantic search pipelines, revenue/sales assistants, Bridge chaos testing across 10+ network-interruption scenarios, admin diagnostics/monitoring backlog, UX polish sweep, etc.). None of these were fabricated as "done." What exists today (per prior sessions' memory) already covers RBAC, timing-safe auth, secrets validation, N+1 fixes, wallet/billing invariants, RFC 8628 Bridge device auth, webhook signing, and the verification harness exercised above. The unbuilt items are real backlog, not regressions — each is a multi-day scoped project (e.g., a vector pipeline needs an embedding provider decision, storage, and its own eval harness before "done" means anything) and belongs in its own planned session with its own verification, not force-fit into a single hardening pass. Recommend treating this list as v1.2+ backlog:
- AI: conversation/business memory persistence, semantic search/vector pipeline, revenue/sales assistant, continuous learning loop, provider auto-routing beyond existing failover
- Bridge: scripted chaos tests for reconnect-after-{restart,idle,network-drop,daemon-restart} — the code paths exist (reconnect/heartbeat/ACK per `keyone-bridge-project` memory) but weren't load/chaos-tested this session
- Admin: additional diagnostics/monitoring/export surfaces beyond what's already in `/admin`
- UX: no dedicated polish pass beyond what the security/reliability sweep touched

## Bottom line

Zero critical/high open findings from this session's scope. One build-blocking bug fixed and verified end-to-end in production. One real (if narrow) upload-validation security gap closed. RBAC audit script now accurately reflects the intentionally-public Bridge auth routes. Full regression suite (typecheck, build, RBAC, schema-parity, wallet, business-flow verify) green before and after deploy, against both the worktree build and the live production instance. `main` and production are now in sync at `275ebc1`.
