# KEYONE — Deployment Rules

The deploy contract for the KEYONE SaaS. Derived from `CLAUDE.md` and
`deploy/release-aws.sh`.

> **Updated 2026-07-12** — this file previously described the Windows VPS
> (`Administrator@217.154.163.16`, nssm, SQLite `prod.db`). That box is
> **retired**. Production is the AWS Linux host below; the deploy mechanism,
> database engine, and service manager are all different from what used to be
> documented here. If you find another doc still referencing the Windows VPS,
> it is stale — trust this file and `deploy/release-aws.sh`/`deploy/RUNBOOK.md`.

---

## 0. Golden rules (never violate without explicit approval)

- **Never modify the WhatsApp send pipeline** without explicit owner approval
  (CLAUDE.md).
- **Never rewrite working systems.** Prefer additive changes.
- **Database changes are additive-only, automatic, and fail-safe.** The deploy
  script runs `prisma db push` (no `--accept-data-loss`) — it aborts on any
  destructive change rather than dropping data. Never hand-run a destructive
  migration against production without the owner's explicit sign-off.

---

## 1. Pre-deploy gates (must pass, in order)

From `saas/`:

1. **Typecheck** — `npx tsc --noEmit`
2. **Build** — `npm run build` (`prisma generate && next build`). Locally this
   requires a real `POSTGRES_URL` (the schema is `prisma/schema.postgres.prisma`,
   selected via the `"prisma"."schema"` key in `package.json` — the checked-in
   `prisma/schema.prisma` with `provider = "sqlite"` is a stale, unused
   leftover). Without a reachable Postgres, `/login`, `/signup`, and
   `/team/accept` fail to statically prerender (they call `siteConfig.upsert()`
   at build time) — this is a **local-environment gap only**; the real deploy
   build always runs on the server where `POSTGRES_URL` is correctly set.
3. **Regression verification** — run whatever `verify:*` scripts exist for the
   area you touched; do not deploy on a red typecheck or build regardless.

Never deploy if typecheck or the server-side build fails.

---

## 2. Deploy (single command, idempotent)

```bash
deploy/release-aws.sh                 # deploys HEAD
deploy/release-aws.sh <commit-ish>    # deploys a specific commit
```

What it does:
1. Refuses on a dirty working tree unless `ALLOW_DIRTY=1` (not recommended).
2. `git archive`s `saas/` and `bridge-gateway/` at the pinned commit, `rsync`s
   them to the server (excludes `node_modules`, `.next`, `.env*`, `*.db`,
   uploads).
3. On the server: `npm install` → `prisma generate --schema
   prisma/schema.postgres.prisma` → `prisma db push` (additive-only, aborts on
   any destructive change) → `next build` (previous `.next` is backed up and
   restored automatically if the build fails — a failed build never restarts
   the service) → gateway deps → `sudo systemctl restart keyone.service
   keyone-bridge-gateway.service`.
4. Verifies `GET /api/health` returns `{"status":"ok"}` and the server's
   `DEPLOYED_COMMIT` file matches the pinned SHA.

The WhatsApp send pipeline is untouched by this script; `BRIDGE_ENABLED` stays
whatever the server `.env` already says.

---

## 3. The customer Bridge is a SEPARATE artifact — not deployed by the above

`bridge-node/keyone-wa-bridge.js` runs on **customer machines**, not the
server. Publish it with:

```bash
bash deploy/publish-wwebjs.sh <version>   # e.g. 1.0.11
```

This builds macOS (arm64 + x64 `.pkg`), Windows (`.zip`), Linux (amd64 + arm64
`.deb`), and the self-update `app.tar.gz`, uploads to the download store on the
same AWS box, and writes `version.json` + `checksums.txt`. **Bump `const
VERSION`** in `keyone-wa-bridge.js` before every publish — see
`KEYONE_BRIDGE_SUPPORT_RUNBOOK.md` §8 for why a stale VERSION string is a
release blocker (infinite auto-update loop). If the script touches any
`.ps1` file with non-ASCII characters, verify it carries a UTF-8 BOM
(`xxd file.ps1 | head -1` → `efbb bf`) before publishing — Windows PowerShell
5.1 corrupts BOM-less non-ASCII scripts.

---

## 4. Post-deploy verification checklist

- `GET /api/health` → `{"status":"ok","db":"ok"}`, and the server's
  `DEPLOYED_COMMIT` equals your pinned SHA.
- Public pages return **200**: `/`, `/login`, `/signup`.
- Auth-gated pages return **307 → /login** when unauthenticated:
  `/dashboard`, `/dashboard/settings/bridge`, `/dashboard/playground`,
  `/dashboard/ai-audit`.
- `sudo journalctl -u keyone.service -u keyone-bridge-gateway.service --since
  '10 minutes ago' -p err` → no new entries.
- If the Bridge was republished: `curl
  https://w.keyone1.com/downloads/keyone-bridge/version.json` shows the new
  version, and every platform artifact under `installers`/`platforms`
  returns `200` on a `HEAD` request.

---

## 5. Infra / connection facts

- Host: `ubuntu@13.63.79.43` (`w.keyone1.com`), key `~/Downloads/keyone.pem`.
- Services (systemd): `keyone.service` (Next.js, `:3000`),
  `keyone-bridge-gateway.service` (WS ingress, `:3002`), `keyone-wa.service`
  (legacy co-located QR transport, `:3001`).
- App dir: `~/keyone`. Bridge gateway: `~/bridge-gateway`. Download store:
  `/var/www/keyone-downloads/keyone-bridge`, served by Caddy.
- Database: PostgreSQL, `POSTGRES_URL` in `~/keyone/.env` (**not** SQLite —
  `prisma/schema.prisma`'s sqlite provider is unused; the real schema is
  `prisma/schema.postgres.prisma`).
- Edge: Caddy terminates TLS for `w.keyone1.com`, reverse-proxies `/` → `:3000`,
  `/bridge` → `:3002`, `/downloads` → the static store.

---

## 6. Rollback

`deploy/release-aws.sh` has no dedicated rollback flag. To roll back:
```bash
deploy/release-aws.sh <previous-good-commit-sha>
```
A failed build during the deploy itself already self-heals (previous `.next`
is restored automatically and the service is never restarted onto broken
code) — a rollback is only needed if a *successfully deployed* commit turns
out to be behaviorally wrong after the fact.

---

## 7. Server hygiene (added 2026-07-12, after finding real orphan cruft)

Testing directly against the production box (throwaway Bridge tokens,
manually-run binaries, planted test processes) is a legitimate way to get
real-runtime evidence, but it **must be cleaned up in the same session**:
- Delete any `Bridge`/`BridgeToken`/`BridgeTransport` rows created for testing.
- Kill any manually-started `node .../keyone-wa-bridge.js` process and its
  Chromium child explicitly — `kill -9` on the Node parent does **not** kill
  the Chromium child (orphans it; this happened during testing and cost real
  RAM for hours before being noticed). Prefer a graceful `SIGTERM` (triggers
  the daemon's own shutdown handler, which tears down Chromium correctly), or
  if a hard kill is unavoidable, also kill any matching Chromium process by
  its `--user-data-dir` afterward.
- Remove scratch directories under `/tmp/`.
- A leftover `keyone-wa-bridge.service` systemd unit or `/opt/keyone-wa-bridge`
  install directory on the **server itself** should never exist — the Bridge
  is customer-installed only; a server-side install is always test debris.
