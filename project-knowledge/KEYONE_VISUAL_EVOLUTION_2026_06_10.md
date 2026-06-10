# KEYONE High-Impact Visual Evolution — 2026-06-10

A visible transformation pass (not internal polish) on top of the emerald+gold
brand system. Goal: make the platform read Stripe / Linear / Intercom-level the
moment you open it. Hero video, auth, APIs, DB, WhatsApp untouched.

## Root cause of the "generic SaaS" feeling

The components were already sophisticated (pointer-tracked glow cards, premium
pricing toggle, hero parallax). The template feel came from four things, all
addressed here:

1. **Timid typography** — section headings capped at `text-2xl/3xl`. Stripe/Linear
   lead with confident display type.
2. **Repetitive rhythm** — every section was center-eyebrow + center-heading + center-sub.
3. **Three-equal-card patterns** — outcomes, testimonials, how-it-works.
4. **Numbers never celebrated** — the `gold-text` gradient existed but was unused on metrics.

## Foundation (globals.css)

New primitives that carry the new language:
- `.section-heading` — confident `text-3xl → 5xl` display scale, tight tracking, balanced.
- `.metric-xl` — large numeral with `-0.045em` tracking; pairs with `.gold-text`.
- `.card-elevated` — gradient hairline + inner top light + real depth (`shadow-float`).
- `.rail-gold` — champagne accent rail on the start edge (RTL-aware via `inset-inline-start`).
- `.panel-cta` — cinematic emerald+gold radial spotlight panel on near-black.

## The 10 changes

| # | Surface | Change |
|---|---|---|
| 1 | All landing headings | Promoted to `.section-heading` display scale with gold-gradient emphasis word |
| 2 | Stats strip → floating band | `card-elevated` band lifts off the hero (`-mt-8`), large gold-gradient numerals, gold hairline columns |
| 3 | Outcomes | Killed 3-equal-cards → asymmetric: featured "5 ثوانٍ" gold numeral + integrated testimonial (gold rail) + supporting pair |
| 4 | How it works | Flat rows → connected vertical journey with emerald→gold gradient spine + numbered nodes |
| 5 | Bento features | Lead tile gets emerald→gold wash, gold icon shell, `text-xl/2xl` title — a real focal point |
| 6 | Social proof | 3-equal → one large featured quote (gold rail) + two supporting |
| 7 | Trust | Metrics promoted to centerpiece band: huge gold-gradient numerals, badges beneath |
| 8 | Pricing (preview + `/pricing`) | Featured tier elevated: gradient glow border, gold top hairline, gold-gradient price, ribbon |
| 9 | Case studies (`/projects`) | `card-elevated` + gold rail header; result metrics → large gold-gradient display numbers |
| 10 | CTA panels + dashboard | Landing & projects CTAs → cinematic `panel-cta`; dashboard revenue cell → large gold hero numeral |

## Files changed

- `saas/app/globals.css` — foundation primitives
- `saas/app/page.tsx` — outcomes, how-it-works journey, heading scale, CTA panel
- `saas/components/ui/animated-stats-section.tsx` — floating gold band
- `saas/components/ui/social-proof.tsx` — featured + supporting
- `saas/components/ui/trust-section.tsx` — metric showcase
- `saas/components/ui/bento-features.tsx` — lead tile depth
- `saas/components/ui/pricing-cards.tsx` — preview tier elevation
- `saas/components/pricing/PricingExperience.tsx` — `/pricing` featured elevation + gold price
- `saas/app/projects/page.tsx` — case study editorial + gold metrics
- `saas/app/dashboard/page.tsx` — revenue hero numeral

## Verification

- `npx tsc --noEmit` — clean
- `npm run build` — ✓ Compiled, ✓ 96/96 pages
- Live preview confirmed (Lenis page; required hiding the 100svh video hero in-DOM to
  screenshot mid-page sections): outcomes, floating stat band, pricing featured tier,
  case-study gold metrics, CTA panel all render correctly.
- `preview_inspect` confirmed `.gold-text` → `linear-gradient(#f4e9cd,#c9a24b,#a98238)` with
  transparent fill, `metric-xl` → `-2.16px` tracking at 48px.

## Note for future sessions

Running `npm run build` while the dev preview server is live clobbers the shared
worktree `.next`, breaking the dev server with `Cannot read properties of undefined
(reading 'call')`. Fix: stop the preview server, `rm -rf .next`, restart. Don't run a
production build against the same `.next` a dev server is using.

## Deliberately NOT changed

- Hero video + ambient layers (approved, locked)
- The em-dash-free copy register from the prior pass (maintained; no new em-dashes introduced)
- IA, routes, nav labels, form field names
