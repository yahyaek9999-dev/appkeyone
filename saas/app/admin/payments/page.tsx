/**
 * Admin Payments center — payment-provider topup analytics.
 *
 * Read-only platform view of gateway topups (Paymob / Stripe / manual): KPI
 * tiles (volume, status mix, reconciliation health), a per-provider table, and
 * the most recent transactions, plus a one-click reconciliation control.
 * Admin-gated by the /admin layout. All money is USD.
 */
import { prisma } from "@/lib/db";
import { getPaymentStats } from "@/lib/payments";
import { formatUsd } from "@/lib/wallet/money";
import { CreditCard, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { ReconcileButton } from "./admin-payments-client";
import PaymentsControl from "./payments-control";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  manual: "تحويل يدوي",
  paymob: "Paymob",
  stripe: "Stripe",
};

const STATUS_LABELS: Record<string, string> = {
  created: "أُنشئ",
  pending: "قيد الانتظار",
  paid: "مدفوع",
  reconciled: "تمت التسوية",
  failed: "فشل",
  expired: "منتهٍ",
  refunded: "مُسترد",
};

function statusTone(status: string): string {
  if (status === "paid" || status === "reconciled") return "text-emerald-300";
  if (status === "pending" || status === "created") return "text-amber-300";
  if (status === "failed") return "text-rose-300";
  return "text-slate-400";
}

export default async function AdminPaymentsPage() {
  const stats = await getPaymentStats({ days: 30 });
  const recent = await prisma.paymentTransaction
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        provider: true,
        amountUsd: true,
        status: true,
        providerRef: true,
        createdAt: true,
        reconciledAt: true,
      },
    })
    .catch(() => []);

  const t = stats.totals;
  // Real provider list for the filter dropdown — derived from actual stats.
  const providers = stats.byProvider.map((p) => p.provider);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">المدفوعات وبوابات الشحن</h1>
          <p className="page-desc">
            مدفوعات شحن المحفظة عبر Paymob و Stripe والتحويل اليدوي — تُحسب من السجلات الفعلية (آخر {stats.days} يوم).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/payments/reconciliation" className="btn-ghost flex items-center gap-1.5 text-sm">
            <AlertCircle className="h-3.5 w-3.5" /> التسوية
          </Link>
          <ReconcileButton />
        </div>
      </div>

      {t.uncreditedPaid > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> يوجد <b className="mx-1">{t.uncreditedPaid}</b> عملية مدفوعة دون إضافة للرصيد. شغّل التسوية لإعادة الشحن.
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={<CreditCard className="h-5 w-5 text-brand-300" />} label="إجمالي العمليات" value={t.transactions.toLocaleString()} />
        <Tile icon={<CheckCircle2 className="h-5 w-5 text-emerald-300" />} label="المدفوعة" value={t.paid.toLocaleString()} />
        <Tile icon={<CreditCard className="h-5 w-5 text-emerald-300" />} label="حجم المدفوعات" value={formatUsd(t.paidVolumeUsd)} />
        <Tile icon={<RefreshCw className="h-5 w-5 text-amber-300" />} label="قيد الانتظار" value={t.pending.toLocaleString()} />
        <Tile icon={<AlertCircle className="h-5 w-5 text-rose-300" />} label="فاشلة" value={t.failed.toLocaleString()} />
        <Tile
          icon={<AlertCircle className={"h-5 w-5 " + (t.uncreditedPaid > 0 ? "text-rose-300" : "text-slate-400")} />}
          label="مدفوعة دون إضافة رصيد"
          value={t.uncreditedPaid.toLocaleString()}
          tone={t.uncreditedPaid > 0 ? "warn" : "ok"}
          sub="يجب أن يكون صفرًا"
        />
      </div>

      {/* By-provider table */}
      <div className="card p-5">
        <h2 className="font-bold text-lg mb-4">حسب البوابة</h2>
        {stats.byProvider.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">لا توجد عمليات في هذه الفترة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-right p-2">البوابة</th>
                  <th className="text-right p-2">الإجمالي</th>
                  <th className="text-right p-2">مدفوعة</th>
                  <th className="text-right p-2">قيد الانتظار</th>
                  <th className="text-right p-2">فاشلة</th>
                  <th className="text-right p-2">منتهية</th>
                  <th className="text-right p-2">الحجم المدفوع</th>
                </tr>
              </thead>
              <tbody>
                {stats.byProvider.map((p) => (
                  <tr key={p.provider} className="border-t border-white/5">
                    <td className="p-2 font-semibold">{PROVIDER_LABELS[p.provider] || p.provider}</td>
                    <td className="p-2">{p.total.toLocaleString()}</td>
                    <td className="p-2 text-emerald-300">{p.paid.toLocaleString()}</td>
                    <td className="p-2 text-amber-300">{p.pending.toLocaleString()}</td>
                    <td className="p-2 text-rose-300">{p.failed.toLocaleString()}</td>
                    <td className="p-2 text-slate-400">{p.expired.toLocaleString()}</td>
                    <td className="p-2 font-semibold">{formatUsd(p.paidVolumeUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      {/* Payment Control Center — server-side search / filter / sort / pagination */}
      <div>
        <h2 className="mb-3 text-lg font-bold">كل المعاملات</h2>
        <PaymentsControl providers={providers} />
      </div>

    </div>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  const border = tone === "warn" ? "border-rose-500/30" : "border-white/5";
  return (
    <div className={`card p-4 border ${border}`}>
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
