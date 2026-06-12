# GITHUB_COMPLETENESS_AUDIT — KEYONE

**Date:** 2026-06-12
**Question:** Does GitHub hold everything needed to rebuild the platform, or does critical material exist only on the server / owner's machine?
**Method:** `git ls-files` enumeration + `.gitignore` review + cross-reference against deploy scripts, Dockerfiles, and runtime references.

---

## Verdict

**The application is complete in Git. The platform is not.**

GitHub contains 100% of the **code** required to rebuild the SaaS app, the WhatsApp microservice, the deploy/backup/rollback tooling, the Prisma schema, and the CI/CD pipeline. It deliberately and correctly excludes **secrets, the database, and session state**. However, it is **missing one piece of production code that is not a secret**: the in-house CloakBrowser LLM proxy (`main.py`). That is the single material completeness defect.

---

## What IS in GitHub (verified present)

| Item | Path | Status |
|---|---|---|
| SaaS app (all source) | `saas/` (546 files) | ✅ complete |
| WhatsApp microservice | `whatsapp-service/src/` | ✅ complete |
| Prisma schema (SQLite + Postgres) | `saas/prisma/schema.prisma`, `schema.postgres.prisma` | ✅ complete |
| Seeds | `saas/prisma/seed.ts`, `seed-plans.ts`, `seed-keyone.ts` | ✅ complete |
| Lockfiles | `saas/package-lock.json`, `whatsapp-service/package-lock.json` | ✅ complete (reproducible installs) |
| Deploy scripts (bash) | `deploy/release.sh`, `release-git.sh`, `rollback-release.sh`, `build.sh`, `validate-env.sh`, `vps-docker-setup.sh` | ✅ complete |
| Deploy scripts (PowerShell) | `deploy/deploy*.ps1`, `rollback.ps1`, `setup-vps.ps1`, `start-services.ps1`, `health-*.ps1`, `smoke-test.ps1`, `verify-production.ps1` | ✅ complete |
| Backup scripts | `deploy/backup-all.ps1`, `backup-db.ps1`, `verify-backup.ps1`, `install-backup-task.ps1` | ✅ complete |
| **Scheduled-job runners** | `deploy/run-broadcasts.ps1`, `run-followup.ps1`, `run-automations.ps1`, `run-abandoned-cart.ps1` + their `install-*-task.ps1` | ✅ complete *(present in Git — earlier reports calling these "VPS-only" were wrong)* |
| Reverse proxy config | `deploy/Caddyfile` | ✅ complete |
| CI/CD | `.github/workflows/deploy.yml` | ✅ complete |
| Docker (Linux target) | `docker-compose.production.yml`, `saas/Dockerfile`, `saas/.dockerignore` | ✅ present in Git root *(earlier report calling it "missing" was wrong — it exists)* |
| Env templates | `saas/.env.example`, `whatsapp-service/.env.example`, `deploy/env.{saas,whatsapp,llm}.example` | ✅ complete |
| Runbooks / docs | `deploy/RUNBOOK.md`, `deploy/README.md`, `project-knowledge/*` | ✅ complete |

---

## Missing items (production material NOT in GitHub)

| # | Missing item | Why it matters | Risk | Required action |
|---|---|---|---|---|
| **M1** | **CloakBrowser LLM proxy source (`main.py` + supporting modules)** — the root `Dockerfile` runs `CMD ["python","main.py"]` and `requirements.txt` lists FastAPI/Playwright, but **no `.py` file is tracked anywhere in the repo** (`git ls-files '*.py'` returns nothing). Source is believed to live at owner's `~/Desktop/mse_ai_api-main`. | The default AI engine for every tenant. Without it, AI replies fail unless an external provider is configured per tenant. | **CRITICAL** | Commit the `mse_ai_api` source to a private repo (or a `llm-proxy/` folder here). Until then, treat the owner's local copy as the only source and back it up off-site. |
| **M2** | **Production database** (`saas.db`) | All tenants, bots, conversations, orders, subscriptions, encrypted keys | **CRITICAL** | Correctly gitignored. Must be covered by an **off-site** backup (today it is VPS-local only). See [BACKUP_POLICY](BACKUP_POLICY.md). |
| **M3** | **Production secrets** (`saas/.env`, `whatsapp-service/.env`, root `.env`) — especially `AUTH_SECRET` | `AUTH_SECRET` decrypts all tenant provider keys + signs sessions. Irreplaceable. | **CRITICAL** | Correctly gitignored. Store in a password manager / secrets vault held **off the VPS**. |
| **M4** | **WhatsApp session auth** (`SESSIONS_DIR`, `.wwebjs_auth/`) | Avoids every tenant re-scanning QR | **MEDIUM** | Correctly gitignored. Include in off-site backup, or accept QR re-scan on recovery. |
| **M5** | **DNS zone / registrar details** | Needed to re-point `app.keyone1.com` to a new server | **HIGH** | Document the registrar, zone host, and login in the secrets vault. Not a code artifact but a recovery dependency. |
| **M6** | **VPS provisioning specifics not in scripts** — actual live NSSM service names, the real `SESSIONS_DIR`/`DATABASE_URL` paths in use, firewall rules | Scripts show two naming conventions and two DB paths | **MEDIUM** | Capture a one-page "live config snapshot" (`nssm list`, actual `.env` paths) and store it with the secrets backup. |

---

## Items correctly excluded (no action — this is desired)

These are **supposed** to be absent from Git and their exclusion is correct hygiene, not a defect:

- `.env`, `.env.*` (real secrets) — only `*.example` tracked.
- `*.db`, `*.sqlite`, `*.db-wal`, `*.db-shm` (databases).
- `sessions/`, `.wwebjs_auth/`, `.wwebjs_cache/`, `.puppeteer-cache/`, `chrome-profile-*` (session state).
- `node_modules/`, `.next/`, `dist/`, `build/` (build outputs — rebuilt on deploy).
- `backups/`, `state/`, `*.log`.
- VPS-only operational artifacts (`/*.tar.gz`, `/diag*.ps1`, `/fix-*.ps1`, etc.).

The `.gitignore` is well-constructed and explicitly keeps `*.example` files tracked.

---

## "Does any production code exist only on the server?" — itemized

| Question | Answer | Evidence |
|---|---|---|
| Production app code only on server? | **No** | All `saas/` + `whatsapp-service/` source is tracked |
| Deploy scripts only on server? | **No** | All `deploy/*.sh`, `*.ps1` tracked, including `run-*.ps1` runners |
| Configuration only on server? | **Partially** | Config *templates* are tracked; real `.env` values are server-only (by design, but must be backed up off-site — M3) |
| Required non-secret assets missing? | **Yes — one** | The CloakBrowser LLM proxy `main.py` (M1) |
| CI/CD only on server? | **No** | `.github/workflows/deploy.yml` tracked |
| Reverse-proxy config only on server? | **No** | `deploy/Caddyfile` tracked (live copy at `C:\Caddy\Caddyfile` is a deployed copy) |

---

## Recommended remediation (priority order)

1. **M1 — Commit the LLM proxy source.** Create a private repo `keyone-llm-proxy` (or a `llm-proxy/` directory) containing the `mse_ai_api` code so the AI engine is reproducible from version control. This is the only *code* gap.
2. **M3/M2/M4 — Establish off-site backups** of DB + secrets + sessions (see [BACKUP_POLICY](BACKUP_POLICY.md)). Today everything is VPS-local; the VPS is a single point of failure for both production **and** its backups.
3. **M5 — Record DNS/registrar access** in the secrets vault.
4. **M6 — Capture a live-config snapshot** (service names, paths) and version it as a recovery aid.
5. Reconcile the two service-naming conventions and the two DB paths so scripts and reality agree.

After steps 1–3, GitHub + off-site backups become a **complete** recovery source. See [FINAL_READINESS_REPORT](FINAL_READINESS_REPORT.md).
