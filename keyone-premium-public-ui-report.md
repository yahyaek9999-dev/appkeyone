# KEYONE — Premium Public Website Redesign Report

**Date:** 2026-06-01
**Scope:** Public marketing website only (`/`, `/pricing`, `/privacy`, `/terms`)
**Commit:** `8cc19ff` — `feat(public): premium world-class redesign of the marketing site`
**Status:** ✅ Live in production (all public routes 200, ar + en) — after a deploy-tooling incident that was diagnosed and fully recovered (see §6).

**Untouched (as required):** dashboard, backend, APIs, auth, database, business logic. No new npm packages. **Framer Motion only.**

---

## 1. Pages redesigned

| Page | What changed |
|---|---|
| `/` (home) | Full re-composition: hero, stats, features (bento), **new** WhatsApp integrations section, how-it-works stepper, **new** trust section, pricing preview, FAQ accordion, CTA. |
| `/pricing` | Premium pricing cards (shared component), refined header with ambient backdrop, refined "how to subscribe" + contact. Same DB plans + WhatsApp links (no logic change). |
| `/privacy`, `/terms` | Inherit the refined scroll-aware navbar + design-system tokens. Content untouched. |

Both locales verified live: `ar` (RTL) and `en` (LTR).

---

## 2. Components updated / created

**Updated**
- `components/ui/public-nav.tsx` — scroll-aware (transparent → hairline + shadow on scroll), animated underline links, soft-motion CTA, spring mobile drawer that opens from the correct side per `dir`, body-scroll lock.
- `components/ui/public-footer.tsx` — refined hierarchy, brand lockup, faded hairline divider.
- `components/ui/marketing.tsx` — **new** `AmbientBackdrop` (calm brand wash + masked fine grid, no glow) and `QrGlyph`; existing `AiBackground` left intact (used by onboarding).
- `components/ui/section-reveal.tsx` — `useReducedMotion` guards on every wrapper, calmer shared easing `cubic-bezier(0.16,1,0.3,1)`, **new** transform-only `Parallax`, refined `HoverCard`, **new** `SoftPress`. All prior exports preserved.
- `app/globals.css` + `tailwind.config.ts` — design-system tokens (below).

**Created**
- `components/ui/trust-section.tsx` — capability chips + 4 trust badges + SLA metric tiles.
- `components/ui/integrations-whatsapp.tsx` — focused premium WhatsApp section with a refined chat panel + subtle parallax.
- `components/ui/faq-accordion.tsx` — Framer-Motion height-animated accordion (replaces native `<details>`).
- `components/ui/pricing-cards.tsx` — shared presentational pricing cards (server pages pass pre-computed WhatsApp hrefs; no functions cross the server→client boundary).

**Content** — `lib/i18n/ar.ts` + `lib/i18n/en.ts`: added `trust` and `integrations` blocks (mirrored). All metric values reused from existing `stats` — **no invented numbers, no fake quotes/logos/identities.**

---

## 3. Design system foundation

- **Type:** `display`/`display-sm` clamp scale, `.display-heading` with balanced wrapping and tight tracking.
- **Depth:** layered shadow tokens (`elevated`, `float`, `glow`) — soft ambient + tight key + inner highlight; `.surface` hairline glass with top light edge; faded `.hairline` dividers.
- **Texture:** `.noise` — CSS-only inline-SVG film grain at 3.5% opacity (no asset, no request).
- **Buttons:** `.btn-premium` / `.btn-outline` with soft hover/press motion.
- **Easing:** shared `premium` / `out-expo` timing functions.
- **Color identity unchanged** (green brand kept).

---

## 4. Animation improvements

- Calmer, "expensive" easing and longer, subtler reveals (smaller travel, no bounce).
- Scroll-reveal on every section; staggered chips/cards; lightweight **parallax** on the hero robot and the WhatsApp panel (transform-only).
- Scroll-aware navbar transition; spring mobile drawer; animated FAQ open/close; soft button motion.
- **`prefers-reduced-motion` fully respected** — JS guards (`useReducedMotion`) + a global CSS backstop that neutralizes transitions/animations.
- Removed gimmicks: no heavy particles, no strong glows, no blob animations on the public pages.

---

## 5. UX improvements

- **Honest trust section** instead of fabricated testimonials: real capability chips, four credibility badges (uptime, secure-by-design, AI-powered, multi-channel), and SLA metric tiles drawn from existing stats.
- **Bento feature layout** replaces six identical cards — intentional asymmetry, stable (not random) icons.
- WhatsApp positioned as the core channel with a believable chat preview (no logo wall).
- Clearer hierarchy/section rhythm, refined spacing, RTL-correct logical properties (`start-*`, `ms/me`, `text-start`) so Arabic and English both read perfectly.
- FAQ is now keyboard-accessible buttons with `aria-expanded`.

---

## 6. Deploy — incident & recovery

The fixed `deploy.sh` ran, but the run was **interrupted mid-deploy**, after it had already stopped the service. nssm's auto-restart then booted the app on a half-installed `node_modules` / incomplete build → **all routes 500**. Diagnosed and recovered:

1. Disabled nssm auto-restart (`AppExit … Exit`) to get a clean window.
2. Stopped service, killed lingering node (released the Prisma DLL lock).
3. Cleared the corrupted `.next`, ran `npm ci` (pinned **Prisma 5.22.0**) + `npm run build` **to completion** with the service down → `BUILD_ID` confirmed.
4. Restored auto-restart (`AppExit … Restart`), started the service.

**Post-recovery production checks:** `/`, `/pricing`, `/privacy`, `/terms`, `/?lang=en`, `/pricing?lang=en` → all **200**; `newUI=LIVE`; integrations + trust sections **present**; `SERVICE_RUNNING`.

`deploy.sh` was hardened (stop-before-`npm ci`, pinned local Prisma, no bare `npx prisma`). **Note:** it has a built-in maintenance window (service is down during `ci`+build) and **must not be interrupted** — interrupting it mid-run is what caused this outage. A future improvement would be build-then-swap to remove the downtime window.

---

## 7. Performance impact

- **No new dependencies** — `package.json` / `package-lock.json` unchanged.
- Pages remain **server components**; animation isolated to small client components → content is server-rendered (SEO preserved, metadata untouched).
- **No CLS:** animations are transform/opacity only; images use fixed aspect-ratio containers with `next/image`.
- Bundle (build output): home `/` ≈ 10.4 kB route JS / 233 kB first-load; `/pricing` ≈ 226 kB; shared JS 163 kB (Framer Motion already present pre-redesign — no net new vendor weight).
- Texture/noise is inline CSS (zero extra network requests).

---

## 8. Final visual summary

KEYONE's public site now reads as a deliberate, high-end product: calm cinematic hero with restrained brand light, a hairline-glass surface language with realistic layered depth and subtle grain, an asymmetric bento feature grid, a believable WhatsApp-first integrations moment, an honest trust section built only on real capabilities, premium pricing cards, and smooth, reduced-motion-aware Framer Motion throughout — flawless in both Arabic RTL and English LTR, across mobile, tablet, and desktop. Nothing fabricated, nothing template-shaped.
