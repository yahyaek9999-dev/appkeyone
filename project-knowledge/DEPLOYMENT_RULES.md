# KEYONE — Deployment Rules

The deploy contract for the KEYONE SaaS. Derived from `CLAUDE.md`, the deploy
scripts under `deploy/`, and hard-won lessons (see the 2026-06-05 Prisma-engine
incident in [PROJECT_STATE_2026_06_05.md](PROJECT_STATE_2026_06_05.md)).

---

## 0. Golden rules (never violate without explicit approval)

- **Never modify the WhatsApp send pipeline** without explicit owner approval
  (CLAUDE.md).
- **Never rewrite working systems.** Prefer additive changes.
- **Code-only deploys must not touch the database** (see §4).

---

## 1. Pre-deploy gates (must pass, in order)

From CLAUDE.md, run from `saas/`:

1. **Typecheck** — `npx tsc --noEmit`
2. **Build** — `npm run build` (`prisma generate && next build`)
3. **Regression verification** — at minimum `npm run verify:rbac` and
   `npm run verify:schema-parity`. (`verify:all` includes
   `reliability:wa-service` which fails locally when the WA microservice on
   :3001 isn't running — that failure is environmental, ignore it.)

Never deploy if any of these fail.

---

## 2. Build the artifact (from current HEAD only)

- **Delete any stale `release.tar.gz` first.** A stale artifact from a previous
  day was almost shipped this session — `deploy/release.sh` will reuse an existing
  `release.tar.gz` if present instead of rebuilding.
- Build fresh: `bash deploy/build.sh` (typecheck → prisma generate → next build →
  prune dev deps → package → restore dev deps).
- `deploy/build.sh` copies `public/*` into the artifact, so new static assets
  (e.g. `mobile.mp4`, `logo.png`) ship automatically.
- The release name embeds the **git short SHA** (`keyone-<sha>-<date>`); the live
  SHA is exposed at `/api/health` → `version`. Verify the deployed SHA matches
  your HEAD.

---

## 3. The Prisma-engine rule (CRITICAL)

The artifact is **built on macOS** and carries a darwin query engine
(`libquery_engine-darwin-arm64.dylib.node`). The production VPS is **Windows**.

> **After swapping code on the VPS you MUST run `prisma generate` on the VPS** to
> produce `query_engine-windows.dll.node`. Otherwise `@prisma/client` imports fine
> but every query fails → DB unreachable, even though the service shows
> `SERVICE_RUNNING` and `@prisma/client` "loads OK".

- `prisma` (the CLI) is a **devDependency** and is pruned from the artifact.
  Install it transiently before generate:
  `npm install prisma@<version> --no-save` then `npx prisma generate`.
  (Current version: `5.22.0`.)
- `prisma generate` regenerates the **client/engine only**. It does **not** touch
  the database. It is safe under code-only rules.
- Verify after generate: `node_modules\.prisma\client\` should contain
  `query_engine-windows.dll.node`.

---

## 4. Forbidden during a code-only deploy

Explicit prohibitions (enforced 2026-06-05):

- No DB modification of any kind.
- No `prisma db push`.
- No `prisma migrate`.
- No changes to `DATABASE_URL` or any `.env` value.
- No overwriting `prod.db`.
- No touching: users, plans, subscriptions, customers, orders, messages,
  integrations, automations.

`prisma generate` is the **only** Prisma command allowed in a code-only deploy.

If any required step would modify the database: **STOP and report to the owner
first.**

---

## 5. node_modules swap caution

- Copying `node_modules` to the Windows VPS via `Copy-Item` is slow and has
  **hung repeatedly**.
- **Do not `Remove-Item node_modules` before** a `Copy-Item` that may hang — that
  is exactly what bricked the engine on 2026-06-05.
- When dependencies are unchanged between commits, prefer **keeping** the existing
  VPS `node_modules` and only swapping `.next` + `public` + `prisma generate`.
- If you must copy large trees on Windows, prefer `robocopy` over `Copy-Item`.

---

## 6. Post-deploy verification checklist

- `GET /api/health` → `status:ok`, `db:ok`, `version` == your SHA.
- `GET /api/ready` → `ready:true`, `verdict:ready` (db, schema, outgoing_queue ok).
- Public pages return **200**: `/`, `/login`, `/signup`, `/pricing`.
- Auth pages return **307 → /login**: `/dashboard`, `/dashboard/customers`,
  `/dashboard/orders`, `/dashboard/integrations`, `/dashboard/automations`,
  `/admin`.
- Feature-specific checks for what you shipped (e.g. confirm both hero `<video>`
  tags + responsive classes in prod HTML; logo served via `/_next/image`).

---

## 7. Infra / connection facts

- Host: `Administrator@217.154.163.16` (port 22), Windows VPS.
- Service: `mse-saas` via **nssm** (`nssm stop|start|status mse-saas`).
- App dir: `C:\app\saas`. Releases: `C:\app\releases`. DB: `file:./prod.db`.
- App listens on `:3000`.

---

## 8. Rollback

- `./deploy.sh --rollback` (→ `deploy/rollback-release.sh`).
- A `C:\app\releases\previous` backup dir **may or may not exist** — it was
  **absent** on 2026-06-05. Do not assume rollback has a backup to restore;
  verify first.
