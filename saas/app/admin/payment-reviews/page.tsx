/** /admin/payment-reviews — admin view of the finance review queue (with receipt images).
 *
 * Batch 3: adds server-side search / status / amount / date filtering over the
 * queue. The approve/reject workflow itself is UNCHANGED — it still runs through
 * FinancePaymentsClient and the existing authorization + audit path. */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getProofStats, listApprovedProofs } from "@/lib/payments-ops/proofs";
import FinancePaymentsClient from "@/app/finance/payments/finance-payments-client";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

const QUEUE_STATUSES = ["pending", "under_review"];

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "الطابور (بانتظار + قيد المراجعة)" },
  { key: "pending", label: "بانتظار" },
  { key: "under_review", label: "قيد المراجعة" },
  { key: "approved", label: "معتمدة" },
  { key: "rejected", label: "مرفوضة" },
];

export default async function PaymentReviewsPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; minUsd?: string; from?: string; to?: string };
}) {
  const status = searchParams?.status || "";
  const q = searchParams?.q?.trim() || "";
  const minUsd = searchParams?.minUsd ? Number(searchParams.minUsd) : undefined;

  const where: any = {};
  where.status = status ? status : { in: QUEUE_STATUSES };
  if (minUsd != null && Number.isFinite(minUsd)) where.amountUsd = { gte: minUsd };
  if (searchParams?.from || searchParams?.to) {
    where.createdAt = {};
    if (searchParams.from) where.createdAt.gte = new Date(searchParams.from);
    if (searchParams.to) { const t = new Date(searchParams.to); t.setHours(23, 59, 59, 999); where.createdAt.lte = t; }
  }
  if (q) {
    // Bounded tenant resolution, then match reference / method / tenant.
    const owners = await prisma.user
      .findMany({ where: { email: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 50 })
      .catch(() => [] as { id: string }[]);
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { methodKey: { contains: q, mode: "insensitive" } },
      ...(owners.length ? [{ userId: { in: owners.map((o) => o.id) } }] : []),
    ];
  }

  const [queue, stats, approved] = await Promise.all([
    prisma.paymentProof.findMany({ where, orderBy: { createdAt: "asc" }, take: 200 }),
    getProofStats(),
    listApprovedProofs(20),
  ]);

  const qs = (next: Record<string, string>) => {
    const sp = new URLSearchParams();
    if (searchParams?.q) sp.set("q", searchParams.q);
    if (searchParams?.status) sp.set("status", searchParams.status);
    if (searchParams?.minUsd) sp.set("minUsd", searchParams.minUsd);
    if (searchParams?.from) sp.set("from", searchParams.from);
    if (searchParams?.to) sp.set("to", searchParams.to);
    for (const [k, v] of Object.entries(next)) { if (v) sp.set(k, v); else sp.delete(k); }
    const s = sp.toString();
    return `/admin/payment-reviews${s ? `?${s}` : ""}`;
  };

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

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {STATUS_TABS.map((t) => {
          const active = status === t.key;
          return (
            <Link
              key={t.key || "queue"}
              href={qs({ status: t.key })}
              className={`rounded-full px-3 py-1 transition ${active ? "bg-brand-500/20 text-brand-200" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Filter bar */}
      <form action="/admin/payment-reviews" method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            name="q"
            defaultValue={q}
            placeholder="مرجع التحويل، الطريقة، أو بريد التاجر…"
            className="w-56 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
          />
        </div>
        <input name="minUsd" type="number" defaultValue={searchParams?.minUsd || ""} placeholder="أقل مبلغ $" className="w-28 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white placeholder:text-slate-600" />
        <input name="from" type="date" defaultValue={searchParams?.from || ""} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        <input name="to" type="date" defaultValue={searchParams?.to || ""} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white" />
        <button type="submit" className="btn-primary text-sm">تطبيق</button>
        {(q || searchParams?.minUsd || searchParams?.from || searchParams?.to) && (
          <Link href={qs({ q: "", minUsd: "", from: "", to: "" })} className="text-xs text-slate-500 hover:text-slate-300">مسح الفلاتر</Link>
        )}
        <span className="ms-auto text-[12px] text-slate-500">{queue.length} نتيجة</span>
      </form>

      <FinancePaymentsClient initial={JSON.parse(JSON.stringify(queue))} approved={JSON.parse(JSON.stringify(approved))} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{(value || 0).toLocaleString()}</div></div>;
}
