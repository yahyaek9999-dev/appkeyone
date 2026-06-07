# KEYONE Pricing Monetization Deployment Report — 2026-06-07

## Scope

Continue deployment of `feat/pricing-monetization-suite` after the production
database `db push` conflict was explicitly approved by the owner.

## Pre-deploy fixes applied

- Added RBAC enforcement to the new premium module API mutations:
  - Flow Builder
  - Branches
  - Approval Workflows
  - White Label
  - Upgrade Requests
- Updated RBAC route coverage so `apiGate()` is recognized as an auth gate.
- Added the five additive Phase 3 models to `schema.postgres.prisma` so the
  dormant PostgreSQL schema remains in parity with the production SQLite schema.
- Hardened `deploy/release.sh` for the Windows VPS by installing
  `prisma@5.22.0` transiently when the pruned artifact lacks the Prisma CLI.

## Verification

- Typecheck: `./node_modules/.bin/tsc --noEmit` — PASS
- Build: `npm run build` — PASS
- Regression: `npm run verify:rbac` — PASS
- Regression: `npm run verify:schema-parity` — PASS
- Deploy script syntax: `bash -n deploy/release.sh deploy/build.sh deploy.sh` — PASS

## Database note

The owner approved a full deploy including production `prisma db push`. The
Phase 3 schema changes are additive tables only, but the existing deploy command
still uses `--accept-data-loss`; a fresh production backup must be taken
immediately before deploy.

## Deploy status

Deployed via fast Git SSH + VPS deploy path.

- Final deployed commit: `75e3212`
- Production DB sync: PASS (`prisma db push --skip-generate`; database already
  in sync on the final run)
- VPS `npm run verify:all`: PASS (`41` pass, `6` skip, `0` fail)
- Service restart: PASS (`mse-saas` running)
- WhatsApp service restart: SKIPPED intentionally to preserve live sessions
- Post-deploy health check: PASS
- Rollback snapshot: `C:\app\backups\pre-deploy-2026-06-07_002505`

## Follow-up risks

- VPS `npm ci` reports `next@14.2.18` has a security vulnerability and
  `npm audit` reports `2` vulnerabilities (`1` moderate, `1` critical). Do not
  fix these with `npm audit fix --force` inside a deploy window; schedule a
  controlled dependency upgrade.
- WhatsApp session backup completed with robocopy exit `9` warnings but
  preserved live session files in place. The deploy did not restart `mse-wa`.
