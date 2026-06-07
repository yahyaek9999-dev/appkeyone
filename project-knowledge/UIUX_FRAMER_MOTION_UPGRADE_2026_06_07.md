# UI/UX Upgrade — Framer Motion + UI Pro Max Skill

**Date:** 2026-06-07
**Scope:** Landing page (`app/page.tsx`) + all 47 dashboard pages (global) + 5 high-traffic dashboard pages (deep)
**Mode:** Additive only. No working systems rewritten. WhatsApp send pipeline untouched.

---

## 1. What was done

### New reusable UI components (additive — `components/ui/`)
| File | Purpose |
|------|---------|
| `border-beam.tsx` | Animated light sweep along a container border (CTA accent). Reduced-motion safe (renders nothing). |
| `spotlight-card.tsx` | Card with a cursor-tracking radial spotlight + hover border lift. Used by the features grid. |
| `animated-counter.tsx` | Count-up number on scroll-into-view (`useSpring` + `useInView`). Available for future KPI use. |
| `stagger-reveal.tsx` | `FadeInView`, `StaggerReveal`, `StaggerItem` — scroll-reveal primitives. **Reduced-motion guarded** (return plain `<div>`). |
| `glowing-effect.tsx` | `GlowingEffect` (hover drop-shadow) + `PulseGlow` (ambient pulse). |
| `animated-features-grid.tsx` | Staggered spotlight-card grid for feature lists. Accepts **pre-rendered icon nodes** (see Gotcha #1). |
| `animated-stats-section.tsx` | Stats strip with staggered entrance (client island fed by server data). |
| `app/dashboard/page-transition.tsx` | Global per-route fade/slide for the dashboard, keyed by `usePathname`. Reduced-motion safe. |

### Design tokens (`tailwind.config.ts`)
Added keyframes/animations (additive — existing ones untouched): `pulse-glow`, `shimmer`, `float-up`, `gradient-x`.

### Landing page (`app/page.tsx`)
- Stats strip → `AnimatedStatsSection` (staggered).
- Outcomes & How-it-works → `StaggerReveal` / `StaggerItem`.
- Features → `AnimatedFeaturesGrid` (spotlight cards).
- Section headers → `FadeInView`.
- CTA → `BorderBeam` accent.
- All prior content/markup preserved.

### Dashboard — global (all 47 pages)
- `PageTransition` wraps `{children}` in `app/dashboard/layout.tsx`. Every route now fades/slides in uniformly. **Zero per-page edits** for the global effect.

### Dashboard — deep (5 high-traffic pages)
- `dashboard/page.tsx` (overview): money band, activity/drivers, orders/messages, insight cards wrapped in `FadeInView` with staggered delays.
- `orders/page.tsx`: table card revealed.
- `customers/page.tsx`: list/empty-state revealed.
- `leads/page.tsx`: list/empty-state revealed.
- `analytics/analytics-ui.tsx`: metric group, chart, distributions revealed.

### Bug fixed along the way (CLAUDE.md priority #1)
- `analytics-ui.tsx` line 83: label was `"الرسائل ({data.days} يوم)"` (double quotes → literal `{data.days}` shown to users). Changed to a template literal so the day count renders.

---

## 2. Gotchas captured (for future work)

**Gotcha #1 — Server→Client serialization.**
Dashboard/landing pages are Server Components. Passing a **lucide icon component (a function)** as a prop to a Client Component throws *"Functions cannot be passed directly to Client Components."* Fix: pre-render the icon in the server (`<Icon className=... />`) and pass it as a `React.ReactNode`. `AnimatedFeaturesGrid` was designed around this.

**Gotcha #2 — Reveal wrappers gate visibility on JS.**
`motion` `initial={{opacity:0}}` means content is invisible until hydration fires `useInView`. Acceptable for the authenticated dashboard (JS required anyway) and matches the existing public-site pattern. All reveal primitives now short-circuit to plain `<div>` under `prefers-reduced-motion`.

**Gotcha #3 — `space-y` layout preserved.**
Wrapping top-level blocks in `FadeInView` keeps them as direct children of the `space-y-*` column, so vertical rhythm is unchanged.

---

## 3. Safety checks

- [ ] `npx tsc --noEmit` — typecheck
- [ ] `npm run build`
- [ ] `npm run verify:all` — regression
- [ ] Deploy (SSH) after all green

> Note: the build/verify run was temporarily blocked by a transient classifier outage in the dev harness; commands re-run once available. Status updated in the session.

---

## 4. Files changed

**New:** 8 components listed above.
**Modified:** `tailwind.config.ts`, `app/page.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/orders/page.tsx`, `app/dashboard/customers/page.tsx`, `app/dashboard/leads/page.tsx`, `app/dashboard/analytics/analytics-ui.tsx`.

**Not touched:** WhatsApp send pipeline, any API route, any data/business logic.
