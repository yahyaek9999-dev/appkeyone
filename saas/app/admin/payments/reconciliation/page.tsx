// /admin/payments/reconciliation — Payment Reconciliation Center.
//
// Read-only detection of real mismatches (lib/admin/finance-reconcile). The only
// mutation offered is the EXISTING idempotent sweep; anything it cannot safely
// fix is shown as "manual intervention required" instead of a fake Fix button.
import { detectReconciliationIssues } from "@/lib/admin/finance-reconcile";
import ReconciliationView from "./reconciliation-view";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  const report = await detectReconciliationIssues(90);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">تسوية المدفوعات</h1>
        <p className="page-desc">
          فحص فعلي للتعارضات بين المدفوعات والمحفظة والاشتراكات خلال آخر {report.scannedWindowDays} يوم. لا يتم تعديل أي
          رصيد تلقائياً — الإصلاح الآمن يستخدم عملية التسوية الحالية (idempotent) فقط.
        </p>
      </div>
      <ReconciliationView initial={report} />
    </div>
  );
}
