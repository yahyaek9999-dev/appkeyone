// ---------------------------------------------------------------------------
// Next.js configuration — Phase 6: wrapped with Sentry build plugin
// ---------------------------------------------------------------------------
// IMPORTANT: withSentryConfig must wrap the ENTIRE config so the Sentry
// webpack plugin can inject source-map uploading and automatic
// instrumentation of server functions during the build step.
// ---------------------------------------------------------------------------
const { withSentryConfig } = require("@sentry/nextjs");
const { execSync } = require("child_process");

// Build-time version identifier: git short hash + date. Exposed as
// NEXT_PUBLIC_BUILD_ID so both server (health endpoint) and client
// (stale-cache detection) can reference the exact deploy version.
let buildId = "dev";
try {
  const hash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  buildId = `${hash}-${date}`;
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Suppress the framework "X-Powered-By: Next.js" response header so the stack
  // version isn't leaked to clients/scanners.
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  async headers() {
    // Content-Security-Policy. Next.js App Router injects inline bootstrap
    // scripts/styles, so script/style-src must allow 'unsafe-inline' (and
    // 'unsafe-eval' for the dev/runtime). This is a pragmatic baseline that adds
    // clickjacking (frame-ancestors), base-uri and object-src lockdown without
    // breaking the bundled UI; tightening script-src to nonce-based is a future
    // step (requires wiring a nonce through the app). connect-src allows https
    // for the Sentry SDK + outbound APIs; media/img allow blob+data for the
    // hero video and generated images.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // style-src/font-src allow Google Fonts (Cairo) loaded in app/layout.tsx.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Isolate our browsing context (XS-Leaks / cross-window hardening).
          // `-allow-popups` preserves any window.open()/opener flows so no UX breaks.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Block legacy Flash/Acrobat cross-domain policy probing. Harmless, additive.
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // HSTS: enforce HTTPS for 2 years incl. subdomains (enterprise control).
          // Safe additive header — production is HTTPS-only behind the proxy.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Enforced CSP. External origins used by the app (Google Fonts) are
          // whitelisted above; inline bootstrap/JSON-LD is covered by
          // 'unsafe-inline'. Flipped from Report-Only now that prod HTML origins
          // are accounted for.
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        // Long-lived immutable caching for the hero media + poster stills so
        // repeat visits and video range requests don't re-hit the Node origin
        // (the single biggest repeat-load reduction). Exact paths keep the
        // route-source valid (Next forbids capture groups); rename to bust.
        source: "/:file(vedio.mp4|mobile.mp4|vedio-poster.jpg|mobile-poster.jpg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  experimental: {
    // Existing: allow large server action payloads (e.g. PDF/DOCX uploads)
    serverActions: { bodySizeLimit: "10mb" },
    // Phase 6: enables instrumentation.ts + onRequestError hook
    instrumentationHook: true,
    // pdfkit resolves its .afm font metrics via a `__dirname`-relative
    // fs.readFileSync at runtime. Webpack-bundling the route (the default)
    // rewrites that path to the compiled .next output dir, where the font
    // data files were never copied — every PDF render 500s with ENOENT.
    // Keeping it external makes Node `require()` it straight from
    // node_modules at runtime, where __dirname resolves correctly.
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

// ---------------------------------------------------------------------------
// Sentry webpack plugin options (build-time only — not sent to the browser)
// ---------------------------------------------------------------------------
/** @type {import('@sentry/nextjs').SentryBuildOptions} */
const sentryBuildOptions = {
  // Sentry organisation and project (match the DSN's project slug)
  org: "keyone",
  project: "keyone",

  // Auth token for source-map uploads. Set this in CI / .env.local.
  // Never commit a real token — the build silently skips upload when unset.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Route Sentry events through our own Next.js handler to avoid ad-blockers
  // that block requests to *.sentry.io. The tunnel proxies them server-side.
  tunnelRoute: "/monitoring-tunnel",

  // Suppress the "Sentry successfully uploaded source maps" banner in builds
  silent: true,

  // Only upload source maps in production builds — saves time in dev/preview
  sourcemaps: {
    disable: process.env.NODE_ENV !== "production",
  },

  // Automatically wrap API route handlers with Sentry's error capturing and
  // performance tracing. Equivalent to manually wrapping each handler with
  // withSentry(), but without any per-file changes.
  autoInstrumentServerFunctions: true,
};

module.exports = withSentryConfig(nextConfig, sentryBuildOptions);
