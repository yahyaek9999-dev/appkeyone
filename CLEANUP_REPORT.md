# KEYONE Cleanup Report

Date: 2026-05-21
Scope: final cleanup and hardening before new AI/product/scaling work.

---

## Summary

KEYONE repository and production workflow were reviewed with production safety as the primary constraint.

Current baseline after cleanup:

- GitHub is canonical source of truth.
- VPS tracks `origin/main` cleanly.
- Production health check passes.
- `keydeploy` works.
- Runtime data and secrets are excluded from Git.
- Rollback/backups are preserved.

---

## Removed files

Removed from the repository:

- `.github/FUNDING.yml`
  - Reason: inherited/irrelevant upstream sponsorship metadata from the old base project.
- `deploy/tmp-saas-redeploy.ps1`
  - Reason: obsolete temporary redeploy helper replaced by `keydeploy`, `deploy-safe.ps1`, and `deploy.ps1`.

Previously cleaned from tracking in the workflow-hardening phase:

- `.next/trace`
- `saas/prisma/dev.db.backup-1778704569`
- old tracked `whatsapp-service/.wwebjs_cache/*.html`

Removed from VPS temporary directory:

- `C:\Windows\Temp\vps-health-snapshot.ps1`
- `C:\Windows\Temp\vps-reconcile-check.ps1`
- `C:\Windows\Temp\vps-safe-reconcile.ps1`

These were temporary maintenance scripts and are no longer needed on the live server.

---

## Archived files

Preserved VPS reconciliation archive:

- `C:\app\backups\reconcile-20260521-151944`

This archive contains the pre-reconciliation tracked working tree state and dirty file copies from the earlier VPS cleanup. It should be kept until the next stable maintenance window.

Preserved deployment/rollback snapshots:

- `C:\app\backups\safe-deploy-20260521-152133`
- `C:\app\backups\pre-deploy-2026-05-21_142325`
- previous `pre-deploy-*`, `manual-*`, and `quick-*` snapshots

No rollback backup was deleted.

---

## Preserved runtime files

The following were intentionally preserved and not touched destructively:

- `saas/.env` on VPS
- `whatsapp-service/.env` on VPS
- production SQLite DB files
- WhatsApp sessions/auth state
- backup snapshots under `C:\app\backups`
- NSSM service configuration
- runtime service logs
- current production build output

---

## Repository hygiene verification

Tracked-file scan confirms the only tracked env-like files are examples:

- `saas/.env.example`
- `whatsapp-service/.env.example`

No tracked files were found for:

- active `.env`
- sessions/auth runtime files
- `.next`
- `node_modules`
- `dist`/`build`
- SQLite DB files
- backups
- deploy archives
- GitHub PATs/private keys

---

## Hardening changes made

- Replaced outdated root `README.md` with KEYONE-specific production documentation.
- Added `TROUBLESHOOTING.md`.
- Added rollback simulation flags to `deploy/rollback.ps1`:
  - `-ListOnly`
  - `-DryRun`
- Improved `deploy/verify-production.ps1` output by filtering SSH transport warnings.
- Improved `deploy/deploy-safe.ps1` output by filtering SSH transport warnings.
- Added post-build cleanup of `.next/cache` after a successful remote build.
- Fixed SSE interval cleanup in `saas/app/api/realtime/stream/route.ts` to avoid idle interval retention after the max SSE lifetime.
- Updated `VPS_DEPLOY_WORKFLOW.md` to document rollback simulation.

---

## Remaining technical debt

- Root `main.py`, `requirements.txt`, `Dockerfile`, and `docker-compose.yml` appear to belong to the legacy ChatGPT/LLM helper layer. They were not removed because they may still be used for an auxiliary runtime. Review before deleting.
- Historical report files remain in the repository. They are small and useful for context, but could be moved under `project-knowledge/audits/` later.
- VPS backups are healthy but should eventually have a retention policy, for example: keep latest 7 daily, latest 4 weekly, and any manually pinned release snapshots.
- The VPS currently uses a GitHub key copied from the local machine. A dedicated GitHub deploy key for VPS is recommended long-term.
- `npm audit` still reports dependency advisories; do not run force upgrades without a separate test cycle.

---

## Cleanup result

The repository is cleaner, production runtime remains healthy, rollback paths remain intact, and no active WhatsApp auth/session files were modified.
