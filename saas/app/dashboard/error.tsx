"use client";
// ---------------------------------------------------------------------------
// Dashboard segment error boundary (App Router).
// Catches any runtime error thrown while rendering a dashboard page WITHOUT
// tearing down the whole app (global-error.tsx replaces <html>; this keeps the
// dashboard shell + sidebar intact and offers in-place recovery).
//
// Additive: previously the dashboard had no segment boundary, so a single
// widget throwing bubbled to the global boundary and produced a full-page
// crash with a generic message. This reports to Sentry and lets the user retry
// or jump to a known-good page instead.
// ---------------------------------------------------------------------------
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    // Surface in the browser console for local debugging too.
    // eslint-disable-next-line no-console
    console.error("[dashboard] runtime error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
          <AlertTriangle className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-white">تعذّر عرض هذه الصفحة</h2>
        <p className="mt-2 text-sm text-slate-400">
          حدث خطأ مؤقت أثناء تحميل البيانات. بياناتك بأمان — جرّب إعادة المحاولة.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-slate-600">ref: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button onClick={reset} className="btn-primary text-sm">
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </button>
          <Link href="/dashboard" className="btn-ghost text-sm">
            <Home className="h-4 w-4" />
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
