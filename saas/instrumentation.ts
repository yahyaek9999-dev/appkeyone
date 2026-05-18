// ---------------------------------------------------------------------------
// Next.js 14 Instrumentation Hook (Phase 6 — Sentry integration)
//
// Next.js calls `register()` once per process start for both the Node.js
// and Edge runtimes. We use the runtime discriminator to load the correct
// Sentry config (Node config uses full SDK + Prisma; Edge config is minimal).
//
// `onRequestError` is the Next.js 14 hook that fires for any unhandled error
// in a Server Component, Route Handler, or Server Action. Forwarding it to
// Sentry.captureRequestError gives us automatic crash reporting for the App
// Router without any per-route try/catch boilerplate.
//
// Required next.config.js option: experimental.instrumentationHook = true
// ---------------------------------------------------------------------------
import * as Sentry from "@sentry/nextjs";

// Do NOT export `runtime` from instrumentation.ts — Next.js 14 requires
// this file to support both runtimes. Exporting runtime="undefined" causes
// a build error. Leave it absent entirely.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Full server-side SDK (Prisma tracing, beforeSend filters, etc.)
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Lightweight edge SDK (no Node.js APIs)
    await import("./sentry.edge.config");
  }
}

// Captures unhandled errors thrown in Server Components, Route Handlers,
// and Server Actions — the App Router equivalent of a global error boundary.
export const onRequestError = Sentry.captureRequestError;
