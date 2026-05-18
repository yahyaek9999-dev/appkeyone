// ---------------------------------------------------------------------------
// Sentry – Browser / Client-side SDK initialisation (Phase 6)
//
// Loaded automatically by @sentry/nextjs on the client bundle.
// DSN is pulled from the public env so the browser can report events.
// ---------------------------------------------------------------------------
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only capture errors in production — keeps dev/CI noise-free
  enabled: process.env.NODE_ENV === "production",

  // Sample 10 % of page-load / navigation traces (performance)
  tracesSampleRate: 0.1,

  // Session replays: record 5 % of sessions normally, 100 % on error
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  environment: process.env.NODE_ENV,

  // Never include personal data in error payloads
  sendDefaultPii: false,

  // Strip console.log breadcrumbs — they're noisy and add payload size
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "console") return null;
    return breadcrumb;
  },
});
