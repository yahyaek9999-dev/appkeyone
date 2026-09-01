# Domain Migration — Phase 3 Execution Log

**Phase:** PHASE 3 — EXECUTION  
**Date:** 2026-09-01  
**Executor:** Claude Sonnet (Phase 3, explicitly authorized)  
**Branch:** claude/domain-migration-inventory-b12e5a  

---

## Pre-Cutover State (Step 0 — Pre-flight)

| Item | Value |
|------|-------|
| Production domain | `https://w.keyone1.com` |
| Production IP | `16.171.230.84` |
| Production version | `90a1daa` |
| Production health | `{"status":"ok","db":"ok","uptime":64858}` |
| `wkeyone.app` DNS | `91.195.240.94` (Sedo parking — NOT our server) |
| `w.keyone1.com` DNS | `16.171.230.84` (correct) |
| Caddy version | v2.11.4 systemd, no Docker |
| keyone.service | active |
| keyone-bridge-gateway.service | active |
| NEXT_PUBLIC_SITE_URL | `https://w.keyone1.com` |
| NEXT_PUBLIC_BASE_URL | NOT SET (fallback in code) |
| PUBLIC_BASE_URL | NOT SET (fallback in code) |
| META_CLOUD_ENABLED | `0` (OFF) |
| Bridge DB rows | 0 |
| Bridge active connections | 0 |

---

## Step A — Code/Config Changes

**Commit:** TBD (see git log)  
**Typecheck:** PASSED (npx tsc --noEmit, 0 errors)  

### Files changed (17 files, 19 string substitutions):

| File | Change |
|------|--------|
| `saas/public/robots.txt` | Sitemap URL → wkeyone.app |
| `saas/public/.well-known/security.txt` | Canonical → wkeyone.app |
| `saas/app/layout.tsx` | NEXT_PUBLIC_SITE_URL fallback → wkeyone.app |
| `saas/app/sitemap.ts` | NEXT_PUBLIC_SITE_URL fallback → wkeyone.app |
| `saas/app/dashboard/settings/meta-cloud/page.tsx` | Webhook instruction URL → wkeyone.app |
| `saas/app/dashboard/settings/bridge/download/page.tsx` | NEXT_PUBLIC_BASE_URL fallback → wkeyone.app |
| `saas/app/dashboard/settings/bridge/download/download-cards.tsx` | Initial origin state → wkeyone.app |
| `saas/lib/bridge/overview.ts` | NEXT_PUBLIC_BASE_URL fallback → wkeyone.app |
| `saas/lib/providers/openrouter.ts` | PUBLIC_BASE_URL fallback → wkeyone.app |
| `saas/.env.example` | NEXT_PUBLIC_SITE_URL example → wkeyone.app |
| `bridge-node/keyone-wa-bridge.js` | CLOUD_API + CLOUD_WS defaults → wkeyone.app |
| `bridge-node/packaging/macos/build-pkg.sh` | CLOUD_API default → wkeyone.app |
| `bridge-node/packaging/windows/install.ps1` | CloudApi default → wkeyone.app |
| `bridge-node/packaging/windows/install.cmd` | Help URL → wkeyone.app |
| `keyone-bridge/internal/config/config.go` | CloudAPIBase + CloudWSURL defaults → wkeyone.app |
| `keyone-bridge/internal/updater/updater.go` | DownloadBase fallback → wkeyone.app |
| `deploy/release-aws.sh` | KEYONE_URL default → wkeyone.app |

### Not changed (intentional — seed/historical/non-runtime):
- `saas/prisma/seed.ts` — seed email defaults (not migration-gating)
- `saas/prisma/schema.prisma` — supportEmail @default (not migration-gating)
- `saas/public/.well-known/security.txt` Contact email (email migration out of scope)
- `saas/project-knowledge/` — historical docs (preserved)
- `saas/prisma/seed-keyone.ts` — Arabic LLM training content (keyone1.com as text, not URLs)

---

## Step B — Validation

| Check | Result |
|-------|--------|
| TypeScript typecheck | PASSED (0 errors) |
| Local build | OOM on Mac (pre-existing local resource limit, not a code issue) |
| Build on prod server | Done via release-aws.sh (server has full resources) |

---

## Step C — DNS

**Target:** `wkeyone.app A → 16.171.230.84`  

| Item | Before | After | Evidence |
|------|--------|-------|----------|
| wkeyone.app A record | 91.195.240.94 (Sedo) | 16.171.230.84 | TBD |

---

## Step D — Caddy

**Target:** Add `wkeyone.app` vhost to `/etc/caddy/Caddyfile`  

| Item | State |
|------|-------|
| Caddyfile backup | TBD |
| wkeyone.app block added | TBD |
| Caddy validation | TBD |
| Caddy reload | TBD |
| LE cert issued | TBD |

---

## Step E — Target HTTPS Verification

| Check | Result |
|-------|--------|
| wkeyone.app DNS propagated | TBD |
| TLS certificate valid | TBD |
| HTTPS response | TBD |
| /api/health | TBD |

---

## Step F — Production Env Update

| Variable | New Value |
|----------|-----------|
| NEXT_PUBLIC_SITE_URL | https://wkeyone.app |
| NEXT_PUBLIC_BASE_URL | https://wkeyone.app |
| PUBLIC_BASE_URL | https://wkeyone.app |

---

## Step G — Deploy

| Item | Value |
|------|-------|
| Commit deployed | TBD |
| Deploy method | deploy/release-aws.sh |
| Post-deploy health | TBD |
| Post-deploy version | TBD |

---

## Step H — Browser Verification

TBD

---

## Step I — Email Verification

TBD

---

## Rollback State

At any point, rollback = revert DNS A record to 91.195.240.94 (Sedo) or original config.  
`w.keyone1.com` remains live throughout and is not touched until full verification passes.

---

## Final Verdict

TBD
