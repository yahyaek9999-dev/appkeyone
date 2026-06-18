/** /admin/payment-reviews — staff review queue (Phase 1/2). */
import { listPaymentProofs, getProofStats } from "@/lib/payments-ops/proofs";
import PaymentReviewsClient from "./payment-reviews-client";

export const dynamic = "force-dynamic";

export default async function PaymentReviewsPage() {
  const [pending, stats] = await Promise.all([listPaymentProofs({ status: "pending", take: 100 }), getProofStats()]);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">مراجعة المدفوعات (Payment Reviews)</h1>
      <p className="page-desc">طابور المراجعة — الاعتماد يشحن المحفظة ويُفعّل الباقة تلقائيًا.</p>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="معلّقة" value={stats.pending} />
        <Tile label="معتمدة" value={stats.approved} />
        <Tile label="مرفوضة" value={stats.rejected} />
      </div>
      <PaymentReviewsClient initial={JSON.parse(JSON.stringify(pending))} />
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value.toLocaleString()}</div></div>;
}
