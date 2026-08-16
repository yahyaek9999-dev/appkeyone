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
    // Validate required env vars at startup. In production this throws on a
    // missing/weak AUTH_SECRET or SAAS_INTERNAL_SECRET so the app fails fast
    // instead of silently running with public dev-fallback secrets.
    const { validateEnv } = await import("./lib/env");
    validateEnv();

    // Full server-side SDK (Prisma tracing, beforeSend filters, etc.)
    await import("./sentry.server.config");

    // Reconcile the feature registry once per boot.
    //
    // The control plane is useless when the FeatureControl table is empty —
    // every gate silently passes and the admin UI reports "0 features". Lazy
    // seeding on first read is not sufficient because the first read only
    // happens on an AUTHENTICATED request, so a fresh deploy can sit with an
    // empty registry indefinitely.
    //
    // seedFeatureRegistry() is idempotent and never overwrites admin-controlled
    // columns (status / killSwitch / customerVisible / rolloutPct), so running
    // it on every boot is safe and keeps the registry in step with the pricing
    // catalog as capabilities are added.
    //
    // Deliberately non-fatal and non-blocking: a seeding failure must never
    // stop the server from accepting traffic.
    void (async () => {
      try {
        const { seedFeatureRegistry } = await import("./lib/feature-control");
        const { features, releases } = await seedFeatureRegistry();
        console.log(`[feature-registry] reconciled ${features} features, ${releases} releases`);
      } catch (err) {
        console.error("[feature-registry] seed failed (non-fatal):", (err as Error)?.message);
      }
    })();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // Lightweight edge SDK (no Node.js APIs)
    await import("./sentry.edge.config");
  }
}

// Captures unhandled errors thrown in Server Components, Route Handlers,
// and Server Actions — the App Router equivalent of a global error boundary.
export const onRequestError = Sentry.captureRequestError;
