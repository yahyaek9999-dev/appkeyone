# Deployment Checklist — Next.js 15.5.19 upgrade

**Branch:** `claude/eloquent-almeida-2c5b8c` · **Commit:** `0aa7b1f` · **Target:** `main` → prod `https://app.keyone1.com`
**Pipeline:** `.github/workflows/deploy.yml` (auto-runs on push to `main`)
**Baseline prod SHA (before this deploy):** `d4fba23-20260610` — the success gate is prod flipping to the new merge SHA.

---

## A. Pre-merge — DONE (verified locally on the branch)
- [x] `tsc --noEmit` — 0 errors
- [x] `npm run build` (Next 15) — exit 0, **38/38** pages prerendered, type-validated against generated PageProps
- [x] `rbac-coverage.js` — PASS (136 routes, every mutating route gated)
- [x] `verify/run.js all` — 37 pass / 7 skip / 2 warn / 1 fail (the fail = `reliability:wa-service`, environmental — WA microservice not running in dev; not a regression)
- [x] E2E smoke (real HTTP) — login/cookies, authed dashboard, async route params, logout all green; zero "should be awaited" runtime warnings
- [x] `npm audit --audit-level=high` — **0 HIGH** (was: multiple unpatchable next 14.x HIGH CVEs)
- [x] `package-lock.json` synced to `next@15.5.19` (CI `npm ci` will succeed)
- [x] WhatsApp **send pipeline semantics untouched** (only framework params-await in `inbox/.../send/route.ts`)

## B. Pre-deploy env prereqs on the VPS (confirm BEFORE merge)
- [ ] **`SAAS_INTERNAL_SECRET`** is a real rotated value, NOT the public default `dev-internal-secret-change-me` — otherwise `validateEnv()` **refuses to boot in production** (see `keyone-security-hardening`). This is the single most likely cause of a failed restart.
- [ ] **`AUTH_SECRET`** ≥ 32 chars set in prod env (fail-closed otherwise).
- [ ] GH Actions repo **secrets** present: `VPS_SSH_KEY`, `VPS_HOST`, `VPS_PORT`, `VPS_APP_DIR`, `VPS_RELEASES_DIR`, `VPS_SERVICE_NAME`, `HEALTH_CHECK_URL`.
- [ ] VPS runtime is **Node 20** (CI builds on node 20 — keep major parity; note the Windows Prisma-engine caveat in `keyone-deploy-windows-vps`. This pipeline ships `node_modules` built on ubuntu; if the service fails to start with a Prisma engine error, that is the known gotcha — fall back to a server-side `npm ci` + `prisma generate`).

## C. Merge → what the pipeline does
1. **build** job (ubuntu, node 20): `npm ci` → `prisma generate` → `tsc --noEmit` → `npm run build` → `npm prune --production` → package artifact `keyone-<shortSHA>-<ts>.tar.gz` (HASH = `git rev-parse --short HEAD` of the merge commit).
2. **deploy** job (`environment: production`, needs build): scp artifact to VPS → `nssm stop` → back up current `.next` to `releases/previous` → copy new release → `prisma generate` → `nssm start` → assert `SERVICE_RUNNING`.
3. **Health check** step: `curl -sf https://app.keyone1.com/api/ready`.

> `deploy` needs `build`, so a failing `tsc`/`build` blocks the deploy. The artifact retains the last 3 releases + a `previous` backup on the VPS for rollback.

## D. Watch the run
- [ ] GH Actions run for the merge commit — **build** green, **deploy** green, **Health check** prints `✅ Health OK`.

## E. Post-deploy verification — **THE SUCCESS GATE**
- [ ] `GET https://app.keyone1.com/api/health` → `status:"ok"`, `db:"ok"`
- [ ] **`version` == `<merge-short-SHA>-<YYYYMMDD>`** (must differ from baseline `d4fba23-20260610`)
- [ ] `GET /api/ready` → 200
- [ ] Smoke on prod: `GET /` (200), `GET /login` (200), `GET /pricing?lang=ar` (200, async searchParams), one authed dynamic `/api/<x>/[id]` (no 500)
- [ ] No new spike in Sentry for RSC `params`/`cookies` errors

## F. Rollback (if health degrades or `version` never flips)
- On the VPS: `deploy/rollback-release.sh` (bash) **or** `deploy\rollback.ps1` / `deploy.ps1 --rollback` (PowerShell) — restores the `releases/previous` `.next`, then `nssm restart mse-saas`.
- Confirm `/api/health` `version` reverts to `d4fba23-20260610` and `status:"ok"`.
- Then investigate from CI build/deploy logs + Sentry before re-attempting.

## G. Notes / non-blocking follow-ups
- **Next 15 caching defaults** changed (uncached `fetch`/GET route handlers by default; client router cache `staleTimes=0`). The pages touched here are already dynamic (cookies/searchParams), so no behavior change expected — monitor briefly.
- **postcss** moderate advisory (GHSA-qx2v-qp2m-jg93) is bundled in next; clears on a future next patch — do **NOT** `npm audit fix --force` (downgrades next to 9.x).
- **Sentry** `autoInstrumentServerFunctions` deprecation is non-fatal — migrate to `webpack.autoInstrumentServerFunctions` on the next `@sentry/nextjs` bump.
</content>
