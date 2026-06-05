# KEYONE — Project State Snapshot (2026-06-05)

Point-in-time record of what is live in production and what changed on this date.

---

## Production

- **App URL:** https://app.keyone1.com
  - The `app.` subdomain serves the Next.js SaaS. The apex `keyone1.com` is a
    **separate marketing SPA** — do not confuse the two.
- **Live commit:** `98bd749` (release `98bd749-20260605`)
- **Health** (`GET /api/health`): `{"status":"ok","db":"ok","version":"98bd749-20260605"}`
- **Readiness** (`GET /api/ready`): `{"ready":true,"verdict":"ready"}` — checks
  `db`, `schema`, and `outgoing_queue` all `ok`.

---

## Changes shipped today

On top of `def481d`, two commits:

- `8f6deaa` — mobile-only hero video + de-AI marketing copy
- `98bd749` — dashboard logo + "smart assistant" button wording

### 1. Mobile-only hero video
- Phones (**<768px**) play `/mobile.mp4` — `autoplay`, `muted`, `loop`,
  `playsInline`, `preload="metadata"`.
- Tablet/desktop (**≥768px**) keep the original `/vedio.mp4` **unchanged**
  (`preload="auto"`, no loop, freezes on last frame).
- Both `<video>` elements are stacked in one `object-cover` frame and toggled via
  Tailwind `max-md:hidden` (desktop clip) / `md:hidden` (mobile clip) → **no CLS,
  no layout shift**.
- Files: `saas/components/hero/hero-video.tsx`, `saas/components/hero/hero-section.tsx`,
  `saas/app/page.tsx`. New asset: `saas/public/mobile.mp4`.

### 2. De-AI marketing copy
- "AI" / "الذكاء الاصطناعي" marketing wording replaced with
  business-intelligence / operations framing across the nav workspace and
  dashboard widgets: products, coupons, knowledge, broadcasts, quick-replies,
  automations, inbox, usage, live-badge.
- `saas/app/layout.tsx` structured-data description reworded.
- Nav workspace "الذكاء" → label "ذكاء الأعمال", rail short "الرؤى".
- Inbox status labels/buttons → "المساعد الذكي" / "المساعد".

### 3. Dashboard logo
- `saas/app/dashboard/layout.tsx` now renders the real `/logo.png` (the metallic
  "W"/key brand mark) via `next/image` in the sidebar **and** mobile drawer,
  replacing the generated `BrandMark` "K" monogram. `public/logo.png` matches the
  repo-root `logo.png` (same MD5).

---

## Intentional leaves (NOT changed — by scope decision)

These contain "AI"/"الذكاء الاصطناعي" but are **functional, not marketing**:

- Legal pages: `terms`, `privacy` (legal description of the AI processor).
- AI-provider config page `settings/ai-provider` — literally configures
  OpenAI / Gemini / Claude / Groq / OpenRouter.
- Ops subsystem monitor: `system-health` (the "AI provider" subsystem card).
- Backend broadcast notifications (`api/cron/broadcasts`).
- CSS class names (`ai-page`, `ai-section`, `ai-container`, `ai-btn`) and route
  paths (`/dashboard/ai-*`) — internal identifiers, not visible text.

---

## Known remaining AI text = DATABASE content, not code

Three visible AI strings remain on the landing page. They are **stored in the
database**, so they cannot be changed by a code deploy — they require the admin
panel. **Flag for the owner:**

1. Footer tagline — `brandTagline` in the `siteConfig` table
   ("منصة الذكاء الاصطناعي للأعمال - بوت واتساب احترافي").
2. Pricing plan feature — "نموذج AI مخصص لنشاطك" (plans table).
3. Pricing plan description — "وصول كامل لمزايا الذكاء الاصطناعي" (plans table).

---

## Today's incident + fix (Prisma engine)

- **Symptom:** during a deploy, the swap script removed `node_modules` and then a
  `Copy-Item` of the macOS-built node_modules hung; the live Prisma query engine
  was `libquery_engine-darwin-arm64.dylib.node` (macOS) on the **Windows** VPS →
  `@prisma/client` imported but every query failed → DB unreachable.
- **Fix:** ran `prisma generate` on the VPS, which produced
  `query_engine-windows.dll.node`. Service restarted, health returned to green.
- **Zero database changes.** No `db push`, no `migrate`, no `prod.db` overwrite.
- Full rule captured in [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md).

---

## Verification performed (2026-06-05)

- `/api/health` and `/api/ready` both green on commit `98bd749`.
- Public pages 200: `/`, `/login`, `/signup`, `/pricing`.
- Auth pages 307 → `/login`: `/dashboard`, `/dashboard/customers`,
  `/dashboard/orders`, `/dashboard/integrations`, `/dashboard/automations`,
  `/admin`.
- Prod HTML confirms both `<video>` tags + responsive classes; desktop clip has no
  `loop`, mobile clip has `loop` + `preload="metadata"`.
- Logo served via `/_next/image?url=%2Flogo.png`.
- All 38 dashboard routes from `def481d` preserved (zero removed).

---

## Related

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — orientation for the whole project.
- [DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md) — the deploy contract.
