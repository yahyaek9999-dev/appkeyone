# KEYONE — Repository Cleanup Report

**Date:** 2026-06-02  
**Golden rule:** Nothing touching production logic, API response shapes, or business behavior was modified. Only pure deletions of dead code and consolidations of pure formatting utilities.

---

## 1. Deleted Files (~550 KB, 30+ files)

### Dead libraries (verified zero imports)
- `saas/lib/message-coalescer.ts` (~80 lines) — never imported
- `saas/lib/deferred-writes.ts` (~120 lines) — never imported
- `saas/lib/retention-engine.ts` (~376 lines) — never imported (functions live in `conversion-engine.ts`)
- `saas/lib/reply-variation.ts` (~80 lines) — never imported
- `saas/hooks/use-is-mobile.ts` (~30 lines) — never imported

### Dead scripts (one-shot, not in package.json)
- `saas/scripts/pg-migrate.ts` — one-shot Postgres migration
- `saas/scripts/recover-admin.js` — one-shot admin recovery
- `main.py` + `requirements.txt` — dead Python prototyping
- `.tmp-remote-commands.py` — stale base64 command experiment

### Stale artifacts
- `keyone_features_guide_final.html` + `_v2.html` — 165 KB combined, superseded by live app
- `.next/trace` — build artifact in wrong directory
- `__pycache__/` — compiled Python cache

### Stale reports (11 files)
All `keyone-*-report.md` files except `keyone-growth-suite-report.md` (most recent)

### Stale root docs (10 files)
Superseded by `project-knowledge/KEYONE_MASTER_STATE_EXPORT.md`:
`CLEANUP_REPORT.md`, `PRODUCTION_AUDIT_REPORT.md`, `SCALABILITY_REPORT.md`, `SCALING_OPTIMIZATIONS_REPORT.md`, `SCALING_PROGRESS.md`, `VPS_DEPLOY_WORKFLOW.md`, `VPS_HEALTH_REPORT.md`, `SAFE_GIT_WORKFLOW.md`, `INFRASTRUCTURE.md`, `DEVELOPMENT_SETUP.md`, `TROUBLESHOOTING.md`

---

## 2. Utilities Consolidated

### Created `saas/lib/format.ts`
Centralized formatting with `fmtNumber`, `fmtMoney`, `fmtDate`, `fmtDateTime`, `timeAgo`.  
Replaces **7 private `money()` functions** and **3 private `timeAgo()`/`fmtDate()` functions** across dashboard files and `lib/catalog/cards.ts`.

All callers now import from `@/lib/format`. Backward-compatible re-exports in `lib/utils.ts`.

### Removed `normalizeArabic()` wrapper
`lib/insights.ts` had `export function normalizeArabic(s) { return normalizeAr(s); }` — a pure wrapper. Replaced 7 internal calls with direct `normalizeAr()`. No external callers.

---

## 3. Dead CSS Removed
- `.mask-fade-b` from `globals.css` — never used
- `.pt-safe` from `globals.css` — never used (`.pb-safe` kept)
- `shadow-glow` noted in `tailwind.config.ts` — never used (not removed to avoid config fragility)

---

## 4. Docs Reorganized

### Archived to `project-knowledge/archive/`
- `maps/`, `flows/`, `audits/`, `prompts/` subdirectories (56 files)
- 27 root-level markdown docs (architecture, deployment, safety, etc.)

### Moved from root
- `KEYONE_FEATURES.md` → `project-knowledge/`
- `KEYONE_FULL_PRODUCT_OVERVIEW.md` → `project-knowledge/`

### Created
- `README_INDEX.md` — central doc index at repo root
- `project-knowledge/KEYONE_REPO_CLEANUP_REPORT.md` — this report
- `project-knowledge/KEYONE_REPO_STRUCTURE.md` — folder tree + onboarding

---

## 5. Security Findings (Not Changed)

| Finding | Severity | Note |
|---------|----------|------|
| QA password `123456` | Critical | Change before launch |
| `AUTH_SECRET` is dev default | Medium | `dev-secret-change-in-production...` |
| `SAAS_INTERNAL_SECRET` is dev default | Low | `dev-internal-secret-change-me` |
| `.env` in `.gitignore` | ✅ Pass | Confirmed |
| No hardcoded secrets in source | ✅ Pass | All from `process.env.*` |

---

## 6. Performance Notes (Not Changed)

- Incoming hot path: 12-16 Prisma queries per message
- Inbox: two concurrent 20s polling intervals
- All fetch calls use `cache: "no-store"` (intentional for real-time)
- ~30+ `as any` casts in Prisma queries (obscures type errors)

---

## 7. Verification

- ✅ TypeScript: `tsc --noEmit` exits cleanly (0 errors)
- ✅ Build: `npm run build` compiles successfully (all routes + pages present)
- ✅ No import paths broken (dead files had zero imports)
- ✅ All deleted files confirmed unreferenced before removal
