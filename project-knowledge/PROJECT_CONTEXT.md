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

- `saas/` — the Next.js 14 app (App Router, Prisma + SQLite, Tailwind). This is
  the deployed product.
  - `app/` — routes (public landing, `(auth)`, `dashboard/`, `admin/`, `api/`).
  - `components/` — UI (e.g. `hero/`, `ui/`).
  - `lib/` — `auth.ts`, `db.ts`, `i18n/`, `rbac.ts`, `admin.ts`, etc.
  - `prisma/` — schema + `prod.db` (SQLite) on the VPS.
  - `scripts/verify/` — regression verifiers (`rbac`, `schema-parity`, …).
- `whatsapp-service/` — the WhatsApp microservice (runs on `:3001`).
- `deploy/` — `build.sh`, `release.sh`, `rollback-release.sh`; wrapped by
  top-level `deploy.sh`.
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

- Production: Windows VPS `Administrator@217.154.163.16`, service **`mse-saas`**
  via nssm, app at `C:\app\saas`, releases at `C:\app\releases`, app on `:3000`.
- DB: `DATABASE_URL="file:./prod.db"` (SQLite). Prisma `5.22.0`.
- Live URL: **https://app.keyone1.com** (apex `keyone1.com` = separate marketing
  SPA).
- Health/readiness: `/api/health`, `/api/ready`.
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

- [PROJECT_STATE_2026_06_05.md](PROJECT_STATE_2026_06_05.md) — latest state snapshot.
- [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md) — the deploy contract.
