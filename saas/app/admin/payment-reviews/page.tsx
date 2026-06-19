/** /admin/payment-reviews — admin view of the finance review queue (with receipt images). */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getProofStats } from "@/lib/payments-ops/proofs";
import FinancePaymentsClient from "@/app/finance/payments/finance-payments-client";

export const dynamic = "force-dynamic";

export default async function PaymentReviewsPage() {
  const [queue, stats] = await Promise.all([
    prisma.paymentProof.findMany({ where: { status: { in: ["pending", "under_review"] } }, orderBy: { createdAt: "asc" }, take: 200 }),
    getProofStats(),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title mb-1">مراجعة المدفوعات (Payment Reviews)</h1>
          <p className="page-desc">عاين الإيصال، اعتمد لشحن المحفظة وتفعيل الباقة، أو ارفض مع ذكر السبب. كل إجراء يُسجَّل في سجل التدقيق.</p>
        </div>
        <Link href="/finance/payments" className="btn-secondary text-sm">مركز المالية ←</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="بانتظار" value={stats.pending} />
        <Tile label="قيد المراجعة" value={(stats as any).underReview || 0} />
        <Tile label="معتمدة" value={stats.approved} />
        <Tile label="مرفوضة" value={stats.rejected} />
      </div>
      <FinancePaymentsClient initial={JSON.parse(JSON.stringify(queue))} />
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{(value || 0).toLocaleString()}</div></div>;
}
