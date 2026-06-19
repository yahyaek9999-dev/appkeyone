/** /finance/payments — finance review queue (pending + under_review), with receipt images. */
import { prisma } from "@/lib/db";
import { getProofStats, listApprovedProofs } from "@/lib/payments-ops/proofs";
import FinancePaymentsClient from "./finance-payments-client";

export const dynamic = "force-dynamic";

export default async function FinancePaymentsPage() {
  const [queue, stats, approved] = await Promise.all([
    prisma.paymentProof.findMany({ where: { status: { in: ["pending", "under_review"] } }, orderBy: { createdAt: "asc" }, take: 200 }),
    getProofStats(),
    listApprovedProofs(20),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold mb-1">مراجعة المدفوعات</h1>
        <p className="text-sm text-slate-400">عاين الإيصال، اعتمد لشحن المحفظة وتفعيل الباقة تلقائيًا، أو ارفض مع ذكر السبب الذي يراه العميل.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="بانتظار" value={stats.pending} />
        <Tile label="قيد المراجعة" value={(stats as any).underReview || 0} />
        <Tile label="معتمدة" value={stats.approved} />
        <Tile label="مرفوضة" value={stats.rejected} />
      </div>
      <FinancePaymentsClient initial={JSON.parse(JSON.stringify(queue))} approved={JSON.parse(JSON.stringify(approved))} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-xs mb-1">{label}</div><div className="text-2xl font-extrabold">{(value || 0).toLocaleString()}</div></div>;
}
