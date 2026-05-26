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
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
