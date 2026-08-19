"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Loader2, CheckCircle2, Wrench, HandCoins, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { ReconReport, ReconIssue, IssueSeverity } from "@/lib/admin/finance-reconcile";

const SEV: Record<IssueSeverity, { label: string; cls: string; dot: string }> = {
  critical: { label: "حرج", cls: "border-rose-500/30 bg-rose-500/[0.05]", dot: "bg-rose-500" },
  high: { label: "مرتفع", cls: "border-orange-500/25 bg-orange-500/[0.04]", dot: "bg-orange-400" },
  medium: { label: "متوسط", cls: "border-amber-500/25 bg-amber-500/[0.04]", dot: "bg-amber-400" },
  low: { label: "منخفض", cls: "border-white/[0.08] bg-white/[0.02]", dot: "bg-slate-500" },
};

export default function ReconciliationView({ initial }: { initial: ReconReport }) {
  const [report, setReport] = useState<ReconReport>(initial);
  const [busy, setBusy] = useState<"scan" | "fix" | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const confirm = useConfirm();

  async function rescan() {
    setBusy("scan");
    try {
      const r = await fetch("/api/admin/finance/reconciliation?days=90", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) { setReport(j.report); toastSuccess("تم تحديث الفحص"); }
      else toastError("فشل الفحص");
    } catch { toastError("فشل الاتصال"); }
    finally { setBusy(null); }
  }

  async function runSweep() {
    const ok = await confirm({
      title: "تشغيل التسوية الآمنة؟",
      body:
        "ستُشغَّل عملية التسوية الحالية (idempotent): إعادة إضافة الرصيد للمدفوعات الناجحة غير المُضافة، وإنهاء نوايا الدفع المتروكة. الحالات التي تحتاج تدخّلاً يدوياً لن تُمس.",
      confirmLabel: "تشغيل التسوية",
    });
    if (!ok) return;

    setBusy("fix");
    try {
      const r = await fetch("/api/admin/finance/reconciliation", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setReport(j.report);
        toastSuccess(`تمت التسوية — أُعيد شحن ${j.result.recredited}، أُنهيت ${j.result.expired}`);
      } else toastError("فشلت التسوية");
    } catch { toastError("فشل الاتصال"); }
    finally { setBusy(null); }
  }

  const c = report.counts;

  return (
    <div className="space-y-4">
      {/* Summary + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Chip label="حرج" value={c.critical} tone={c.critical > 0 ? "bad" : "ok"} />
        <Chip label="مرتفع" value={c.high} tone={c.high > 0 ? "warn" : "ok"} />
        <Chip label="متوسط" value={c.medium} />
        <Chip label="منخفض" value={c.low} />
        <div className="ms-auto flex items-center gap-2">
          <button onClick={rescan} disabled={!!busy} className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50">
            {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            إعادة الفحص
          </button>
          <button
            onClick={runSweep}
            disabled={!!busy || report.autoFixableCount === 0}
            className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            title={report.autoFixableCount === 0 ? "لا توجد حالات قابلة للإصلاح الآلي" : undefined}
          >
            {busy === "fix" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
            تسوية آمنة ({report.autoFixableCount})
          </button>
        </div>
      </div>

      {c.total === 0 ? (
        <div className="flex items-center gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-6">
          <CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-400" />
          <div>
            <div className="text-base font-bold text-white">لا توجد تعارضات مالية</div>
            <div className="text-sm text-slate-400">كل المدفوعات الناجحة لها قيود محفظة مطابقة، ولا استردادات معلّقة.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {report.issues.map((iss, i) => <IssueRow key={i} issue={iss} />)}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        قواعد الفحص مشتقّة من العلاقات الفعلية في نموذج البيانات فقط (PaymentTransaction ↔ WalletLedger ↔ PaymentProof).
        لا تُعرض أي نتيجة تقديرية.
      </p>
    </div>
  );
}

function IssueRow({ issue }: { issue: ReconIssue }) {
  const sev = SEV[issue.severity];
  return (
    <div className={`rounded-xl border p-4 ${sev.cls}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sev.dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{issue.title}</span>
            <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-400">{sev.label}</span>
            {issue.manualIntervention ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                <HandCoins className="h-3 w-3" /> تدخّل يدوي مطلوب
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                <Wrench className="h-3 w-3" /> قابل للتسوية الآمنة
              </span>
            )}
          </div>

          <div className="mt-1 text-[12px] text-slate-300">{issue.detail}</div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {issue.amountUsd != null && <span className="font-semibold text-white">${issue.amountUsd.toFixed(2)}</span>}
            {issue.tenantEmail && (
              <Link href={`/admin/tenants/${issue.tenantId}`} className="text-brand-300 hover:text-brand-200" dir="ltr">
                {issue.tenantEmail}
              </Link>
            )}
            {issue.paymentId && (
              <Link href={`/admin/payments/${issue.paymentId}`} className="text-brand-300 hover:text-brand-200">
                عرض المعاملة
              </Link>
            )}
            {issue.at && <span>{new Date(issue.at).toLocaleString("ar-EG")}</span>}
          </div>

          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
            <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
            {issue.recommendedAction}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const c = tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
