# KEYONE Production Platform

KEYONE is a production WhatsApp/commerce SaaS platform with a Next.js dashboard, automation APIs, commerce integrations, and a separate WhatsApp runtime service.

- **GitHub is the source of truth**
- **`main` is production**
- **Production runs on AWS Linux (`ubuntu@13.63.79.43`, `w.keyone1.com`), deployed via `deploy/release-aws.sh`** — see [project-knowledge/DEPLOYMENT_RULES.md](project-knowledge/DEPLOYMENT_RULES.md) for the full deploy contract. The Windows-VPS/`keydeploy` workflow described in older docs (`VPS_DEPLOY_WORKFLOW.md`, `DEVELOPMENT_SETUP.md`) is retired — do not use it.
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

- `deploy/release-aws.sh <commit-ish>` — deploy a specific commit to production (idempotent)

---

## Production deploy

```bash
deploy/release-aws.sh                 # deploys HEAD
deploy/release-aws.sh <commit-ish>    # deploys a specific commit
```

`git archive`s `saas/` and `bridge-gateway/` at the pinned commit, `rsync`s them to the AWS box, runs `npm install` + `prisma generate` + `prisma db push` (additive-only) + `next build` on the server, then restarts `keyone.service` + `keyone-bridge-gateway.service`. See [project-knowledge/DEPLOYMENT_RULES.md](project-knowledge/DEPLOYMENT_RULES.md) for the full contract, pre-deploy gates, and post-deploy verification checklist. The Bridge customer daemon (`bridge-node/`) is a separate artifact published with `deploy/publish-wwebjs.sh` — never by the script above.

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

- Host: AWS Linux (eu-north-1), `ubuntu@13.63.79.43` (`w.keyone1.com`)
- App dir: `~/keyone`
- Services (systemd): `keyone.service` (Next.js, `:3000`), `keyone-bridge-gateway.service` (Bridge WS ingress, `:3002`), `keyone-wa.service` (legacy QR transport, `:3001`)
- Database: PostgreSQL (`schema.postgres.prisma`) — not SQLite
- Health endpoint: `https://w.keyone1.com/api/health`, readiness: `https://w.keyone1.com/api/ready`
- Standard deploy: `deploy/release-aws.sh`

See [project-knowledge/PROJECT_CONTEXT.md](project-knowledge/PROJECT_CONTEXT.md) for the full orientation doc.

---

## More documentation

- `DEVELOPMENT_SETUP.md`
- `SAFE_GIT_WORKFLOW.md`
- `VPS_DEPLOY_WORKFLOW.md`
- `TROUBLESHOOTING.md`
- `project-knowledge/INCIDENT_RESPONSE.md`
- `project-knowledge/PERFORMANCE.md`
- `project-knowledge/SCALING_PLAN.md`
