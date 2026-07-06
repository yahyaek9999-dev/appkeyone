/**
 * Admin Billing Analytics — revenue / profit / cost / unit-economics.
 *
 * Read-only server component. Admin-gated by app/admin/layout.tsx. Aggregates
 * the wallet, payments and QR-queue engines over a ?days=7|30|90 window:
 *   - Revenue   : period topup revenue, paid payment volume, wallet balance.
 *   - Profit    : Meta charged / cost / profit + margin %.
 *   - Cost/unit : cost per customer / message / conversation + unbilled debt.
 *   - Tables    : payments by provider, Meta category breakdown.
 *   - QR tile   : utilization, no-show rate, avg wait, lanes.
 * All money is USD.
 */
import Link from "next/link";
import { getWalletPlatformStats } from "@/lib/wallet/analytics";
import { getPaymentStats } from "@/lib/payments";
import { getQueueAnalytics } from "@/lib/qr-queue";
import { formatUsd, formatUsdPrecise } from "@/lib/wallet/money";
import {
  ArrowUpCircle, CreditCard, Wallet, Coins, TrendingDown, TrendingUp,
  Percent, Users, MessageSquare, AlertCircle, CalendarClock, Clock, Gauge,
} from "lucide-react";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "تسويقية", utility: "خدمية (Utility)", authentication: "مصادقة", service: "محادثة (Service)",
};

const PROVIDER_LABELS: Record<string, string> = {
  paymob: "Paymob", stripe: "Stripe", manual: "تحويل يدوي",
};

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = searchParams?.days === "7" ? 7 : searchParams?.days === "90" ? 90 : 30;

  const [wallet, payments, queue] = await Promise.all([
    getWalletPlatformStats({ days }).catch(() => null),
    getPaymentStats({ days }).catch(() => null),
    getQueueAnalytics({ days }).catch(() => null),
  ]);

  const wt = wallet?.totals;
  const pt = payments?.totals;
  const byProvider = payments?.byProvider || [];
  const byCategory = wallet?.byCategory || [];
  const marginPct = wt && wt.metaCharged > 0 ? Math.round((wt.metaProfit / wt.metaCharged) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">تحليلات الإيرادات والأرباح</h1>
          <p className="page-desc">
            الإيراد والربح والتكلفة لكل وحدة عبر المنصة — يُحسب من السجلات الفعلية{wallet?.sinceDay ? ` (منذ ${wallet.sinceDay})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as const).map((d) => (
            <Link key={d} href={`/admin/analytics?days=${d}`}
              className={"px-3 py-1 rounded-lg text-sm border " + (days === d ? "bg-brand-500/20 border-brand-400/40 text-white" : "border-white/10 text-slate-400 hover:text-white")}>
              {d === 7 ? "7 أيام" : d === 30 ? "30 يوم" : "90 يوم"}
            </Link>
          ))}
        </div>
      </div>

      {/* Revenue */}
      <section>
        <h2 className="section-title mb-3">الإيرادات</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile icon={<ArrowUpCircle className="h-5 w-5 text-emerald-300" />} label="إيراد الشحن (الفترة)" value={formatUsd(wt?.periodTopupsUsd || 0)} sub={`الإجمالي التاريخي ${formatUsd(wt?.totalToppedUpUsd || 0)}`} />
          <Tile icon={<CreditCard className="h-5 w-5 text-sky-300" />} label="حجم المدفوعات المدفوعة" value={formatUsd(pt?.paidVolumeUsd || 0)} sub={`${(pt?.paid || 0).toLocaleString()} عملية مدفوعة`} />
          <Tile icon={<Wallet className="h-5 w-5 text-brand-300" />} label="إجمالي رصيد المحافظ" value={formatUsd(wt?.totalBalanceUsd || 0)} sub={`${(wt?.walletCount || 0).toLocaleString()} محفظة`} />
        </div>
      </section>

      {/* Profit */}
      <section>
        <h2 className="section-title mb-3">الأرباح (Meta)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={<Coins className="h-5 w-5 text-amber-300" />} label="محتسب على العملاء" value={formatUsd(wt?.metaCharged || 0)} sub={`${(wt?.metaConversations || 0).toLocaleString()} محادثة`} />
          <Tile icon={<TrendingDown className="h-5 w-5 text-rose-300" />} label="تكلفة Meta الفعلية" value={formatUsd(wt?.metaCost || 0)} sub="ما تدفعه KEYONE" />
          <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="الربح من Meta" value={formatUsd(wt?.metaProfit || 0)} tone={(wt?.metaProfit || 0) >= 0 ? "ok" : "warn"} />
          <Tile icon={<Percent className="h-5 w-5 text-brand-300" />} label="هامش الربح" value={`${marginPct}%`} tone={marginPct >= 0 ? "ok" : "warn"} />
        </div>
      </section>

      {/* Cost / unit economics */}
      <section>
        <h2 className="section-title mb-3">التكلفة لكل وحدة</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={<Users className="h-5 w-5 text-brand-300" />} label="تكلفة لكل تاجر" value={formatUsdPrecise(wt?.costPerCustomerUsd || 0)} />
          <Tile icon={<MessageSquare className="h-5 w-5 text-brand-300" />} label="تكلفة لكل رسالة" value={formatUsdPrecise(wt?.costPerMessageUsd || 0)} />
          <Tile icon={<Percent className="h-5 w-5 text-brand-300" />} label="تكلفة لكل محادثة" value={formatUsdPrecise(wt?.costPerConversationUsd || 0)} />
          <Tile icon={<AlertCircle className={"h-5 w-5 " + ((wt?.unbilledUsd || 0) > 0 ? "text-rose-300" : "text-slate-400")} />} label="ديون غير محصّلة" value={formatUsdPrecise(wt?.unbilledUsd || 0)} sub={`${(wt?.unbilledConversations || 0).toLocaleString()} محادثة`} tone={(wt?.unbilledUsd || 0) > 0 ? "warn" : "ok"} />
        </div>
      </section>

      {/* Payments by provider */}
      <div className="card p-5">
        <h2 className="font-bold text-lg mb-4">المدفوعات حسب المزوّد</h2>
        {byProvider.length === 0 ? (
          <div className="text-slate-500 text-sm py-8 text-center">لا توجد مدفوعات مسجّلة في هذه النافذة الزمنية بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-right p-2">المزوّد</th>
                  <th className="text-right p-2">الإجمالي</th>
                  <th className="text-right p-2">مدفوع</th>
                  <th className="text-right p-2">معلّق</th>
                  <th className="text-right p-2">فاشل</th>
                  <th className="text-right p-2">منتهٍ</th>
                  <th className="text-right p-2">حجم المدفوع</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((p) => (
                  <tr key={p.provider} className="border-t border-white/5">
                    <td className="p-2">{PROVIDER_LABELS[p.provider] || p.provider}</td>
                    <td className="p-2">{p.total.toLocaleString()}</td>
                    <td className="p-2 text-emerald-300">{p.paid.toLocaleString()}</td>
                    <td className="p-2 text-amber-300">{p.pending.toLocaleString()}</td>
                    <td className={"p-2 " + (p.failed > 0 ? "text-rose-300" : "text-slate-400")}>{p.failed.toLocaleString()}</td>
                    <td className="p-2 text-slate-400">{p.expired.toLocaleString()}</td>
                    <td className="p-2 font-semibold">{formatUsd(p.paidVolumeUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pt && pt.uncreditedPaid > 0 && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {pt.uncreditedPaid.toLocaleString()} عملية مدفوعة دون إضافة للرصيد — تحتاج تسوية.
          </div>
        )}
      </div>

      {/* Meta category breakdown */}
      <div className="card p-5">
        <h2 className="font-bold text-lg mb-4">حسب فئة المحادثة (Meta)</h2>
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

      {/* QR utilization */}
      <section>
        <h2 className="section-title mb-3">إشغال طابور QR</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={<Gauge className="h-5 w-5 text-emerald-300" />} label="نسبة الإشغال" value={`${queue?.utilizationPct ?? 0}%`} />
          <Tile icon={<AlertCircle className={"h-5 w-5 " + ((queue?.noShowRatePct || 0) > 0 ? "text-amber-300" : "text-slate-400")} />} label="نسبة عدم الحضور" value={`${queue?.noShowRatePct ?? 0}%`} tone={(queue?.noShowRatePct || 0) > 20 ? "warn" : "ok"} />
          <Tile icon={<Clock className="h-5 w-5 text-brand-300" />} label="متوسط الانتظار" value={`${queue?.avgWaitSec ?? 0} ث`} />
          <Tile icon={<CalendarClock className="h-5 w-5 text-sky-300" />} label="عدد المسارات" value={(queue?.lanes ?? 0).toLocaleString()} sub={`${queue?.totals?.reservations ?? 0} حجز بالفترة`} />
        </div>
      </section>
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
