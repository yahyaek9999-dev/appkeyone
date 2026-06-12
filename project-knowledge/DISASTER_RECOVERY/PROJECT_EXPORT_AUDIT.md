# PROJECT_EXPORT_AUDIT — KEYONE

**Date:** 2026-06-12
**Author:** Disaster-Recovery audit (documentation only — no production changes)
**Scope:** Everything required to rebuild the entire KEYONE platform on a brand-new server from scratch.

> Companion documents: [GITHUB_COMPLETENESS_AUDIT](GITHUB_COMPLETENESS_AUDIT.md) · [ENVIRONMENT_AUDIT](ENVIRONMENT_AUDIT.md) · [DATABASE_MIGRATION_AUDIT](DATABASE_MIGRATION_AUDIT.md) · [WHATSAPP_RECOVERY_AUDIT](WHATSAPP_RECOVERY_AUDIT.md) · [DISASTER_RECOVERY](DISASTER_RECOVERY.md) · [UBUNTU_MIGRATION_PLAN](UBUNTU_MIGRATION_PLAN.md) · [BACKUP_POLICY](BACKUP_POLICY.md) · [FINAL_READINESS_REPORT](FINAL_READINESS_REPORT.md)

---

## 0. Executive summary

KEYONE is a single-VPS production SaaS. The **application** (Next.js SaaS + Node WhatsApp microservice + deploy tooling) is fully contained in the Git repository and reproducible. The **runtime state** (SQLite database, WhatsApp sessions, production secrets) and the **in-house LLM proxy source** are **not** in Git and live only on the Windows VPS and the owner's local machine. Rebuilding the platform requires Git **plus** three non-Git artifacts: the database, the secrets file, and the CloakBrowser LLM proxy source.

| Layer | In Git? | Rebuildable from Git alone? |
|---|---|---|
| SaaS application code | ✅ Yes | ✅ Yes |
| WhatsApp microservice code | ✅ Yes | ✅ Yes |
| Deploy / backup / rollback scripts | ✅ Yes | ✅ Yes |
| Prisma schema (SQLite + Postgres) | ✅ Yes | ✅ Yes |
| CI/CD workflow | ✅ Yes | ✅ Yes |
| **Production data (SQLite DB)** | ❌ No (gitignored) | ❌ No — needs a DB backup |
| **Production secrets (.env / AUTH_SECRET)** | ❌ No (gitignored) | ❌ No — needs a secrets backup |
| **WhatsApp session auth** | ❌ No (gitignored) | ❌ No — re-scan QR or restore from backup |
| **CloakBrowser LLM proxy (`main.py`)** | ❌ **No (not tracked at all)** | ❌ No — needs the separate `mse_ai_api` source |

---

## 1. Components inventory

### 1.1 Repository top-level layout
```
appkeyone/                         (Git repo root)
├── saas/                          Next.js 14 SaaS app (the product)   — 546 tracked files
│   ├── app/                       App Router (141 API routes, dashboard, admin, onboarding)
│   ├── lib/                       Business logic (71 modules: wa, llm, auth, providers, …)
│   ├── components/                React UI
│   ├── prisma/                    schema.prisma (SQLite), schema.postgres.prisma, seeds
│   ├── workers/                   baileys.worker.js, broadcast.worker.ts, index.ts
│   ├── scripts/verify/            regression verification suite
│   ├── public/                    static assets (logo, favicon, marketing video)
│   ├── package.json               app dependencies (Next 14.2.35, Prisma 5.22, Baileys 7-rc11)
│   └── .env.example               canonical env template
├── whatsapp-service/              Standalone WhatsApp bridge (whatsapp-web.js / Puppeteer)
│   └── src/index.js, src/sessions.js
├── deploy/                        37 deploy/backup/rollback/health scripts (PowerShell + bash)
│   ├── Caddyfile                  reverse-proxy config
│   ├── release.sh / release-git.sh / rollback-release.sh
│   ├── backup-all.ps1 / backup-db.ps1 / verify-backup.ps1
│   ├── deploy-safe.ps1 / deploy.ps1 / rollback.ps1
│   ├── setup-vps.ps1 / vps-docker-setup.sh / start-services.ps1
│   └── install-*-task.ps1 + run-*.ps1   (Windows scheduled jobs)
├── project-knowledge/             60+ audit/design reports (this package lives here)
├── clint/                         marketing doc only (KEYONE-عرض-المميزات.md)
├── Dockerfile + requirements.txt  ⚠️ build recipe for the CloakBrowser LLM proxy whose
│                                    main.py is NOT in this repo
├── docker-compose.production.yml  Linux/Docker target (GHCR + Watchtower) — aspirational
├── docker-compose.yml             local AI-API compose (port 7777)
├── deploy.sh                      thin wrapper → deploy/release.sh
└── .github/workflows/deploy.yml   CI/CD: build on GH Actions → ship artifact → Windows VPS
```

### 1.2 The three runtime applications
| App | Runtime | Entry | Prod port | Service (NSSM) |
|---|---|---|---|---|
| **SaaS** (the product) | Node 20 / Next.js 14.2.35 | `next start` | 3000 (localhost) | `mse-saas` |
| **WhatsApp bridge** | Node / Express + whatsapp-web.js | `node src/index.js` | `PORT` = 3001 default, **7799 in prod** | `mse-wa` / `mse-whatsapp` |
| **CloakBrowser LLM proxy** | Python 3.10 / FastAPI + Playwright | `python main.py` | 7788 (localhost) | `mse-llm` / `mse-fashion-llm` |
| **Caddy reverse proxy** | Caddy v2 | `caddy run` | 80 / 443 (public) | `mse-caddy` / `caddy` |

> ⚠️ **Service-name drift:** scripts use two conventions — `mse-saas/mse-wa/mse-caddy/mse-llm` (deploy & health scripts) and `KEYONE-SaaS/KEYONE-Whatsapp/KEYONE-Caddy/KEYONE-LLM` / `mse-fashion-llm` (setup script & older reports). Confirm the live names with `nssm list` / `Get-Service` before any recovery action.

---

## 2. Services inventory (current Windows VPS)

| Service | Bind | Purpose | Auto-start | Source of truth |
|---|---|---|---|---|
| `mse-saas` | 127.0.0.1:3000 | Next.js SaaS | yes (restart on crash, 3s) | Git `saas/` |
| `mse-wa` | 127.0.0.1:7799 (+:3001 health) | WhatsApp send/receive | yes | Git `whatsapp-service/` |
| `mse-llm` | 127.0.0.1:7788 | AI replies (in-house) | yes | **NOT in Git** (`mse_ai_api` source) |
| `mse-caddy` | 0.0.0.0:80, :443 | HTTPS, TLS, headers, cache | yes | Git `deploy/Caddyfile` |

### Windows Scheduled Tasks (cron equivalents)
| Task | Interval | Calls |
|---|---|---|
| `KEYONE-DB-Backup` | daily 03:30 | `backup-db.ps1` (local SQLite gzip) |
| `KEYONE-Broadcasts` | every 1 min | `run-broadcasts.ps1` → `POST /api/cron/broadcasts` |
| `KEYONE-Follow-Ups` | every 30 min | `run-followup.ps1` → `POST /api/cron/follow-ups` |
| `KEYONE-Automations` | every 30 min | `run-automations.ps1` → `POST /api/cron/automations` |
| `KEYONE-Abandoned-Cart` | every 60 min | `run-abandoned-cart.ps1` → `POST /api/cron/abandoned-cart` |

> The app also exposes additional cron endpoints not necessarily wired to a Windows task yet: `product-affinity`, `meta-webhook-processor`, `meta-template-sync`, `llm-prewarm`, `catalog-sync`, `provider-maintenance`, `meta-quality-monitor`, `daily-report`, `outgoing-messages`. All are authenticated with the `x-internal-secret` header (`SAAS_INTERNAL_SECRET`).

---

## 3. External integrations inventory

| Integration | Required? | Used for | Recovery note |
|---|---|---|---|
| **CloakBrowser / in-house LLM** (`LLM_API_URL` :7788) | Default AI engine | Chat/AI replies | ⚠️ Source not in Git — see [GITHUB_COMPLETENESS_AUDIT](GITHUB_COMPLETENESS_AUDIT.md) |
| **OpenAI** (`OPENAI_API_KEY`) | Optional | Whisper transcription, Vision fallback | Graceful no-op if unset |
| **Per-tenant AI providers** (OpenAI/Gemini/Claude/Groq/OpenRouter/Grok) | Optional | Tenant-supplied AI keys | Keys encrypted in DB with `AUTH_SECRET` |
| **Meta Cloud API** (`META_*`) | Optional, flag+plan gated | Alternative WhatsApp transport | `META_CLOUD_ENABLED=0` by default |
| **Upstash Redis** (`UPSTASH_*`) | Optional | BullMQ + distributed rate-limit | App boots without it (`ENABLE_BULLMQ=0`) |
| **Sentry** (`*_SENTRY_DSN`) | Optional | Error tracking | App works without it |
| **Supabase / Postgres** | Future | PG migration target | Not used in production yet |
| **Commerce: Shopify / WooCommerce / Salla / Zid** | Optional per-tenant | Order/webhook sync | Per-tenant config in DB |

---

## 4. Domains, DNS & SSL dependencies

| Item | Value | Notes |
|---|---|---|
| Primary app domain | `app.keyone1.com` | Referenced by health checks, RUNBOOK, deploy-safe.ps1 |
| Caddy-served host | `k1wb.app.keyone1.com` | The only host block in `deploy/Caddyfile` |
| ⚠️ Mismatch | `app.keyone1.com` vs `k1wb.app.keyone1.com` | One must be a DNS alias to the same IP, or a reference is stale — **resolve before cutover** |
| Current A record target | `217.154.163.16` (Windows VPS) | Single IP |
| DNS provider | **Not documented** — owner must identify the registrar/zone host | Required to re-point A record during migration |
| SSL/TLS | Caddy automatic ACME (Let's Encrypt) | No manual certs; renews itself. New server re-issues automatically once DNS points at it. |
| Recommended pre-cutover | Lower DNS TTL to 30s ≥24h before migration | From DOCKER_MIGRATION_PLAN |

**Caddy routing (within the served host):**
- `/wa/*` → `127.0.0.1:7799` (WhatsApp service)
- `/llm/*` → `127.0.0.1:7788` (LLM proxy)
- everything else → `127.0.0.1:3000` (SaaS)
- Security headers: HSTS (1y), `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`; strips `Server`/`Via`.

---

## 5. Storage & upload dependencies

**Key finding: KEYONE stores NO user-uploaded binary files on disk.**

- Knowledge-base documents (PDF/DOCX/TXT) are parsed **in-memory** in the request handler; only the extracted **text** is persisted into the `Document.content` column in SQLite. The original binary is discarded.
- WhatsApp media (audio/images) is decoded from base64, sent to transcription/vision, and only the resulting **text** is stored. Binaries are not persisted.
- There is **no `/uploads` directory, no blob store, no `writeFile`/`createWriteStream`** anywhere in the API or lib layers.
- `saas/public/` (logo, favicon, manifest, marketing `vedio.mp4`/`mobile.mp4`) is the only static asset set, and it is **in Git**.

➡️ **Implication for recovery:** the entire recoverable application state collapses to **(1) the SQLite DB file + (2) the `AUTH_SECRET` value**. There is no separate upload tree to back up. (The repo root does contain large `vedio.mp4`/`mobile.MP4` demo files tracked in Git — heavy but recoverable.)

---

## 6. AI provider dependencies

- **Primary:** in-house **CloakBrowser** FastAPI proxy at `LLM_API_URL` (default `http://127.0.0.1:7788`), OpenAI-compatible `/v1/chat/completions`. `saas/lib/llm.ts` adds round-robin (`LLM_API_URLS`), a concurrency semaphore (`LLM_MAX_CONCURRENT=3`), per-URL circuit breakers, and retries.
- **Failover chain:** tenant vault providers (`TenantProviderCredential`) → bot-level override (`Bot.aiProvider`/`aiApiKeyEnc`) → in-house cluster.
- **Media AI:** OpenAI Whisper (`WHISPER_API_URL`) + Vision (`VISION_API_URL`), gated by `OPENAI_API_KEY`; graceful Arabic placeholder fallback if unset.
- **Encryption of tenant AI keys:** AES-256-GCM with a key derived `scryptSync(AUTH_SECRET, "keyone:provider-key:v1", 32)`. **Losing `AUTH_SECRET` makes every stored provider key permanently unreadable** even if the DB survives.

---

## 7. WhatsApp dependencies

- **Production transport:** `whatsapp-web.js` (Puppeteer + Chromium) in `whatsapp-service/`. One session per tenant.
- **Session auth state (on disk, not in Git):** `SESSIONS_DIR` (prod `C:/KEYONE/data/wa-sessions`, default `./sessions`), with whatsapp-web.js `LocalAuth` writing `.wwebjs_auth/session-<userId>/`.
- **Session loss = QR re-scan** per tenant (or restore the directory from backup).
- **Baileys** (`saas/workers/baileys.worker.js`) is an experimental, disabled-by-default (`ENABLE_BAILEYS=0`) isolated worker — not in the production send path. Provider stub returns `NOT_IMPLEMENTED`.
- **Meta Cloud** is gated off by default.
- saas↔service auth: `SAAS_INTERNAL_SECRET` (incoming) + `WHATSAPP_SHARED_SECRET` (outgoing), constant-time compared.
- 🔒 CLAUDE.md hard rule: **never modify the WhatsApp send pipeline without explicit approval.**

---

## 8. Database dependencies

- **Engine:** SQLite (`provider = "sqlite"`, `url = env("DATABASE_URL")`).
- **File path:** varies by config — `C:/KEYONE/data/saas.db` (deploy/env example) or `C:\app\saas\prisma\prod.db` (backup script). **Reconcile the live path before backup/restore.**
- **64 models** (`User`, `Bot`, `Customer`, `Conversation`, `Message`, `Order`, `Subscription`, `WaMessage`, `TenantProviderCredential`, …) across 1,678 schema lines.
- **No migration history** — schema is applied via `prisma db push` (there is **no `prisma/migrations/` directory**). Recovery relies on `schema.prisma` + `db push`, not versioned migrations.
- **Postgres path is code-ready:** `schema.postgres.prisma` (generated by `scripts/generate-pg-schema.sh`), `lib/db.ts` already reads `DATABASE_DIRECT_URL || DATABASE_URL`. Not cut over. See [DATABASE_MIGRATION_AUDIT](DATABASE_MIGRATION_AUDIT.md).
- **WAL pragmas** are applied at boot in `lib/db.ts` (fire-and-forget). The `.db-wal`/`.db-shm` sidecar files must be checkpointed/included when copying a live DB.

---

## 9. Build dependencies

| Need | Version / source |
|---|---|
| Node.js | 20.x (CI uses `setup-node@v4` node 20) |
| npm | bundled with Node 20; `npm ci` from `saas/package-lock.json` (257 KB lockfile present) |
| Prisma CLI | `^5.22.0` (devDependency); `prisma generate` is `postinstall` and part of `build` |
| Next.js build | `prisma generate && next build`; needs `--max-old-space-size=4096` on the 8GB VPS |
| Python (LLM proxy) | 3.10; `requirements.txt`: fastapi 0.110, uvicorn 0.27.1, playwright 1.42, pydantic 2.6.3, python-multipart 0.0.9 + Chromium via `playwright install` |
| Native build gotcha | Prisma query engine is platform-specific — **must run `prisma generate` on the target OS** after deploy (macOS-built artifact won't query on Windows/Linux) |
| Reverse proxy | Caddy v2 binary |
| Process manager | Windows: NSSM. Linux target: Docker Compose + Watchtower, or systemd. |

---

## 10. Minimum artifact set to rebuild KEYONE elsewhere

1. **Git repository** (this repo) — code, schema, deploy scripts, Caddyfile, CI.
2. **SQLite database backup** — `saas.db` (+ WAL sidecars checkpointed). *Not in Git.*
3. **Production secrets** — at minimum `AUTH_SECRET`, `SAAS_INTERNAL_SECRET`, `WHATSAPP_SHARED_SECRET`, `LLM_API_KEY`, and any `OPENAI_API_KEY`/`META_*`/`UPSTASH_*` in use. *Not in Git.*
4. **CloakBrowser LLM proxy source** (`mse_ai_api` / `main.py`) — *Not in Git;* owner's local `~/Desktop/mse_ai_api-main`. (Or accept degraded mode and configure an external AI provider per tenant.)
5. **WhatsApp session directory** (optional) — restore to skip QR re-scans; otherwise tenants re-pair.

If any of items 2–4 is missing, recovery is **incomplete**. See [FINAL_READINESS_REPORT](FINAL_READINESS_REPORT.md) for the YES/NO verdict.
