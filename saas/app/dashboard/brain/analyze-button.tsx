"use client";

/**
 * The action /dashboard/brain never had.
 *
 * The page was read-only — zero inputs, zero buttons — so a merchant could look
 * at Brain but never cause it to do anything, and the credits on the same
 * screen could not be spent. This mirrors the trigger the product already uses
 * elsewhere: "فحص الآن" on /dashboard/monitoring, "حساب الإيرادات" on
 * /dashboard/revenue-pro.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2 } from "lucide-react";
import { useMutate } from "@/components/ui/use-mutate";

export default function AnalyzeButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const mutate = useMutate();
  const router = useRouter();

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/brain/analyze", { method: "POST" });
      if (!res.ok) {
        // Reuse the shared failure handling (402 → plan, 403 → permission, …)
        // by letting useMutate surface it; the fetch above is only to read the
        // success payload, which useMutate does not return.
        await mutate("/api/brain/analyze", { method: "POST" });
        return;
      }
      const j = await res.json();
      if (j.reason === "no_customers") {
        setResult("لا يوجد عملاء لتحليلهم بعد — ستظهر الملفات بعد أول محادثة مع عميل.");
      } else if (j.analyzed === 0 && j.stoppedForCredits) {
        setResult("رصيد التحليل غير كافٍ. تواصل مع الدعم لشحن رصيد الدماغ.");
      } else {
        setResult(
          `تم تحليل ${j.analyzed} عميل` +
            (j.failed ? ` · تعذّر تحليل ${j.failed}` : "") +
            (j.stoppedForCredits ? " · توقّف التحليل لنفاد الرصيد" : ""),
        );
        // Pull the freshly written profiles into the server-rendered page.
        router.refresh();
      }
    } catch {
      setResult("تعذّر الاتصال بالخادم. حاول مجددًا.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={run} disabled={busy} className="btn-primary inline-flex items-center gap-2 text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        {busy ? "جارٍ التحليل..." : "حلّل محادثات عملائي"}
      </button>
      {result && <span className="text-xs text-slate-400">{result}</span>}
    </div>
  );
}
