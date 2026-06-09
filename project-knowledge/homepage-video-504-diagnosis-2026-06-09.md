# Homepage Video 504/502 — Diagnosis & Implementation Plan

**Date:** 2026-06-09
**Scope:** `/vedio.mp4` and `/mobile.mp4` on app.keyone1.com (homepage hero)
**Mode:** Investigation only — nothing modified.

---

## Live status at time of investigation
- **Entire origin is returning `502 Bad Gateway` from Caddy** (homepage, favicon, JS chunks, `/api/health`, and both videos) — not just the videos. The Next.js upstream on `:3000` is currently down/unreachable. ZAP earlier (21:45–21:50) saw `504 Gateway Timeout` (40–44s) on the videos while the rest of the site worked; now it has degraded to a full 502. Both are Caddy reporting its upstream failed.
- Because of the 502, live MP4 response headers could not be captured this pass.

---

## How the videos are served (facts gathered)

**Delivery path**
- Host **Caddy v2** reverse proxy → `reverse_proxy 127.0.0.1:3000` (catch-all) → **Next.js standalone `server.js`** running in a single Docker container (`docker-compose.production.yml`, `restart: unless-stopped`, one instance).
- `deploy/Caddyfile` only defines a block for `k1wb.app.keyone1.com`; the live `app.keyone1.com` config lives on the server (comment points to `C:\Caddy\Caddyfile`). Same proxy pattern either way.

**Where the files live**
- `saas/public/vedio.mp4` and `saas/public/mobile.mp4` — served by Next.js from `public/`.
- **Baked into the Docker image** (`Dockerfile`: `COPY --from=builder /app/public ./public`). Media is coupled to every app deploy.

**File sizes**
- `vedio.mp4` = **4,014,375 B (≈3.83 MB)**
- `mobile.mp4` = **3,422,634 B (≈3.26 MB)**

**Caching configuration**
- Caddy `@static` long-cache rule matches `*.svg *.png *.jpg *.jpeg *.gif *.webp *.ico *.woff *.woff2 *.css *.js` — **`.mp4` is NOT included.** So MP4s receive **no `Cache-Control`** from Caddy and no edge/immutable caching. Every fetch goes to origin.

**Byte-range support**
- Functionally works — ZAP recorded `206 Partial Content` responses. Next.js' `public/` static handler honors `Range`. But **each range request is served by the Node process**, not the edge.

**Is Next.js proxying the files?**
- **Yes — 100%.** Caddy's catch-all proxies every path (including `.mp4`) to `:3000`. Caddy does not `file_server` the videos directly. All video bytes flow through the single Next.js event loop.

**Client behavior (load amplifier) — `components/hero/hero-video.tsx`**
- Desktop `<video … preload="auto">` → the browser **eagerly downloads the entire 3.83 MB file on every homepage visit**, autoplay+muted. Not lazy, no poster.
- Both desktop and mobile `<video>` elements are always in the DOM (CSS-hidden per breakpoint); hidden ones may still prefetch depending on browser. Mobile clip uses the lighter `preload="metadata"`.
- Referenced from `app/page.tsx` (`HeroSection → HeroVideo`, `videoSrc="/vedio.mp4"`, `mobileVideoSrc="/mobile.mp4"`).

---

## Root cause

**Primary:** Every landing-page visit forces a full multi-MB download (`preload="auto"`) of a large static file that is served by a **single-process Next.js Node server**, with **no CDN** and **no Caddy-level caching for `.mp4`**. Under concurrency (real visitors + the ZAP scan firing many parallel requests), the Node event loop and socket pool saturate while streaming these files. Caddy's `reverse_proxy` then exceeds its read/dial timeout → **504**. When the process is fully saturated / OOM / crash-restarting, Caddy gets no upstream at all → **502** (current state). A blocked event loop also stalls `/api/health`, so Docker marks the container unhealthy and restarts it — which can cascade with Watchtower's 60s rolling restarts.

**Contributing factors**
1. No CDN/object-storage offload for media.
2. Caddy `@static` excludes `.mp4` → no caching, every play re-fetches from origin.
3. `preload="auto"` forces eager full-file download on every visit.
4. Single Next.js instance: large-file streaming competes with SSR + API on the same event loop.
5. Videos baked into the image — inflates image size, couples media to deploys.
6. **Config discrepancy to verify:** `Dockerfile` depends on `output: standalone` (it copies `.next/standalone`), but `saas/next.config.js` has **no `output` key** and no local `.next/standalone` exists. If the production build relies on this, a build/deploy could be silently broken — worth checking against the current 502.

---

## Implementation plan (ranked by impact; complexity noted)

> All items are additive and stay clear of the WhatsApp send pipeline.

### P0 — Restore service (blocking, not strictly "video")
- **Impact: critical · Complexity: low–med.** Site is fully 502. On the server: `docker ps`, container logs, `/api/health`, and Watchtower logs. Determine crash vs OOM vs bad image vs mid-restart. Confirm the `output: standalone` / build discrepancy above didn't ship a broken image. Bring the origin back before tuning video.

### Tier 1 — High impact / low complexity (do first)
1. **Stop eager download.** In `hero-video.tsx`, change desktop `preload="auto"` → `preload="none"` (or `"metadata"`) and add a `poster` still-frame. Removes the per-visit full-file fetch — the single biggest origin-load reduction for the least effort. Frontend-only.
2. **Cache `.mp4` at Caddy.** Add media extensions to the `@static` matcher (or a dedicated matcher) so MP4s get `Cache-Control: public, max-age=…, immutable`. One Caddyfile edit + `caddy reload`. Cuts repeat fetches immediately.

### Tier 2 — High impact / medium complexity (durable fix)
3. **Offload videos off the Node process.**
   - **Best: CDN / object storage** (Cloudflare R2+CDN, Bunny, S3+CloudFront). Point `videoSrc`/`mobileVideoSrc` at the CDN URL; update CSP `media-src` to allow that origin. Removes large-file streaming from Next entirely; proper edge range + caching.
   - **Lower-cost interim:** serve the two files via Caddy `file_server` directly from a host path (a `handle` block for `/vedio.mp4` + `/mobile.mp4` ahead of the catch-all `reverse_proxy`), so Node never touches them.
4. **Shrink the media.** Re-encode (H.264 baseline + lower bitrate/resolution, generate poster, optionally a WebM variant). A 3.8 MB hero clip is typically reducible to ~1 MB. ffmpeg; reduces bytes regardless of delivery method.

### Tier 3 — High impact / higher complexity (resilience)
5. **Decouple media from the image** — stop `COPY public` for the videos; mount via volume or serve from CDN. Smaller image, faster/safer deploys.
6. **Origin resilience** — keep `/api/health` trivial and independent of media; consider 2+ Next.js replicas behind Caddy or a separate static-media service; tune Caddy `reverse_proxy` timeouts; review Watchtower's 60s rolling-restart so it can't crash-loop under load.
7. **Reconcile `output: 'standalone'`** in `next.config.js` with the Dockerfile to prevent silently broken builds/deploys.

---

## Suggested sequence
P0 (restore) → Tier 1 (#1, #2 — minutes, big relief) → Tier 2 (#3/#4 — durable) → Tier 3 (resilience). Tier 1 alone should eliminate most of the 504s by removing the eager full-file download and enabling caching.
