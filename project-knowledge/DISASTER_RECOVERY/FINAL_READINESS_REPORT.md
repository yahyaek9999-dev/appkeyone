# FINAL_READINESS_REPORT — KEYONE Disaster Recovery & Infrastructure Independence

**Date:** 2026-06-12
**Type:** Read-only audit. No production changes, no deploy, no merge.
**Companion docs:** [PROJECT_EXPORT_AUDIT](PROJECT_EXPORT_AUDIT.md) · [GITHUB_COMPLETENESS_AUDIT](GITHUB_COMPLETENESS_AUDIT.md) · [ENVIRONMENT_AUDIT](ENVIRONMENT_AUDIT.md) · [DATABASE_MIGRATION_AUDIT](DATABASE_MIGRATION_AUDIT.md) · [WHATSAPP_RECOVERY_AUDIT](WHATSAPP_RECOVERY_AUDIT.md) · [DISASTER_RECOVERY](DISASTER_RECOVERY.md) · [UBUNTU_MIGRATION_PLAN](UBUNTU_MIGRATION_PLAN.md) · [BACKUP_POLICY](BACKUP_POLICY.md)

---

## Scorecard

| Dimension | Score | Rationale |
|---|---:|---|
| **Repository portability** | **85 / 100** | All app code, deploy scripts, both Prisma schemas, lockfiles, env templates, and CI/CD are in Git and reproducible. −15 only because the CloakBrowser LLM proxy source (`main.py`) is not tracked. |
| **Disaster recovery readiness** | **48 / 100** | Rollback/backup/verify scripts exist and scenarios are now documented, but recovery depends on artifacts (DB, secrets, LLM source) that have **no guaranteed off-site copy**. No DR drill has been performed. RPO ~24h. |
| **Migration readiness** | **70 / 100** | Postgres schema + dual-DB code + Docker compose + Ubuntu setup script are all prepared. −30 for unresolved path/port/host drift, Chromium dependency setup, and the LLM-source dependency. |
| **Backup readiness** | **42 / 100** | Solid daily DB backup + verification, but everything writes to the **same VPS disk** as production. No off-site, no PITR, sessions only captured at deploy time. |
| **Infrastructure independence** | **35 / 100** | Entire platform on one Windows VPS / one IP, with an in-house LLM engine that isn't in version control. No HA, no redundancy, single point of failure for both prod and its backups. |

### Overall: **52 / 100** — "Recoverable in principle, fragile in practice."

The **codebase** is in good shape (portable, reproducible). The **operational posture** is the weak point: the things you can't recompile (data, secrets, the AI engine) are not reliably stored anywhere except the one server that the disaster scenario assumes is gone.

---

## Critical blockers (fix before claiming DR-ready)

| # | Blocker | Impact if VPS lost today | Doc |
|---|---|---|---|
| **B1** | **No off-site backup** — DB, sessions, and `.env` exist only on `C:\app\backups` on the production disk | The backups die with the server. Total data + secrets loss. | [BACKUP_POLICY](BACKUP_POLICY.md) |
| **B2** | **`AUTH_SECRET` (and full `.env`) not stored off the VPS** | Even with a DB copy, all encrypted tenant provider keys + Meta tokens are unreadable; all sessions invalid | [ENVIRONMENT_AUDIT](ENVIRONMENT_AUDIT.md) §4 |
| **B3** | **CloakBrowser LLM proxy `main.py` not in Git** | The default AI engine for every tenant cannot be rebuilt from source control | [GITHUB_COMPLETENESS_AUDIT](GITHUB_COMPLETENESS_AUDIT.md) M1 |

---

## High risks

| # | Risk | Note |
|---|---|---|
| H1 | **Single point of failure** — one Windows VPS, one IP `217.154.163.16` | No failover; any host/network/provider incident = full outage |
| H2 | **RPO ~24h** | Daily-only DB backup; up to a day of orders/conversations lost on corruption |
| H3 | **No tested DR drill** | Recovery procedure (this package) has never been rehearsed end-to-end |
| H4 | **8–12 min deploy outage** | Every Windows deploy stops the service during `npm ci`+`build` (502 window) |
| H5 | **Rollback snapshot not guaranteed** | `C:\app\releases\previous` was absent on 2026-06-05 — rollback may have nothing to restore |

---

## Medium risks

| # | Risk | Note |
|---|---|---|
| M1 | **Host/domain drift** — `app.keyone1.com` vs `k1wb.app.keyone1.com` | Caddyfile serves only the latter; health checks use the former |
| M2 | **Port drift** — wa-service 3001 vs 7799 | Inconsistent across templates; reconcile before migration |
| M3 | **Service-name drift** — `mse-*` vs `KEYONE-*`/`mse-fashion-llm` | Two conventions in scripts; confirm live names |
| M4 | **DB path ambiguity** — `C:/KEYONE/data/saas.db` vs `C:\app\saas\prisma\prod.db` | Backup vs runtime configs disagree |
| M5 | **Stale env template names** — `SHARED_SECRET`, `SAAS_WEBHOOK_URL`, `POSTGRES_DIRECT_URL` | Copy-paste from templates yields a broken config |
| M6 | **`WHATSAPP_SHARED_SECRET` still has a dev fallback** | Warns but doesn't block boot; should be promoted to required |
| M7 | **No `prisma/migrations/` history** | Schema reproduced via `db push`; no versioned migration trail |
| M8 | **DNS registrar undocumented** | Re-pointing the domain requires access not recorded anywhere |

---

## Recommended actions (priority order)

1. **[B1/B2] Stand up encrypted off-site backups** of DB + WhatsApp sessions + `.env` (nightly `rclone` to B2/R2/S3, age/gpg encrypted). *Single highest-impact action.* → [BACKUP_POLICY](BACKUP_POLICY.md) §5
2. **[B2] Put all secrets + DNS access in an off-VPS vault** (password manager). Verify a tenant key decrypts with the stored `AUTH_SECRET`.
3. **[B3] Commit the CloakBrowser LLM proxy source** to a private repo (or `llm-proxy/` here) so the AI engine is version-controlled.
4. **[H2] Increase DB backup frequency to hourly** until Postgres+PITR lands (RPO 24h → 1h).
5. **[H3] Run a full DR rehearsal** on a throwaway Ubuntu VPS using [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A; time it, fix gaps.
6. **[M1–M5] Reconcile drift** — pick canonical host, port, service names, DB path; fix stale template names.
7. **[H1/H4] Execute the Ubuntu migration** ([UBUNTU_MIGRATION_PLAN](UBUNTU_MIGRATION_PLAN.md)) to escape Windows-deploy outages and enable the Docker/Watchtower ~30s deploy model.
8. **[M6] Promote `WHATSAPP_SHARED_SECRET` to required** once confirmed set in prod.

Completing 1–3 raises the overall score from ~52 to ~80 and changes the verdict below from NO to YES.

---

## FINAL VERDICT

> **Question:** *Assume the current Windows VPS disappears permanently tomorrow. Can KEYONE be restored from GitHub and local backups alone?*

### Answer: **NO — not reliably, as currently operated.**

**Conditional YES** is achievable, but only after the three critical blockers are closed.

### Evidence

**What GitHub alone gives you (verified present):**
- ✅ The complete SaaS app, WhatsApp microservice, deploy/backup/rollback scripts, both Prisma schemas, lockfiles, Caddy config, and CI/CD pipeline. You can stand up the **application shell** on a fresh Ubuntu box in 30–90 minutes.

**What GitHub does NOT contain (verified absent — these are why the answer is NO):**
- ❌ **The production database** (`saas.db`) — gitignored. Without a copy, every tenant, bot, conversation, order, and subscription is gone.
- ❌ **`AUTH_SECRET` and the rest of `.env`** — gitignored. Without the exact `AUTH_SECRET`, even a restored DB has unreadable encrypted provider keys and Meta tokens, and all sessions are invalid.
- ❌ **The CloakBrowser LLM proxy source** (`main.py`) — not tracked anywhere in the repo. Without it, the default AI engine cannot be rebuilt.
- ❌ **WhatsApp session auth** — gitignored (recoverable via QR re-scan, so not fatal).

**Why "local backups alone" does not currently close the gap:**
The automated backup system writes **only to `C:\app\backups` on the production VPS disk**. There is **no scheduled off-site copy**. So "the VPS disappears permanently" takes the database, the secrets, and the backups **with it**. Recovery would then depend entirely on whether the **owner personally happens to be holding**, off the VPS: (a) a recent DB export, (b) the `AUTH_SECRET`/`.env`, and (c) the `mse_ai_api` LLM source. The repo and the LLM source do appear to exist on the owner's local machine (`~/Desktop/appkeyone`, `~/Desktop/mse_ai_api-main`), but **a current production DB snapshot and the live secrets are not guaranteed to exist off-server by any policy or automation** — so restoration cannot be promised.

### Bottom line
- **From GitHub only:** NO — you recover the app, not the business (no data, no secrets, no AI engine).
- **From GitHub + a complete, current off-VPS backup set (DB + `AUTH_SECRET`/`.env` + LLM source):** **YES** — fully restorable to a new Ubuntu VPS in under ~90 minutes via [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A.
- **As operated today (backups VPS-local, secrets VPS-only, LLM source un-versioned):** **NO** — implement recommended actions 1–3 to make the answer a durable YES.
