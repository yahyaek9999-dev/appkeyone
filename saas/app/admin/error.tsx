"use client";

import { useEffect } from "react";

/**
 * Admin segment error boundary. Admin server-component pages do top-level
 * `await prisma.*` aggregations; a DB hiccup would otherwise escape to the root
 * `global-error.tsx` (which only wraps the root layout) and lose the admin shell.
 * This scoped boundary degrades gracefully and offers a retry.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] segment error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-lg font-semibold text-slate-200">تعذّر تحميل الصفحة</div>
      <p className="max-w-md text-sm text-slate-400">
        حدث خطأ مؤقت — غالبًا في الاتصال بقاعدة البيانات. يمكنك إعادة المحاولة.
      </p>
      <button
        onClick={reset}
        className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.08]"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
