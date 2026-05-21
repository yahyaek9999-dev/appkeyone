# KEYONE Production Platform

KEYONE is a production WhatsApp/commerce SaaS platform with a Next.js dashboard, automation APIs, commerce integrations, and a separate WhatsApp runtime service.

This repository is now managed with a professional GitHub + VPS workflow:

- **GitHub is the source of truth**
- **`main` is production**
- **VPS runs production from `origin/main`**
- **`keydeploy` is the standard one-command deploy path**
- **runtime data, secrets, sessions, backups, caches, and SQLite DB files are not committed**

---

## Repository structure

| Path | Purpose |
|---|---|
| `saas/` | Main Next.js SaaS application, dashboard, APIs, Prisma schema |
| `whatsapp-service/` | WhatsApp bridge/runtime service |
| `deploy/` | Production deployment, backup, rollback, health-check scripts |
| `project-knowledge/` | Architecture, flows, safety notes, incident response, scaling notes |
| `DEVELOPMENT_SETUP.md` | Fresh-machine setup guide |
| `SAFE_GIT_WORKFLOW.md` | Branching and Git safety rules |
| `VPS_DEPLOY_WORKFLOW.md` | Production deploy and rollback workflow |
| `TROUBLESHOOTING.md` | Common failure modes and fixes |

---

## Branches

| Branch | Role |
|---|---|
| `main` | Production. Deploys from here only. |
| `dev` | Stable development integration branch. |
| `ai-experimental` | High-risk AI experiments. Do not deploy directly. |
| `baileys-exp` | Experimental WhatsApp/Baileys runtime work. Do not deploy directly. |

---

## Local setup

1. Clone with SSH:

   `git clone git@github.com:yahyaek9999-dev/appkeyone.git`

2. Enter the app:

   `cd appkeyone/saas`

3. Install dependencies:

   `npm install`

4. Generate Prisma client:

   `npx prisma generate`

5. Create local environment file:

   `cp .env.example .env.local`

   Fill real values from the project administrator. Never commit `.env` or `.env.local`.

6. Start local development:

   `npm run dev`

See `DEVELOPMENT_SETUP.md` for full setup details.

---

## Build and verification

From `saas/`:

- `npm run build` — Prisma generate + Next.js production build
- `npx prisma generate` — regenerate Prisma client
- `npx tsc --noEmit` — TypeScript verification

From repository root:

- `pwsh ./deploy/verify-production.ps1` — read-only production verification
- `keydeploy -DryRun` — deploy simulation

---

## Production deploy

Install the one-command deploy shortcut once:

`pwsh ./deploy/install-keydeploy.ps1`

Then restart PowerShell or reload your profile.

Deploy production:

`keydeploy`

Dry-run:

`keydeploy -DryRun`

`keydeploy` performs:

1. local Git checks
2. GitHub push
3. VPS backup
4. safe `git pull --ff-only origin main`
5. env verification
6. production build
7. service restart
8. health check
9. production verification

See `VPS_DEPLOY_WORKFLOW.md` for the full deploy and rollback runbook.

---

## Production safety rules

Do not commit:

- `.env` files
- WhatsApp sessions/auth files
- SQLite databases
- logs
- backups
- `.next`
- `node_modules`
- upload/runtime files
- deployment secrets

Do not run destructive Git commands on the VPS unless a fresh backup exists and you understand exactly what will be removed.

Do not restart or modify WhatsApp auth/session state unless the task explicitly requires it.

---

## Current production model

- VPS: Windows Server
- App root: `C:\app`
- SaaS service: `mse-saas` via NSSM
- WhatsApp service: `mse-wa` via NSSM
- Health endpoint: `http://127.0.0.1:3000/api/health`
- Standard deploy: `keydeploy`

---

## More documentation

- `DEVELOPMENT_SETUP.md`
- `SAFE_GIT_WORKFLOW.md`
- `VPS_DEPLOY_WORKFLOW.md`
- `TROUBLESHOOTING.md`
- `project-knowledge/INCIDENT_RESPONSE.md`
- `project-knowledge/PERFORMANCE.md`
- `project-knowledge/SCALING_PLAN.md`
