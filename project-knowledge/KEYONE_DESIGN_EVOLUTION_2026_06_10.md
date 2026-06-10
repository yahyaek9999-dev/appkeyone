# KEYONE Design Evolution — 2026-06-10

Follow-up polish pass on top of commit `4d631bc` (emerald+gold brand unification).
Scope: evolution, not redesign. Hero video, WhatsApp pipeline, auth logic, APIs,
and schema untouched. 12 files changed, 1 file added, all changes additive or
subtractive (dead code), zero new dependencies.

## Why this pass

After the brand unification, the remaining "template-generated" feel was
concentrated in four places:

1. **Auth screens** bypassed the design system entirely (flat off-system
   buttons, `"..."` loading text, `red-*` error palette, plain card shells).
2. **No route-level loading states** anywhere in the app. Every /dashboard/*
   navigation hit a blank screen while force-dynamic Prisma queries ran.
3. **Dead template artifact**: a ~90-line div-built fake WhatsApp screenshot
   (`WhatsAppProductMockup`) sat unused in `app/page.tsx`.
4. **Copy register**: Latin em-dashes (—) scattered through Arabic and English
   marketing copy — an AI-generated-copy tell that also typesets poorly in RTL.

## Changed files

| File | Change |
|---|---|
| `saas/app/(auth)/login/page.tsx` | `.surface` card, `.btn-primary` submit with Loader2 spinner state, rose error register, `role="alert"`, label `htmlFor`/`id` pairs, autocomplete hints, gold-edged icon shell |
| `saas/app/(auth)/signup/page.tsx` | Same treatment + `new-password` autocomplete, pending-state card on `.surface` |
| `saas/app/dashboard/loading.tsx` | **NEW** — page-agnostic skeleton (header → metric band → content cards) shown for every /dashboard/* navigation; built from existing `Skeleton` primitives; `aria-busy` |
| `saas/app/page.tsx` | Removed unused `WhatsAppProductMockup` + 6 unused icon imports; testimonial copy de-dashed |
| `saas/lib/i18n/ar.ts` | 9 em-dash strings → Arabic comma / period |
| `saas/lib/i18n/en.ts` | 7 em-dash strings → colon / comma / period |
| `saas/app/pricing/page.tsx` | Hero/matcher/matrix subtitles + WA prefill templates de-dashed |
| `saas/app/projects/page.tsx` | Metadata + hero sub de-dashed; sector labels use `·` |
| `saas/components/ui/public-nav.tsx` | "Get started" CTA (desktop + drawer) unified to gradient button register (`from-brand-500 to-brand-700`, inset highlight ring, gold hover ring); focus-visible gold rings added to desktop links, drawer links, drawer CTAs |
| `saas/app/dashboard/whatsapp/whatsapp-ui.tsx` | QR `h-52 w-52 sm:h-64 sm:w-64` (mobile-audit item — was 71% of a 360px viewport); error/service banners moved from `red-*` to system `rose-*` |

## UX improvements

- First-session impression (login/signup) now matches the premium register the
  rest of the product established; submit buttons communicate progress instead
  of `"..."`.
- Perceived performance: skeleton appears instantly on dashboard navigation
  instead of a frozen screen (covers all 38 dashboard routes via one boundary).
- Keyboard users get visible gold focus rings across the public nav and drawer
  (was: none on drawer, none on desktop links).
- Browser autofill works correctly on auth forms (`autoComplete` +
  `htmlFor`/`id` associations, which also fix label→input a11y mapping).

## Mobile improvements

- QR connect screen no longer dominates small viewports (208px ≤640px, 256px above).
- Drawer CTAs share the same gradient/focus treatment as desktop.

## Verification

- `npx tsc --noEmit` — clean
- `npm run build` — ✓ Compiled, ✓ 96/96 pages generated
- `npm run verify:rbac` — PASS (136 routes scanned)
- `npm run verify:schema-parity` — ✓ 60 models in lock-step

## Deliberately NOT changed

- Hero video component and assets (approved, locked)
- Dashboard `—` placeholders for empty numeric values (standard data-UI convention)
- Pricing experience components (rebuilt + re-skinned recently; already on-system)
- IA, routes, nav labels, form field names (analytics/SEO stability)
