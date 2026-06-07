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

Pending fresh artifact build, fresh production backup, deployment, and
post-deploy verification.
