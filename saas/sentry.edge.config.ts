// ---------------------------------------------------------------------------
// Sentry – Edge runtime SDK initialisation (Phase 6)
//
// Loaded by instrumentation.ts for the Edge runtime only.
// Intentionally minimal: the Edge runtime runs inside a V8 isolate and
// has no access to Node.js APIs (no fs, no process.env-based config files,
// no native modules). Keep this free of any Node.js-specific imports.
// ---------------------------------------------------------------------------
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only capture in production
  enabled: process.env.NODE_ENV === "production",

  // Keep the edge trace sample rate conservative — edge functions can run
  // at very high frequency (middleware, ISR, etc.)
  tracesSampleRate: 0.05,

  environment: process.env.NODE_ENV,

  sendDefaultPii: false,
});
