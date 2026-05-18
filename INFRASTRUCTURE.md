# KEYONE — Infrastructure Reference

> **Security notice:** This file documents infrastructure topology, endpoints,
> and configuration patterns. It must **never** contain real passwords, tokens,
> or private keys. All secrets live in `.env` files (never committed) or a
> secrets manager.

---

## Table of Contents

1. [Overview](#1-overview)
2. [GitHub Repository](#2-github-repository)
3. [VPS (Production Server)](#3-vps-production-server)
4. [Database — SQLite (Current)](#4-database--sqlite-current)
5. [Database — Supabase Postgres (Migration Target)](#5-database--supabase-postgres-migration-target)
6. [Redis — Upstash](#6-redis--upstash)
7. [Error Tracking — Sentry](#7-error-tracking--sentry)
8. [LLM Service](#8-llm-service)
9. [WhatsApp Service](#9-whatsapp-service)
10. [Deployment Pipeline](#10-deployment-pipeline)
11. [Postgres Migration Checklist](#11-postgres-migration-checklist)
12. [Secret Rotation Procedures](#12-secret-rotation-procedures)
13. [Port Map](#13-port-map)

---

## 1. Overview

```
                ┌─────────────────────────────────────────┐
                │         VPS: 217.154.163.16              │
                │         Windows Server 2022              │
                │         Install dir: C:\app              │
                │                                          │
                │  ┌──────────┐   ┌────────────────────┐  │
Internet ──────►│  │  Caddy   │──►│  Next.js SaaS :3000│  │
(HTTPS)         │  │  :443    │   │  (mse-saas / NSSM) │  │
                │  └──────────┘   └────────────────────┘  │
                │                          │               │
                │                 ┌────────▼───────────┐  │
                │                 │  WA service :3001  │  │
                │                 │  (mse-wa / NSSM)   │  │
                │                 └────────────────────┘  │
                │                          │               │
                │                 ┌────────▼───────────┐  │
                │                 │  LLM proxy :7788   │  │
                │                 │  (mse-llm / NSSM)  │  │
                │                 └────────────────────┘  │
                └─────────────────────────────────────────┘
                          │                │
               ┌──────────▼──┐   ┌─────────▼──────────┐
               │  Supabase   │   │  Upstash Redis      │
               │  Postgres   │   │  (eu-central-1)     │
               │  (future)   │   └─────────────────────┘
               └─────────────┘
```

---

## 2. GitHub Repository

| Property | Value |
|---|---|
| URL | `https://github.com/yahyaek9999-dev/appkeyone.git` |
| Default branch | `main` |
| CI push method | `deploy.sh` (Unix) injects PAT via remote URL |
| VPS pull method | `deploy.ps1 -GitPull` via SSH |

### Remote setup (one-time, on dev machine)

```/dev/null/setup.sh#L1-5
git init
git remote add origin https://github.com/yahyaek9999-dev/appkeyone.git
# For CI (do NOT commit the PAT):
# git remote set-url origin "https://${GITHUB_PAT}@github.com/yahyaek9999-dev/appkeyone.git"
```

---

## 3. VPS (Production Server)

| Property | Value |
|---|---|
| IP | `217.154.163.16` |
| OS | Windows Server (2019/2022) |
| Install directory | `C:\app` |
| Process manager | NSSM (Non-Sucking Service Manager) |
| Reverse proxy | Caddy |
| Deploy script | `C:\app\deploy\deploy.ps1` |

### NSSM Services

| Service name | Process | Port |
|---|---|---|
| `mse-saas` | `node` (Next.js) | 3000 |
| `mse-wa` | `node` (whatsapp-service) | 3001 |
| `mse-llm` | Python FastAPI (CloakBrowser) | 7788 |
| `mse-caddy` | Caddy reverse proxy | 443, 80 |

### SSH Access

```/dev/null/ssh-example.sh#L1-3
ssh -i ~/.ssh/id_rsa Administrator@217.154.163.16
# Then, to trigger a deploy manually:
# powershell.exe -File C:\app\deploy\deploy.ps1 -GitPull
```

### Directory Layout on VPS

```/dev/null/layout.txt#L1-12
C:\app\
├── saas\                  # Next.js app
│   ├── .env               # secrets (never committed)
│   ├── .next\             # built artifact
│   └── prisma\
│       └── prod.db        # SQLite production database
├── whatsapp-service\
│   └── .env
├── data\
│   └── sessions\          # WA session files
├── backups\               # automated backups
└── deploy\                # this repo's deploy/ folder
```

---

## 4. Database — SQLite (Current)

- **Type:** SQLite 3 via Prisma
- **Location on VPS:** `C:\app\saas\prisma\prod.db` (or absolute path set in `DATABASE_URL`)
- **ORM:** Prisma (schema: `saas/prisma/schema.prisma`)
- **Migrations:** `prisma db push` (additive-only in `deploy.ps1`)
- **Backups:** `deploy/backup-db.ps1` (Windows Task Scheduler, daily)

> **Important:** Never use `prisma db push --accept-data-loss` in production.
> Always inspect the diff and use migrations for destructive changes.

---

## 5. Database — Supabase Postgres (Migration Target)

| Property | Value |
|---|---|
| Project ref | `wahyuzhqkfgzigcipzcc` |
| Region | `eu-central-1` (AWS Frankfurt) |
| Dashboard | `https://supabase.com/dashboard/project/wahyuzhqkfgzigcipzcc` |

### Connection Strings

**Pooled (for the app — use with Prisma `url`):**
```/dev/null/postgres-urls.txt#L1-2
postgresql://postgres.wahyuzhqkfgzigcipzcc:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

**Direct (for migrations — use with Prisma `directUrl`):**
```/dev/null/postgres-urls.txt#L4-5
postgresql://postgres:[PASSWORD]@db.wahyuzhqkfgzigcipzcc.supabase.co:5432/postgres
```

Set these in `.env` as:
```/dev/null/env-snippet.env#L1-2
POSTGRES_URL=postgresql://postgres.wahyuzhqkfgzigcipzcc:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
POSTGRES_DIRECT_URL=postgresql://postgres:[PASSWORD]@db.wahyuzhqkfgzigcipzcc.supabase.co:5432/postgres
```

---

## 6. Redis — Upstash

| Property | Value |
|---|---|
| Instance | `kind-jawfish-128295` |
| Endpoint | `kind-jawfish-128295.upstash.io` |
| Region | `eu-central-1` |
| Dashboard | `https://console.upstash.com` |

### Environment Variables

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | REST API base URL (for `@upstash/redis`) |
| `UPSTASH_REDIS_REST_TOKEN` | REST API token |
| `UPSTASH_REDIS_URL` | `rediss://` URL (for BullMQ / ioredis) |

> Redis is currently **optional** (rate-limiting is in-memory, BullMQ disabled).
> Set `ENABLE_BULLMQ=1` and configure all three vars when enabling the worker.

---

## 7. Error Tracking — Sentry

| Property | Value |
|---|---|
| Organisation | `keyone` |
| Project | `keyone` |
| Dashboard | `https://keyone.sentry.io` |
| DSN | `https://b4f3f25e04b4d3059c254e62385e5859@o4511407875031040.ingest.de.sentry.io/4511408092414032` |

> The DSN is **not secret** — it is embedded in the client bundle. The
> `SENTRY_AUTH_TOKEN` (for source-map uploads during CI builds) IS secret
> and must never be committed.

### Environment Variables

| Variable | Secret? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | No | Client + server error ingestion |
| `SENTRY_ORG` | No | `sentry-cli` / build plugin |
| `SENTRY_PROJECT` | No | `sentry-cli` / build plugin |
| `SENTRY_AUTH_TOKEN` | **Yes** | Source map upload during `next build` |

---

## 8. LLM Service

| Property | Value |
|---|---|
| Type | CloakBrowser FastAPI (OpenAI-compatible) |
| Default URL | `http://127.0.0.1:7788` |
| NSSM service | `mse-llm` |

Multiple instances can be round-robin'd via `LLM_API_URLS` (comma-separated).

---

## 9. WhatsApp Service

| Property | Value |
|---|---|
| Type | `whatsapp-web.js` Node.js microservice |
| Default URL | `http://127.0.0.1:3001` |
| NSSM service | `mse-wa` |
| Auth header | `X-Internal-Secret: <SAAS_INTERNAL_SECRET>` |

The `SAAS_INTERNAL_SECRET` must match in both `saas/.env` and `whatsapp-service/.env`.

---

## 10. Deployment Pipeline

### Normal deploy (from dev machine)

```/dev/null/deploy-flow.sh#L1-5
# 1. Push changes to GitHub
./deploy/deploy.sh --push-only -m "feat: ..."

# 2. On VPS (PowerShell, elevated):
cd C:\app\deploy
.\deploy.ps1 -GitPull
```

### End-to-end CI deploy (requires SSH key)

```/dev/null/deploy-flow.sh#L7-9
VPS_SSH_KEY=~/.ssh/keyone_vps \
./deploy/deploy.sh --full -m "chore: automated deploy"
```

### Rollback

```/dev/null/rollback.sh#L1-5
# On VPS (PowerShell):
cd C:\app\deploy
.\rollback.ps1 -InstallDir C:\app
```

### Validate env before deploy

```/dev/null/validate.sh#L1-3
./deploy/validate-env.sh          # checks saas/.env
./deploy/validate-env.sh path/to/.env   # checks specific file
```

---

## 11. Postgres Migration Checklist

Follow this checklist when migrating from SQLite → Supabase Postgres.

### Pre-migration

- [ ] Export full SQLite snapshot: `cp C:\app\saas\prisma\prod.db C:\app\backups\pre-migration.db`
- [ ] Audit `prisma/schema.prisma` — remove `@db.Text` SQLite-isms, switch `provider` to `postgresql`
- [ ] Add `url` (pooled) and `directUrl` (direct) to datasource block
- [ ] Set `POSTGRES_URL` and `POSTGRES_DIRECT_URL` in `.env`
- [ ] Run `npx prisma migrate dev --name init-postgres` locally against a dev Supabase instance
- [ ] Verify all tables created correctly in Supabase dashboard

### Data migration

- [ ] Write / obtain a SQLite → Postgres migration script
- [ ] Run migration script on a staging database first
- [ ] Verify row counts match between SQLite and Postgres
- [ ] Check that Prisma queries work correctly (especially JSON fields, booleans)

### Cutover

- [ ] Schedule a maintenance window (announce to users)
- [ ] Take final SQLite backup
- [ ] Run data migration script
- [ ] Swap `DATABASE_URL` in production `.env`
- [ ] Restart `mse-saas` service
- [ ] Run smoke tests: login, send message, check admin/metrics
- [ ] Monitor Sentry for 15 minutes post-cutover
- [ ] Keep SQLite backup for 30 days minimum

### Post-migration cleanup

- [ ] Remove SQLite `*.db` files from VPS (after 30-day retention)
- [ ] Update `backup-db.ps1` to use `pg_dump` instead of file copy
- [ ] Remove SQLite-specific deploy checks from `deploy.ps1`

---

## 12. Secret Rotation Procedures

### AUTH_SECRET rotation

> **Impact:** All active user sessions will be invalidated. Users will be
> logged out and must log in again. Encrypted merchant AI keys will need
> re-entry (they are AES-encrypted with a key derived from AUTH_SECRET).

1. Generate new secret: `openssl rand -hex 32`
2. Update `AUTH_SECRET` in VPS `.env`
3. Restart `mse-saas`: `nssm restart mse-saas`
4. Notify users of forced logout (optional but recommended)
5. Update any CI/CD environment that uses AUTH_SECRET

### SAAS_INTERNAL_SECRET rotation

> **Impact:** All cron jobs and internal webhooks will fail until both services
> are updated. Brief downtime of automated tasks.

1. Generate new secret: `openssl rand -hex 24`
2. Update `SAAS_INTERNAL_SECRET` in **both** `saas/.env` AND `whatsapp-service/.env`
3. Restart both services simultaneously:
   ```
   nssm restart mse-saas
   nssm restart mse-wa
   ```
4. Verify cron health: `GET /api/cron/llm-prewarm` with new header

### GitHub PAT rotation

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Update `GITHUB_PAT` in CI environment / secrets manager
4. Re-run `git remote set-url` on dev machines: `deploy.sh --push-only` will do this automatically
5. Revoke old token

### Upstash token rotation

1. Go to Upstash console → Redis instance → Details
2. Rotate token (generates new `UPSTASH_REDIS_REST_TOKEN` and `UPSTASH_REDIS_URL`)
3. Update both vars in VPS `.env`
4. Restart `mse-saas` (and worker process if running)

### Sentry Auth Token rotation

1. Go to `https://sentry.io` → Account Settings → API → Auth Tokens
2. Create new token with `project:releases` + `org:read` scopes
3. Update `SENTRY_AUTH_TOKEN` in CI environment
4. Revoke old token

---

## 13. Port Map

| Port | Protocol | Service | Exposed |
|---|---|---|---|
| 80 | TCP | Caddy (HTTP → HTTPS redirect) | Public |
| 443 | TCP | Caddy (HTTPS) | Public |
| 3000 | TCP | Next.js SaaS | Internal (via Caddy) |
| 3001 | TCP | WhatsApp service | Internal only |
| 7788 | TCP | LLM proxy | Internal only |
| 5432 | TCP | (future) Postgres direct | Supabase cloud |
| 6379 | TCP | (future) Redis | Upstash cloud (TLS) |

> Ports 3000, 3001, and 7788 must **not** be exposed on the public firewall.
> All external traffic must go through Caddy on 443.
