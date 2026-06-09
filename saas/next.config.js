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
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: data:",
      "font-src 'self' data:",
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
          // HSTS: enforce HTTPS for 2 years incl. subdomains (enterprise control).
          // Safe additive header — production is HTTPS-only behind the proxy.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Report-Only for the initial production rollout: violations are
          // logged (and visible in the browser console) but nothing is blocked,
          // so a missing origin can't break the live UI. Flip the key to
          // "Content-Security-Policy" to enforce once prod HTML is confirmed clean.
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
  experimental: {
    // Existing: allow large server action payloads (e.g. PDF/DOCX uploads)
    serverActions: { bodySizeLimit: "10mb" },
    // Phase 6: enables instrumentation.ts + onRequestError hook
    instrumentationHook: true,
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
