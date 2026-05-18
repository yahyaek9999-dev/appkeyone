"use client";
// ---------------------------------------------------------------------------
// Global error boundary for Next.js App Router (Phase 6 — Sentry)
// Catches React rendering errors that bubble out of the root layout.
// Must be a Client Component ("use client").
// ---------------------------------------------------------------------------
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-950 text-white min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-2xl font-bold">حدث خطأ غير متوقع</h2>
          <p className="text-slate-400 text-sm">
            تم الإبلاغ عن المشكلة تلقائياً. نعتذر عن الإزعاج.
          </p>
          {error.digest && (
            <p className="text-xs text-slate-600 font-mono">ref: {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm font-bold"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
