# KEYONE — New Production Server (LIVE)

**Date:** 2026-08-19
**Status:** ✅ Live at https://w.keyone1.com

The previous AWS host (`13.63.79.43`, eu-*) expired. A fresh server was
provisioned from scratch and the app deployed to it.

## Infrastructure

| | |
|---|---|
| Host | `ubuntu@16.171.230.84` |
| Region | `eu-north-1` (Stockholm) |
| AWS account | `873775216781` |
| Instance | `i-0e0140a43d8e403aa` · `m7i-flex.large` · Ubuntu 24.04 |
| SSH key | `~/Downloads/1.pem` (key pair "1") |
| Security group | `sg-06fd2383522f9779b` — inbound 22, 80, 443 |
| App dir | `/home/ubuntu/keyone` (Next.js, `:3000`) |
| Service | `keyone.service` (systemd, `npm start`, EnvironmentFile=.env) |
| DB | PostgreSQL 16 local — role `keyone`, db `keyone`, 175 tables |
| Edge | Caddy → `reverse_proxy localhost:3000`, auto Let's Encrypt TLS |
| Build note | `NODE_OPTIONS=--max-old-space-size=6144` + 4G swap (build OOMs otherwise) |

## DNS (Hostinger — keyone1.com zone)

- `w` A → **16.171.230.84** (updated 2026-08-19; only the `w` subdomain was touched)
- apex `@`, `www`, `app` left unchanged (apex stays on Vercel).

## Provisioning gotchas (encountered + fixed)

1. `prisma/schema.postgres.prisma` needs **`POSTGRES_DIRECT_URL`** in `.env` (not just `POSTGRES_URL`).
2. Sourcing `.env` (NODE_ENV=production) before `npm install` **skips devDependencies** →
   `typescript` missing → Next can't resolve the `@/*` tsconfig alias. Install with `--include=dev`.
3. `next build` heap-OOMs on default limit → raise `--max-old-space-size` + add swap.
4. `saas/app/admin/feature-center.tsx` statically imports
   `../../../project-knowledge/master-product-inventory.json` (outside `saas/`). That JSON
   (+ `master-feature-registry.json`) must be present at `~/project-knowledge/` on the server.

## NOT yet configured (needs real values / decisions)

- **Data**: fresh EMPTY database — no tenants/users/subscriptions. The old DB is gone; restore
  a dump if one exists, otherwise sign up fresh.
- **`.env` external keys are placeholders**: `LLM_API_KEY=REPLACE_ME` (bot AI replies won't work),
  no Meta Cloud / WhatsApp tokens, no bridge-gateway service. Fill these to enable bot + WhatsApp.
- **`AUTH_SECRET` / `SAAS_INTERNAL_SECRET`** were freshly generated on the box (in `~/keyone/.env`).

## Security

- The AWS **root** access key in `~/Downloads/rootkey.csv` was used for provisioning. Rotate/delete
  it in IAM and switch to a scoped IAM user; remove the plaintext CSV.

## Redeploy

`deploy/release-aws.sh` defaults now point here (`ubuntu@16.171.230.84`, key `~/Downloads/1.pem`).
