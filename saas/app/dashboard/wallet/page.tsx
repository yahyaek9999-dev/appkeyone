/**
 * Customer wallet dashboard — prepaid balance, Meta usage breakdown, top-up
 * requests, cost calculator, and the full transaction ledger.
 *
 * Owner-only (financial): guarded by the "billing" permission. All data is real,
 * pulled directly from the wallet engine + Meta cost analytics.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getWalletSummary } from "@/lib/wallet/wallet";
import { getTenantMetaBreakdown } from "@/lib/wallet/analytics";
import { walletFlags } from "@/lib/wallet/flags";
import { formatUsd, formatUsdPrecise } from "@/lib/wallet/money";
import { Wallet as WalletIcon, AlertTriangle, TrendingDown, ArrowUpCircle, MessageSquare, Coins, FileText, Download } from "lucide-react";
import { customerPayableMethods } from "@/lib/payments-ops/accounts";
import { prisma } from "@/lib/db";
import WalletClient from "./wallet-client";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "تسويقية", utility: "خدمية (Utility)", authentication: "مصادقة", service: "محادثة (Service)",
};

export default async function WalletPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "billing")) redirect("/dashboard");

  const uid = ctx.user.id;
  const [wallet, meta, payableMethods, invoicableTransactions] = await Promise.all([
    getWalletSummary(uid),
    getTenantMetaBreakdown(uid, { days: 30 }),
    customerPayableMethods().catch(() => [] as any[]),
    (prisma as any).paymentTransaction.findMany({
      where: { userId: uid, status: { in: ["paid", "reconciled"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, provider: true, amountUsd: true, currency: true, createdAt: true },
    }).catch(() => [] as any[]),
  ]);

  const stateTone =
    wallet.state === "empty" ? "border-rose-500/40 bg-rose-500/10"
    : wallet.state === "low" ? "border-amber-500/40 bg-amber-500/10"
    : "border-emerald-500/30 bg-emerald-500/[0.06]";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">المحفظة والرصيد</h1>
          <p className="page-desc">
            رصيدك المدفوع مقدمًا لرسائل واتساب عبر Meta. تشحن المحفظة، وتُخصم تكلفة المحادثات تلقائيًا.
          </p>
        </div>
      </div>

      {/* Low-balance / empty alert */}
      {wallet.state !== "ok" && (
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${stateTone}`}>
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
          <div className="text-sm">
            <div className="font-bold text-white">
              {wallet.state === "empty" ? "نفد رصيد المحفظة" : "رصيد المحفظة منخفض"}
            </div>
            <div className="text-slate-300">
              {wallet.state === "empty"
                ? "اشحن المحفظة لمتابعة إرسال رسائل Meta المدفوعة دون انقطاع."
                : `رصيدك (${formatUsd(wallet.balanceUsd)}) قريب من حد التنبيه (${formatUsd(wallet.lowBalanceThresholdUsd)}).`}
            </div>
          </div>
        </div>
      )}

      {/* Balance hero + totals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className={`card p-6 lg:col-span-2 border ${stateTone}`}>
          <div className="flex items-center gap-2 text-slate-300 text-sm mb-2">
            <WalletIcon className="h-4 w-4" /> الرصيد الحالي
          </div>
          <div className="text-4xl font-extrabold text-white">{formatUsd(wallet.balanceUsd)}</div>
          <div className="mt-2 text-xs text-slate-400">
            العملة: {wallet.currency} · حالة المحفظة:{" "}
            <span className={wallet.status === "active" ? "text-emerald-300" : "text-rose-300"}>
              {wallet.status === "active" ? "نشطة" : "موقوفة"}
            </span>
          </div>
        </div>
        <Tile icon={<ArrowUpCircle className="h-5 w-5 text-emerald-300" />} label="إجمالي الشحن" value={formatUsd(wallet.totalToppedUpUsd)} />
        <Tile icon={<TrendingDown className="h-5 w-5 text-rose-300" />} label="إجمالي الإنفاق" value={formatUsd(wallet.totalSpentUsd)} />
      </div>

      {/* Meta usage breakdown (30d) */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-brand-300" /> استهلاك Meta — آخر 30 يوم
          </h2>
          <div className="text-xs text-slate-500">
            {meta.conversations.toLocaleString()} محادثة · {meta.messages.toLocaleString()} رسالة
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">الفئة</th>
                <th className="text-right p-2">المحادثات</th>
                <th className="text-right p-2">الرسائل</th>
                <th className="text-right p-2">التكلفة</th>
              </tr>
            </thead>
            <tbody>
              {meta.byCategory.map((c) => (
                <tr key={c.category} className="border-t border-white/5">
                  <td className="p-2">{CATEGORY_LABELS[c.category] || c.category}</td>
                  <td className="p-2">{c.conversations.toLocaleString()}</td>
                  <td className="p-2">{c.messages.toLocaleString()}</td>
                  <td className="p-2 font-semibold">{formatUsdPrecise(c.charged)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10 font-bold">
                <td className="p-2">الإجمالي</td>
                <td className="p-2">{meta.conversations.toLocaleString()}</td>
                <td className="p-2">{meta.messages.toLocaleString()}</td>
                <td className="p-2 text-amber-300">{formatUsd(meta.charged)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!walletFlags.billingEnabled && (
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
            <Coins className="h-3 w-3" /> التكلفة المعروضة <b className="mx-1">تقديرية</b> (وضع المعاينة) — لم يبدأ الخصم الفعلي من المحفظة بعد.
          </p>
        )}
      </div>

      {/* Invoices — one per completed payment, generated on first download */}
      {invoicableTransactions.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-brand-300" /> الفواتير
          </h2>
          <div className="divide-y divide-white/5">
            {invoicableTransactions.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <div className="text-slate-200">
                    {new Date(t.createdAt).toLocaleDateString("ar-EG")} · {t.provider}
                  </div>
                  <div className="text-xs text-slate-500">{formatUsdPrecise(t.amountUsd)}</div>
                </div>
                <a
                  href={`/api/invoices/${t.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
                >
                  <Download className="h-3.5 w-3.5" /> تحميل الفاتورة
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive: top-up, calculator, ledger */}
      <WalletClient initialThreshold={wallet.lowBalanceThresholdUsd} payableMethods={JSON.parse(JSON.stringify(payableMethods))} />

      <p className="text-xs text-slate-500">
        الأسعار بالدولار الأمريكي. تُحسب تكلفة Meta لكل محادثة (نافذة 24 ساعة) حسب فئة الرسالة ودولة العميل.{" "}
        <Link href="/dashboard/usage" className="text-brand-300 hover:underline">عرض حدود الباقة</Link>
      </p>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">{icon}<span>{label}</span></div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
