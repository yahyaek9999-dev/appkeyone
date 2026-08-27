"use client";

/**
 * A mutating fetch that cannot fail silently.
 *
 * The gap this closes, found by auditing every customer page: 48 call sites
 * wrote `await fetch(url, { method: "DELETE" })` as a bare statement and then
 * reloaded the list. When the server returned 402/403/500 the response was
 * never inspected — the row came back on reload with no explanation, and the
 * customer concluded the product was broken. A few sites were worse: they set
 * a success message *before* knowing the outcome, so a failed reconnect still
 * reported "بدأ إعادة الربط".
 *
 * Usage — one line per call site, so adopting it is not a rewrite:
 *
 *     const mutate = useMutate();
 *     if (!(await mutate(`/api/products/${p.id}`, { method: "DELETE" }))) return;
 *     load();
 *
 * Returns `true` only on a 2xx. On failure it raises a toast the customer can
 * act on and returns `false`, so the caller's `if (!ok) return` skips the
 * optimistic reload. Pass `success` to also confirm the happy path.
 */

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";

/** Server error payloads in this codebase are `{ error }`; some add `message`. */
async function readError(res: Response): Promise<string | null> {
  try {
    const body = await res.clone().json();
    const v = body?.error ?? body?.message;
    // Route handlers return machine codes (`bad_body`) as well as Arabic prose.
    // Only surface prose — a code means nothing to a merchant.
    if (typeof v === "string" && v && !/^[a-z0-9_]+$/.test(v)) return v;
  } catch {
    /* not JSON — fall through to the status-based message */
  }
  return null;
}

/** Status → something a merchant can act on, when the server sent no prose. */
function messageForStatus(status: number): string {
  if (status === 401) return "انتهت الجلسة — سجّل الدخول من جديد.";
  if (status === 402) return "هذه الميزة غير متاحة في باقتك الحالية.";
  if (status === 403) return "لا تملك صلاحية تنفيذ هذا الإجراء.";
  if (status === 404) return "العنصر غير موجود — قد يكون حُذف بالفعل.";
  if (status === 409) return "تعارض في البيانات — حدّث الصفحة وحاول مجددًا.";
  if (status === 429) return "محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة.";
  if (status >= 500) return "تعذّر إتمام العملية على الخادم. حاول مجددًا.";
  return "تعذّر إتمام العملية.";
}

export interface MutateOptions {
  /** Toast shown on success. Omit when the caller already confirms visually. */
  success?: string;
  /** Overrides the derived failure message. */
  failure?: string;
}

export function useMutate() {
  const { success: toastSuccess, error: toastError } = useToast();

  return useCallback(
    async (input: string, init?: RequestInit, opts?: MutateOptions): Promise<boolean> => {
      let res: Response;
      try {
        res = await fetch(input, init);
      } catch {
        // Offline, DNS, aborted — the one case with no status to read.
        toastError(opts?.failure ?? "تعذّر الاتصال بالخادم. تحقّق من اتصالك.");
        return false;
      }
      if (!res.ok) {
        toastError(opts?.failure ?? (await readError(res)) ?? messageForStatus(res.status));
        return false;
      }
      if (opts?.success) toastSuccess(opts.success);
      return true;
    },
    [toastSuccess, toastError],
  );
}
