/**
 * Admin Wallet + Meta Billing super-center.
 *
 * Read-only platform analytics (revenue, cost, profit, cost-per-X, category
 * breakdown, per-tenant rows) + interactive controls (per-tenant credit/debit/
 * adjust, top-up review queue, Meta rate-card editor). Admin-gated by the
 * /admin layout. All money is USD.
 */
import Link from "next/link";
import { getWalletPlatformStats } from "@/lib/wallet/analytics";
import { walletFlags } from "@/lib/wallet/flags";
import { formatUsd, formatUsdPrecise } from "@/lib/wallet/money";
import { Wallet, Coins, TrendingUp, TrendingDown, Users, MessageSquare, AlertCircle, ArrowUpCircle, Percent } from "lucide-react";
import { TenantTable, TopupQueue, RateCardEditor } from "./admin-wallet-client";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "تسويقية", utility: "خدمية (Utility)", authentication: "مصادقة", service: "محادثة (Service)",
};

export default async function AdminWalletPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = searchParams?.days === "7" ? 7 : searchParams?.days === "90" ? 90 : 30;
  const { totals: t, byCategory, rows, sinceDay } = await getWalletPlatformStats({ days });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">المحفظة وفوترة Meta</h1>
          <p className="page-desc">
            رصيد المحافظ، إيرادات الشحن، تكلفة Meta، والأرباح لكل تاجر — يُحسب من السجلات الفعلية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as const).map((d) => (
            <Link key={d} href={`/admin/wallet?days=${d}`}
              className={"px-3 py-1 rounded-lg text-sm border " + (days === d ? "bg-brand-500/20 border-brand-400/40 text-white" : "border-white/10 text-slate-400 hover:text-white")}>
              {d === 7 ? "7 أيام" : d === 30 ? "30 يوم" : "90 يوم"}
            </Link>
          ))}
        </div>
      </div>

      {!walletFlags.billingEnabled && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm text-amber-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> وضع المعاينة: يُسجَّل استهلاك Meta ويُعرض كتقدير، دون خصم فعلي من المحافظ. فعّل <code className="mx-1 font-mono">WALLET_BILLING_ENABLED=1</code> لبدء الخصم.
        </div>
      )}

      {/* Money tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Wallet className="h-5 w-5 text-brand-300" />} label="إجمالي رصيد المحافظ" value={formatUsd(t.totalBalanceUsd)} sub={`${t.walletCount} محفظة`} />
        <Tile icon={<ArrowUpCircle className="h-5 w-5 text-emerald-300" />} label="إيراد الشحن (الفترة)" value={formatUsd(t.periodTopupsUsd)} sub={`الإجمالي التاريخي ${formatUsd(t.totalToppedUpUsd)}`} />
        <Tile icon={<Coins className="h-5 w-5 text-amber-300" />} label="ما يُحتسب على العملاء (Meta)" value={formatUsd(t.metaCharged)} sub={`${t.metaConversations.toLocaleString()} محادثة`} />
        <Tile icon={<TrendingDown className="h-5 w-5 text-rose-300" />} label="تكلفة Meta الفعلية" value={formatUsd(t.metaCost)} sub="ما تدفعه KEYONE" />
        <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="الربح من Meta" value={formatUsd(t.metaProfit)} tone={t.metaProfit >= 0 ? "ok" : "warn"} sub={t.metaCost > 0 ? `هامش ${Math.round((t.metaProfit / t.metaCharged || 0) * 100)}%` : "—"} />
        <Tile icon={<TrendingDown className="h-5 w-5 text-slate-300" />} label="إنفاق العملاء (الفترة)" value={formatUsd(t.periodDebitsUsd)} sub={`الإجمالي التاريخي ${formatUsd(t.totalSpentUsd)}`} />
        <Tile icon={<AlertCircle className={"h-5 w-5 " + (t.unbilledUsd > 0 ? "text-rose-300" : "text-slate-400")} />} label="ديون غير محصّلة" value={formatUsd(t.unbilledUsd)} sub={`${t.unbilledConversations} محادثة`} tone={t.unbilledUsd > 0 ? "warn" : "ok"} />
        <Tile icon={<Users className="h-5 w-5 text-sky-300" />} label="تجار نشطون (Meta)" value={t.activeTenants.toLocaleString()} sub={`منذ ${sinceDay}`} />
      </div>

      {/* Unit economics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile icon={<Users className="h-5 w-5 text-brand-300" />} label="تكلفة Meta لكل تاجر" value={formatUsdPrecise(t.costPerCustomerUsd)} />
        <Tile icon={<MessageSquare className="h-5 w-5 text-brand-300" />} label="تكلفة Meta لكل رسالة" value={formatUsdPrecise(t.costPerMessageUsd)} />
        <Tile icon={<Percent className="h-5 w-5 text-brand-300" />} label="تكلفة Meta لكل محادثة" value={formatUsdPrecise(t.costPerConversationUsd)} />
      </div>

      {/* Category breakdown */}
      <div className="card p-5">
        <h2 className="font-bold text-lg mb-4">حسب فئة المحادثة</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/5">
                <th className="text-right p-2">الفئة</th>
                <th className="text-right p-2">المحادثات</th>
                <th className="text-right p-2">الرسائل</th>
                <th className="text-right p-2">محتسب على العملاء</th>
                <th className="text-right p-2">تكلفة Meta</th>
                <th className="text-right p-2">الربح</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.category} className="border-t border-white/5">
                  <td className="p-2">{CATEGORY_LABELS[c.category] || c.category}</td>
                  <td className="p-2">{c.conversations.toLocaleString()}</td>
                  <td className="p-2">{c.messages.toLocaleString()}</td>
                  <td className="p-2 font-semibold text-amber-300">{formatUsdPrecise(c.charged)}</td>
                  <td className="p-2 text-rose-300">{formatUsdPrecise(c.metaCost)}</td>
                  <td className={"p-2 " + (c.profit >= 0 ? "text-emerald-300" : "text-rose-300")}>{formatUsdPrecise(c.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top-up review queue */}
      <TopupQueue pending={t.pendingTopups} />

      {/* Per-tenant wallets + management */}
      <TenantTable rows={rows} />

      {/* Meta rate-card editor */}
      <RateCardEditor />
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
