# KEYONE — Project Context

Orientation doc for anyone (human or agent) picking up the KEYONE project.

---

## What KEYONE is

A **production** WhatsApp automation + business-intelligence SaaS for stores and
businesses. It auto-replies to customers 24/7, detects and tracks orders,
broadcasts campaigns, and surfaces operational insights. UI is **primarily Arabic
(RTL)**, with an English locale available.

---

## Repository layout

- `saas/` — the Next.js 14 app (App Router, Prisma + **PostgreSQL**, Tailwind).
  This is the deployed product.
  - `app/` — routes (public landing, `(auth)`, `dashboard/`, `admin/`, `api/`).
  - `components/` — UI (e.g. `hero/`, `ui/`).
  - `lib/` — `auth.ts`, `db.ts`, `i18n/`, `rbac.ts`, `admin.ts`, etc.
  - `prisma/` — **dual-schema, deliberately kept in lock-step, not a leftover**
    (corrected — an earlier pass through this doc mischaracterized it):
    `schema.prisma` (sqlite) is the hand-edited source; `bash
    scripts/generate-pg-schema.sh` derives `schema.postgres.prisma` from it
    (swaps the provider/datasource only); `node scripts/verify/schema-parity.js`
    structurally diffs both and fails the build on drift (154 models, verified
    in lock-step as of 2026-07-12). **Only `schema.postgres.prisma` is ever
    actually applied** — it's pinned via the `"prisma"."schema"` key in
    `package.json`, so every `prisma generate`/`db push`/`studio` command, and
    `deploy/release-aws.sh`, targets it. Workflow for a schema change: edit
    `schema.prisma`, run `generate-pg-schema.sh`, run `schema-parity.js` to
    confirm no drift, then deploy (which regenerates the Postgres client from
    `schema.postgres.prisma`).
  - `scripts/verify/` — regression verifiers (`rbac`, `schema-parity`, …).
- `whatsapp-service/` — the legacy co-located QR WhatsApp transport (systemd
  `keyone-wa.service`, `:3001`) — still the reference behavior the Bridge
  transport must match.
- `bridge-node/` — the current WhatsApp Bridge (`keyone-wa-bridge.js`,
  whatsapp-web.js + headless Chromium), customer-installed. Replaced an
  earlier Go/whatsmeow bridge (whatsmeow/Baileys pairing was rejected by
  WhatsApp for reimplemented multi-device clients).
- `bridge-gateway/` — standalone WS ingress (systemd
  `keyone-bridge-gateway.service`, `:3002`) relaying between Bridges and the
  Cloud.
- `deploy/` — current: `release-aws.sh` (Cloud+gateway), `publish-wwebjs.sh`
  (Bridge). `build.sh`/`release.sh`/`rollback-release.sh`/top-level
  `deploy.sh` target the **retired** Windows VPS — do not use them.
- `project-knowledge/` — reports, audits, and these state/context/rules docs.

---

## Auth model

- Session is a JWT cookie **`mse_session`** (HS256, signed with `AUTH_SECRET`).
- Two payload shapes: owner `{uid}` and team-member `{mid}`.
- `getAuthContext()` in `saas/lib/auth.ts` resolves the principal; member sessions
  still scope all data to the **owner** User row.
- RBAC via `saas/lib/rbac.ts` — `can(role, permission)`. Page/route guards:
  `requirePagePermission`, `requirePermission`, `getUserIdForPermission`.

---

## Navigation (dashboard)

- Workspace model in `saas/app/dashboard/nav-items.tsx`: **8 workspaces** —
  `home`, `sales`, `customers`, `ai` (label "ذكاء الأعمال", short "الرؤى"),
  `growth`, `ops`, `data`, `settings` — covering **38 routes**.
- Desktop chrome = slim icon **rail** + **contextual panel** (only the active
  workspace's items show). Mobile = full **drawer**. **⌘K** command palette indexes
  every route.
- `NAV_ITEMS` and `NAV_SECTIONS` are **derived from `WORKSPACES`** — single source
  of truth. Add a route by adding it to a workspace's `items`.

---

## Hero (landing)

- `saas/components/hero/hero-section.tsx` composes `HeroVideo` + ambient layers
  (glows, grid, light sweep, particles) + CTA buttons.
- `saas/components/hero/hero-video.tsx` takes `src` (desktop/tablet, ≥768px) and
  optional `mobileSrc` (phones, <768px). Both `<video>` elements share one
  `object-cover` frame; visibility is toggled with `max-md:hidden` / `md:hidden`
  to avoid CLS. Desktop = `/vedio.mp4`, mobile = `/mobile.mp4`.

---

## Infrastructure

> **Corrected 2026-07-12** — this section previously described the Windows VPS
> (`Administrator@217.154.163.16`, nssm, SQLite). That box is retired; the
> section below is verified against the live server, not carried over from an
> old doc.

- Production: AWS Linux (eu-north-1), host `ubuntu@16.171.230.84`
  (`w.keyone1.com`), key `~/Downloads/1.pem`.
- Services (systemd): `keyone.service` (Next.js, `:3000`),
  `keyone-bridge-gateway.service` (Bridge WS ingress, `:3002`),
  `keyone-wa.service` (legacy co-located QR transport, `:3001`). Caddy
  terminates TLS and reverse-proxies `/` → `:3000`, `/bridge` → `:3002`,
  `/downloads` → the Bridge download store.
- DB: PostgreSQL, `POSTGRES_URL` in `~/keyone/.env` — **not** SQLite.
- Live URL: **https://w.keyone1.com**. `keyone1.com` (apex) also resolves
  (200) and serves separately; `app.keyone1.com` (an older doc's claimed live
  URL) does not resolve at all — confirmed dead, do not use it anywhere
  (marketing links, OG tags, emails).
- Health/readiness: `/api/health` (`{"status":"ok","db":"ok"}`) and `/api/ready`
  (`{"ready":bool,"verdict":..., "checks":[db, schema, outgoing_queue]}`) —
  both confirmed live.
- See [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md) before any deploy.

---

## Working priorities (from CLAUDE.md)

1. Fix broken functionality
2. Improve UX
3. Improve onboarding
4. Improve integrations
5. Improve reliability
6. Improve scalability
7. Add features

**Never rewrite working systems. Always prefer additive changes. Always run
typecheck + build + regression verification before deploy. Never assume
integrations work — verify end-to-end. Never modify the WhatsApp send pipeline
without explicit approval. Always put reports in `project-knowledge/`.**

---

## Related

- [PROJECT_STATE_2026_06_05.md](PROJECT_STATE_2026_06_05.md) — superseded point-in-time snapshot from 2026-06-05, kept for historical record only. This file (PROJECT_CONTEXT.md) is the current orientation doc.
- [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md) — the deploy contract.
