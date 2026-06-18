"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";

type ReconcileReport = { scanned: number; recredited: number; expired: number; mismatches: number; errors: number };

// ── Run-reconciliation control ────────────────────────────────────────────────
export function ReconcileButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      const r = await fetch("/api/admin/payments/reconcile", { method: "POST" });
      const j = await r.json();
      if (j.ok && j.report) { setReport(j.report); router.refresh(); }
      else setErr(j.error || "تعذر تشغيل التسوية");
    } catch { setErr("خطأ في الشبكة"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button onClick={run} disabled={busy} className="btn-primary justify-center disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} تشغيل التسوية
      </button>
      {report && (
        <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          <span>فُحِص: <b>{report.scanned}</b></span>
          <span>أُعيد شحنه: <b className="text-emerald-300">{report.recredited}</b></span>
          <span>انتهت صلاحيته: <b className="text-amber-300">{report.expired}</b></span>
          <span>عدم تطابق: <b className={report.mismatches > 0 ? "text-amber-300" : ""}>{report.mismatches}</b></span>
          <span>أخطاء: <b className={report.errors > 0 ? "text-rose-300" : ""}>{report.errors}</b></span>
        </div>
      )}
      {err && <div className="text-xs text-rose-300 flex items-center gap-1.5"><XCircle className="h-4 w-4" /> {err}</div>}
    </div>
  );
}
