// ---------------------------------------------------------------------------
// Sentry – Server-side SDK initialisation (Phase 6)
//
// Loaded by instrumentation.ts for the Node.js runtime only.
// Includes optional Prisma query tracing + noise filtering for expected
// auth/not-found errors that pollute the Sentry issue stream.
// ---------------------------------------------------------------------------
import * as Sentry from "@sentry/nextjs";

// Build the integrations list. Prisma tracing is optional — if the
// integration API is not available in the installed version we skip it
// gracefully rather than crashing the server boot sequence.
const buildIntegrations = (): any[] => {
  const list: any[] = [];
  try {
    // prismaIntegration() is available in @sentry/nextjs ≥ 8.
    // It attaches span data to every Prisma query so you can see slow
    // queries in Sentry Performance without any code changes.
    if (typeof (Sentry as any).prismaIntegration === "function") {
      list.push((Sentry as any).prismaIntegration());
    }
  } catch {
    // Older SDK version — proceed without Prisma tracing
  }
  return list;
};

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only capture in production
  enabled: process.env.NODE_ENV === "production",

  // Lower sample rate on the server — server spans are more numerous
  // and expensive to store than client-side page-load spans.
  tracesSampleRate: 0.05,

  environment: process.env.NODE_ENV,

  // Never attach request bodies or user IPs automatically; route handlers
  // explicitly call Sentry.setUser({ id }) after authentication succeeds.
  sendDefaultPii: false,

  integrations: buildIntegrations(),

  // ---------------------------------------------------------------------------
  // Noise filter — drop "expected" control-flow errors that are not bugs.
  //
  // - UNAUTHORIZED  → thrown by lib/auth.ts when the session is absent;
  //                   this is handled by the UI (redirect to /login).
  // - NOT_FOUND     → returned by resource-lookup helpers; also expected.
  //
  // These are high-volume and produce zero-signal Sentry issues. All other
  // errors (including unexpected 5xx paths) pass through unchanged.
  // ---------------------------------------------------------------------------
  beforeSend(event, hint) {
    const err = hint?.originalException;
    if (err instanceof Error) {
      if (err.message === "UNAUTHORIZED" || err.message === "NOT_FOUND") {
        return null; // drop — not an actionable bug
      }
    }
    return event;
  },
});
