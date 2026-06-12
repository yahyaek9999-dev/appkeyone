# SERVER_INVENTORY — KEYONE Windows VPS (End-of-Life Extraction)

**Date:** 2026-06-12 · **Clock:** VPS may expire within ~6 hours · **Mode:** read-only discovery, no changes
**Host:** `217.154.163.16` (Windows Server, Contabo) · access `Administrator@217.154.163.16` (SSH/PowerShell)

> **How this was compiled:** I am running on the **owner's Mac**, not on the VPS. This inventory is derived from (a) the **authoritative deploy scripts/configs in the repo** that define the exact VPS layout, and (b) **verified local Mac state**. Live paths must be confirmed during extraction — [EXPORT_COMMANDS.md](EXPORT_COMMANDS.md) step 0 lists them before you copy. I did **not** read, modify, restart, or delete anything on the VPS.

Criticality legend: 🔴 irreplaceable (VPS-only) · 🟠 important (re-creatable with effort) · 🟢 safe (in Git/Mac/auto-regenerates)

---

## 1. Project directories

| Path (VPS) | Purpose | Criticality | Recovery requirement |
|---|---|---|---|
| `C:\app` | Git checkout of `appkeyone` (deploy target) | 🟢 | In GitHub (`origin/main`) |
| `C:\app\saas` | Running Next.js app (`.next`, `node_modules`, `.env`, `prisma`) | 🟢 code / 🔴 `.env` | Code in Git; **`.env` VPS-only** |
| `C:\app\whatsapp-service` | WhatsApp bridge (`.env`, code) | 🟢 code / 🔴 `.env` | Code in Git; **`.env` VPS-only** |
| `C:\app\releases` | Prior release artifacts + `previous` rollback | 🟠 | Re-buildable from Git |
| `C:\app\backups` | **Local backup snapshots** (DB gz, pre-deploy) | 🔴 | **VPS-only — extract** |
| `C:\app\logs` | Service logs (mse-saas/mse-wa/mse-caddy) | 🟢 | Optional (forensics) |
| `C:\KEYONE\data` | **Live data root** (DB, wa-sessions, cloak-profile) | 🔴 | **VPS-only — extract** |
| `C:\KEYONE\logs` | Baileys/other logs | 🟢 | Optional |
| `C:\Caddy` | Caddyfile + Caddy data (TLS certs) | 🟢 config / 🟠 certs | Config in Git; certs auto-reissue |

## 2. Services (NSSM Windows services)

| Service | Bind | Runs | Criticality | Recovery |
|---|---|---|---|---|
| `mse-saas` | 127.0.0.1:3000 | `npm start` in `C:\app\saas` | 🟢 | Git |
| `mse-wa` / `mse-whatsapp` | 127.0.0.1:7799 (+:3001) | `node src/index.js` | 🟢 code / 🔴 sessions | Git + sessions extract |
| `mse-llm` / `mse-fashion-llm` | 127.0.0.1:7788 | `python main.py` (CloakBrowser) | 🟢 (source on Mac) | Commit engine ([AI_ENGINE_SOURCE_INVENTORY](AI_ENGINE_SOURCE_INVENTORY.md)) |
| `mse-caddy` / `caddy` | 0.0.0.0:80,443 | `caddy run` | 🟢 | Git Caddyfile |

> Service definitions (exact ExecStart, AppDirectory, account) are VPS-only state → export via `nssm dump` (commands in Phase 4). 🟠

## 3. Databases

| Path (candidate) | Purpose | Criticality | Recovery requirement |
|---|---|---|---|
| `C:\KEYONE\data\saas.db` (+ `-wal`,`-shm`) | **Production SQLite DB — all tenants/orders/messages** | 🔴🔴🔴 | **VPS-only. No local copy exists. TOP extraction priority.** |
| `C:\app\saas\prisma\prod.db` (alt path) | Same DB if this path is the live one | 🔴 | Extract both candidates |
| `C:\app\backups\prod-*.db.gz` | Daily online snapshots (14-day) | 🔴 | Extract newest as consistent fallback |

> ⚠️ Two documented DB paths exist; **extract both** rather than guess. Local Mac search found only `dev.db` (development) — **the production DB is nowhere off the VPS.**

## 4. Deploy scripts
All in Git (`deploy/` + `.github/workflows/deploy.yml`) → 🟢. Includes release/rollback/backup/health/setup + the new `deploy/offsite/` scripts. No extraction needed.

## 5. Scheduled tasks (Windows Task Scheduler)

| Task | Interval | Action | Criticality | Recovery |
|---|---|---|---|---|
| `KEYONE-DB-Backup` | daily 03:30 | local DB gzip | 🟢 (installer in Git) | Re-install from `deploy/install-backup-task.ps1` |
| `KEYONE-Broadcasts` | 1 min | `POST /api/cron/broadcasts` | 🟢 | Git installer |
| `KEYONE-Follow-Ups` | 30 min | `/api/cron/follow-ups` | 🟢 | Git installer |
| `KEYONE-Automations` | 30 min | `/api/cron/automations` | 🟢 | Git installer |
| `KEYONE-Abandoned-Cart` | 60 min | `/api/cron/abandoned-cart` | 🟢 | Git installer |

> Export live task XML (`schtasks /query /xml`) for exact triggers/state → 🟠 nice-to-have.

## 6. Environment files

| Path (VPS) | Purpose | Criticality | Recovery requirement |
|---|---|---|---|
| `C:\app\saas\.env` | **Prod secrets incl. `AUTH_SECRET`** (master enc key) | 🔴🔴🔴 | **VPS-only. Extract + store in vault. Without `AUTH_SECRET`, restored DB is undecryptable.** |
| `C:\app\whatsapp-service\.env` | `SAAS_INTERNAL_SECRET`, `SESSIONS_DIR` | 🔴 | **VPS-only — extract** |
| `C:\app\.env` (root, LLM) | `API_SECRET_KEY`, profile dir | 🔴 | **VPS-only — extract** |

> A **stale** `~/Desktop/mse_ai_api-main/saas/.env` (May 12) may hold an older `AUTH_SECRET` — useful only if `AUTH_SECRET` was never rotated since. Do not rely on it; extract the live file.

## 7. SSL certificates

| Path (VPS) | Purpose | Criticality | Recovery requirement |
|---|---|---|---|
| Caddy data dir (e.g. `C:\Caddy\data\caddy\certificates\…` or `%AppData%\Caddy`) | Let's Encrypt certs for the domain | 🟢/🟠 | **Auto-reissued** by Caddy on the new host once DNS points at it. Extract only to avoid ACME re-issue delay. |

## 8. Upload directories

| Path | Status | Criticality |
|---|---|---|
| (none) | **KEYONE stores no user uploads on disk** — knowledge/media parsed to text into the DB | 🟢 nothing to extract |

## 9. WhatsApp session locations

| Path (VPS) | Purpose | Criticality | Recovery requirement |
|---|---|---|---|
| `C:\KEYONE\data\wa-sessions\` (`SESSIONS_DIR`) → `.wwebjs_auth/session-<userId>/` | Live WhatsApp device links per tenant | 🔴 | **VPS-only. Extract** to avoid every tenant re-scanning QR. (Re-scan is possible but disruptive.) |
| `.wwebjs_cache/` | WA Web build cache | 🟢 | Regenerates |

## 10. AI engine locations

| Path | Purpose | Criticality | Recovery requirement |
|---|---|---|---|
| VPS: `C:\app\main.py` + `.venv` + cloakbrowser (mse-llm) | Running CloakBrowser proxy | 🟠 | **Source already on Mac** (`~/Desktop/mse_ai_api-main`, `~/Desktop/CloakBrowser-main`). Confirm VPS copy isn't newer; otherwise no extract needed. |
| `CHROME_PROFILE_DIR` (ChatGPT login session) | Logged-in ChatGPT state | 🟠 | Re-login on new host, or extract profile dir |

## 11. Backup locations

| Path (VPS) | Purpose | Criticality |
|---|---|---|
| `C:\app\backups\` | All backups (DB gz + pre-deploy snapshots) | 🔴 **VPS-only — extract** |
| Off-site | **None exist yet** (scripts written in `deploy/offsite/`, not yet scheduled) | — |

## 12. Log locations
`C:\app\logs\*` (mse-saas/mse-wa/mse-caddy `.err/.out`), `C:\KEYONE\logs\` → 🟢 optional forensic value.

## 13. Docker assets
`Dockerfile`, `docker-compose.production.yml`, `docker-compose.yml` all in Git → 🟢. Not currently the live runtime (Windows/NSSM is). No VPS Docker state to extract.

## 14. Caddy / Nginx configs

| Path (VPS) | Criticality | Recovery |
|---|---|---|
| `C:\Caddy\Caddyfile` | 🟢 | In Git (`deploy/Caddyfile`); live copy may have host-specific edits → export to compare |
| (no Nginx) | — | — |

## 15. Windows service definitions
Live NSSM config (ExecStart/AppDirectory/AppEnvironmentExtra/account/restart) → 🟠 export via `nssm dump <svc>` (Phase 4). Re-creatable from `deploy/setup-vps.ps1` + `start-services.ps1` if lost.

## 16. Git repositories

| Repo | Location | Status | Criticality |
|---|---|---|---|
| `appkeyone` | `C:\app` (VPS) + `~/Desktop/appkeyone` (Mac) + GitHub `yahyaek9999-dev/appkeyone` | `main` @ `cbb7eda` **fully pushed** ✓ | 🟢 |
| local branch `claude/hopeful-kowalevski-90a1e7` | Mac only | **3 commits NOT on GitHub** (UI work) | 🟠 **push to preserve** |
| Working-tree-only docs | Mac only | `UIUX_POLISH_PASS_2026_06_10.md` (untracked) + this DR package (`DISASTER_RECOVERY/`, `deploy/offsite/`) uncommitted | 🟠 **commit/push to preserve** |
| `keyone-llm-proxy` (engine) | does not exist yet | engine source only on Mac | 🟠 **create + push** |

---

## Bottom line — the 🔴 VPS-only extraction set
1. **Production DB** — `C:\KEYONE\data\saas.db` (+ `prod.db` candidate + newest `backups\*.db.gz`)
2. **Env files** — `saas\.env` (AUTH_SECRET), `whatsapp-service\.env`, root `.env`
3. **WhatsApp sessions** — `C:\KEYONE\data\wa-sessions\`
4. **Local backups** — `C:\app\backups\`
5. *(optional)* SSL certs, NSSM/task definitions, logs

Everything else is already in GitHub or on the Mac. Proceed to [RECOVERY_ASSETS_AUDIT](RECOVERY_ASSETS_AUDIT.md).
