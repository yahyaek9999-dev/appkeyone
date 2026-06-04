# KEYONE Visual Replacement — 2026 Design System Rebuild

**Date:** 2026-06-04
**Type:** Presentation-only replacement (functionality preserved; zero data/logic paths touched)
**Status:** Typecheck ✅ · Production build ✅ · Regression verify ⚠️ (sandbox-blocked, see Verification)

---

## Context

Customers rejected the previous KEYONE UI: neon-green glow, AI-template aesthetics
(glowing dots, gradient KPI cards, oversized rounded-2xl glass), a 35-item sidebar,
and an information-dense dashboard. The mandate was a *visual replacement* (not a
refactor) toward a premium 2026 SaaS register in the Linear / Attio / Ramp / Vercel
family — while preserving every feature, route, and data flow.

## Strategy — token cascade, not 130 rewrites

Audit findings that shaped the approach:
- The neon base `#020806` was hardcoded in only **6 files**.
- The neon-green `brand-*` scale flowed through **82 files** via the token.
- Every screen routes presentation through ~30 semantic utilities in `globals.css`
  (`.card`, `.surface`, `.btn-*`, `.kpi-*`, `.sidebar-link`, `.input`, `.chip`…).

So the bulk of the re-skin was achieved by **redefining tokens + utilities** (keeping
all class names), which cascaded a new look into 82 files with no per-file edits.
Hardcoded green hexes/glows were then migrated by hand.

## What changed

### Design tokens — `saas/tailwind.config.ts`
- `brand-*` redefined: neon green (`#22c55e`) → **muted iris/indigo** (`#6872d4`).
  Name kept so all 82 consumers re-skin for free.
- New `canvas` scale (`#0a0a0c` / `#08080a` / `#101013`) — true-neutral near-black,
  removing the green ambient cast.
- Shadow scale flattened; **green `glow` shadow neutralised** to a soft iris ring.
- Tighter `borderRadius` (lg .625 / xl .75 / 2xl .875rem). Removed `blob` animation.

### Semantic utilities — `saas/app/globals.css`
- Body → `bg-canvas`, lighter text, refined font-features.
- All component utilities rewritten to a **flat, hairline register**: no glass blur,
  no glow, tighter radii, lighter weights (font-bold→medium/semibold), tabular KPI
  numerals, calmer color-only transitions, RTL-safe active markers. Class names
  unchanged → no consumer breakage.

### Navigation — command palette + lean sidebar
- `nav-items.tsx`: items tagged `primary` (≈7) render as always-visible flat rows;
  every secondary section is **collapsed by default** (only the active one auto-opens).
  Cuts visible menu surface ~60% with no route removed.
- **New `command-palette.tsx`** (⌘K / Ctrl+K / `/`): RBAC-filtered fuzzy search over
  all destinations, keyboard nav, RTL-aware, zero new deps.
- **New `command-trigger.tsx`**: lean "بحث سريع ⌘K" button in sidebar + mobile drawer.
- `layout.tsx` / `mobile-nav.tsx` / admin layout → `canvas` surfaces.

### Dashboard — executive workspace — `saas/app/dashboard/page.tsx`
- Restructured into three zones answering *What needs attention / What happened /
  What next*. New **"يحتاج انتباهك"** strip derived from existing data (no new queries):
  WhatsApp disconnected, inactive subscription, pending orders, flagged messages,
  quota ≥90%.
- KPI cards reworked to **monochrome/data-first** (white tabular numbers, muted
  labels, semantic color only on deltas) — replacing 5 tinted gradient cards.
- All data-fetching (`Promise.all` of ~20 prisma queries, subscription eval,
  milestones) preserved verbatim.

### Landing — `saas/app/page.tsx` + marketing components
- Hero calmed: removed neon eyebrow badge + green underline; lighter display weight.
  Real WhatsApp product mockup, before/after, social proof, ROI sections retained
  (already outcome-focused, no robots/AI imagery).
- `marketing.tsx` `AmbientBackdrop`/`AiBackground`/`BrandMark` → iris; `pricing-cards`,
  `public-nav`, `integrations-whatsapp`, `trust-section`, `(auth)/layout` de-glowed.

### Secondary surfaces
- Orders & Integrations KPI helpers: gradient tinted cards → flat `.card`.
- Customer-360 detail avatar: green→iris flat. Inbox shell + providers (toast,
  confirm) → `canvas`. Chat/playground/customer-360 panels neutralised.

## Files touched (representative)
`tailwind.config.ts`, `app/globals.css`, `app/dashboard/{layout,nav-items,mobile-nav,page}.tsx`,
`app/dashboard/command-palette.tsx` (new), `app/dashboard/command-trigger.tsx` (new),
`app/page.tsx`, `components/ui/{marketing,pricing-cards,public-nav,integrations-whatsapp,trust-section,toast,confirm-dialog}.tsx`,
`app/dashboard/{orders,integrations,customers,inbox,playground}/…`, `app/(auth)/layout.tsx`, `app/admin/layout.tsx`.

## Verification
- `npx tsc --noEmit` → **pass** (run repeatedly through the work).
- `npm run build` → **Compiled successfully**; all ~45 routes built. Only pre-existing
  Sentry deprecation warnings (unrelated).
- Final grep sweep: **zero** `rgba(34,197,94…)`, `#020806`, `shadow-glow`, `animate-blob`.
- `npm run verify:system` could **not** run in this sandbox (blocked — needs DB/network).
  Should be run in a normal shell before deploy, per CLAUDE.md. Risk is low: change is
  presentation-only; no data/logic/WhatsApp-pipeline files were modified.

## Follow-ups / not done
- No screenshot diff was produced (no browser harness in this environment). Recommend a
  visual pass on: dashboard attention strip, ⌘K palette, collapsed nav, landing hero.
- `ai-copilot-strip`, analytics/BI dashboards, and other non-named dashboard pages
  inherit the new tokens but were not individually hand-tuned.
