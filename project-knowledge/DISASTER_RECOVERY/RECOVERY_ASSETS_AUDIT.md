# RECOVERY_ASSETS_AUDIT — KEYONE EOL Extraction

**Date:** 2026-06-12 · Verifies existence + location of every recovery asset, classified Present/Missing × Critical/Non-critical.
**Verification basis:** local Mac state (directly checked) + GitHub push state (checked) + VPS layout (from deploy scripts; live presence to be confirmed at extraction step 0).

---

## Legend
- **Present-Git** ✅ = in GitHub (survives Mac AND VPS loss)
- **Present-Mac** 💻 = on the owner's Mac (survives VPS loss; depends on Mac)
- **Present-VPS-only** 🔴 = exists only on the VPS (lost if server dies before extraction)
- **Missing** ❌ = not found anywhere

---

## 1. Asset-by-asset verification

| Asset | Where verified | Status | Class |
|---|---|---|---|
| **Source code (saas + whatsapp-service)** | GitHub `origin/main` @ `cbb7eda` == local main | ✅ Present-Git | Critical → **safe** |
| **Git repository (`appkeyone`)** | GitHub + Mac `~/Desktop/appkeyone` + VPS `C:\app` | ✅ Present-Git (3 copies) | Critical → **safe** |
| **Local-only branch `claude/hopeful-kowalevski-90a1e7`** | Mac only (3 commits, UI work) | 💻 Present-Mac, **not on GitHub** | Non-critical → **push to preserve** |
| **Working-tree docs** (`UIUX_POLISH_PASS_2026_06_10.md`, this DR package, `deploy/offsite/`) | Mac working tree, uncommitted | 💻 Present-Mac, not in Git | Non-critical → **commit/push** |
| **Prisma schemas** (`schema.prisma`, `schema.postgres.prisma`, seeds) | GitHub | ✅ Present-Git | Critical → **safe** |
| **Production database** (`saas.db`) | VPS `C:\KEYONE\data\` / `C:\app\saas\prisma\` — **NOT found on Mac** (only `dev.db`) | 🔴 Present-VPS-only | **CRITICAL → MUST EXTRACT** |
| **DB local backups** (`prod-*.db.gz`) | VPS `C:\app\backups\` only | 🔴 Present-VPS-only | Critical → **extract** |
| **WhatsApp sessions** | VPS `C:\KEYONE\data\wa-sessions\` only | 🔴 Present-VPS-only | Critical → **extract** (or QR re-scan) |
| **SSL certificates** | VPS Caddy data dir | 🔴 Present-VPS-only | Non-critical → **auto-reissue** (extract optional) |
| **Environment files (PROD)** — `saas/.env` (AUTH_SECRET), `whatsapp-service/.env`, root `.env` | VPS `C:\app\...` | 🔴 Present-VPS-only | **CRITICAL → MUST EXTRACT** |
| **Env files (stale/local)** | Mac: `appkeyone/saas/.env`, `mse_ai_api-main/saas/.env` (May 12) | 💻 Present-Mac (may not match prod) | use only to recover an un-rotated `AUTH_SECRET` |
| **DNS references** | `app.keyone1.com` / `k1wb.app.keyone1.com` in repo; A→`217.154.163.16` | ✅ documented / 🔴 registrar access | **registrar login must be in vault** |
| **GitHub Actions config** | GitHub `.github/workflows/deploy.yml` (repo) + Actions **secrets** (VPS_SSH_KEY, VPS_HOST…) | ✅ workflow / 🔴 secrets in GitHub settings | workflow safe; secrets re-settable |
| **AI engine source (`mse_ai_api` / `main.py`)** | Mac `~/Desktop/mse_ai_api-main` (canonical, May 16) + 2 older copies | 💻 Present-Mac, **not in Git** | Critical → **safe on Mac; commit to Git** |
| **CloakBrowser source** (`cloakbrowser` v0.3.26) | Mac `~/Desktop/CloakBrowser-main/cloakbrowser` (540K) + `vz/` copy | 💻 Present-Mac, not in Git, **not on PyPI** | Critical → **safe on Mac; commit to Git** |
| **Backup archives (off-site)** | none exist (`deploy/offsite/` written but unscheduled) | ❌ Missing | gap — extraction is the substitute today |
| **NSSM service definitions** | VPS only (live config) | 🔴 Present-VPS-only | Non-critical → re-creatable from `deploy/setup-vps.ps1` |
| **Scheduled-task XML** | VPS only | 🔴 Present-VPS-only | Non-critical → re-creatable from `deploy/install-*-task.ps1` |
| **CloakBrowser ChatGPT login session** (`CHROME_PROFILE_DIR`) | VPS only | 🔴 Present-VPS-only | Non-critical → re-login on new host |

---

## 2. Classification summary

### ✅ Already safe (no extraction needed)
- All application **source code**, deploy scripts, Prisma schemas, CI workflow, Caddyfile, Docker assets — **in GitHub**.
- **AI engine + CloakBrowser source** — on the Mac (3 + 2 copies). *(Not yet in Git — preserve by committing, but a VPS loss does not lose them.)*

### 🔴 CRITICAL — exists ONLY on the VPS (lose the server → lose these)
1. **Production database** (`saas.db` + WAL sidecars) — **no copy anywhere off the VPS.**
2. **Production env files** — especially **`AUTH_SECRET`** (decrypts all tenant AI/Meta/SMTP secrets).
3. **WhatsApp sessions** — live device links.
4. **Local backup archives** (`C:\app\backups\`).

### 🟠 Non-critical VPS-only (re-creatable, extract if time permits)
- SSL certs (Caddy auto-reissues), NSSM service defs, scheduled-task XML, ChatGPT profile, logs.

### 🟠 Local-only (Mac), not in GitHub — preserve before the *Mac* is ever at risk
- Branch `claude/hopeful-kowalevski-90a1e7` (3 UI commits), `UIUX_POLISH_PASS_2026_06_10.md`, this DR package, the AI engine source.

### ❌ Missing entirely
- Off-site backups (none) — **this is exactly why the live extraction is mandatory now.**

---

## 3. The honest one-liner

> If the VPS died **right now**, you would **keep the entire application** (GitHub + Mac) but **lose 100% of live production data** and possibly the master `AUTH_SECRET`. The four 🔴 CRITICAL items above are the whole ballgame — extract them first. Proceed to [DATA_PRESERVATION_PLAN](DATA_PRESERVATION_PLAN.md) and [EXPORT_COMMANDS](EXPORT_COMMANDS.md).
