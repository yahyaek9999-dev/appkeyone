/**
 * Admin Super Center — the unified admin hub.
 *
 * One screen that surfaces the platform's money + ops vitals (wallet balance,
 * topup revenue, Meta profit, paid payments, active tenants, live QR lanes,
 * pending top-ups) and links out to every billing/ops admin section.
 *
 * Read-only server component. Admin-gated by app/admin/layout.tsx. Each engine
 * call is wrapped so one failing source never blanks the whole hub. All money
 * is USD.
 */
import Link from "next/link";
import { getWalletPlatformStats } from "@/lib/wallet/analytics";
import { getPaymentStats } from "@/lib/payments";
import { getQueueSnapshot } from "@/lib/qr-queue";
import { formatUsd } from "@/lib/wallet/money";
import {
  LayoutGrid, Wallet, ArrowUpCircle, TrendingUp, CreditCard, Users,
  CalendarClock, AlertCircle, BarChart3, Send, Activity, Download,
  KeyRound, Coins, ChevronLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

const HUB_CARDS: Array<{ href: string; label: string; desc: string; icon: any }> = [
  { href: "/admin/analytics", label: "تحليلات الإيرادات والأرباح", desc: "الإيراد والربح والتكلفة لكل وحدة عبر النوافذ الزمنية", icon: TrendingUp },
  { href: "/admin/wallet", label: "المحفظة وفوترة Meta", desc: "أرصدة المحافظ، شحن، وتكلفة وأرباح Meta لكل تاجر", icon: Wallet },
  { href: "/admin/payments", label: "المدفوعات والتسوية", desc: "حجم المدفوعات وحالتها لكل مزوّد دفع", icon: CreditCard },
  { href: "/admin/qr-queue", label: "طابور جلسات QR", desc: "الحجوزات والمسارات والإشغال وإدارة الجلسات", icon: CalendarClock },
  { href: "/admin/broadcast-credits", label: "رصيد الحملات", desc: "أرصدة حملات QR ومنح/خصم لكل تاجر", icon: Send },
  { href: "/admin/customer-cap", label: "حدّ العملاء", desc: "سقف عدد عملاء المنصة لكل تاجر", icon: Activity },
  { href: "/admin/import", label: "استيراد العملاء", desc: "استيراد دفعات العملاء وبناء الذاكرة", icon: Download },
  { href: "/admin/api-keys", label: "مفاتيح API", desc: "إصدار وإدارة مفاتيح الوصول البرمجي", icon: KeyRound },
  { href: "/admin/tenant-costs", label: "التكلفة لكل تاجر", desc: "استهلاك الذكاء الاصطناعي والأداء التشغيلي", icon: Coins },
  { href: "/admin/usage-stats", label: "إحصائيات الاستخدام", desc: "أنماط الاستخدام والحجم عبر المنصة", icon: BarChart3 },
];

export default async function AdminSuperCenterPage() {
  const [wallet, payments, snapshot] = await Promise.all([
    getWalletPlatformStats({ days: 30 }).catch(() => null),
    getPaymentStats({ days: 30 }).catch(() => null),
    getQueueSnapshot().catch(() => null),
  ]);

  const wt = wallet?.totals;
  const pt = payments?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">المركز الإداري الموحّد</h1>
        <p className="page-desc">
          نظرة واحدة على إيرادات المنصة وأرباحها وعملياتها — مع روابط لكل أقسام الفوترة والتشغيل. للقراءة فقط، يُحسب من السجلات الفعلية (آخر 30 يوم).
        </p>
      </div>

      {/* Vitals band */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Wallet className="h-5 w-5 text-brand-300" />} label="إجمالي رصيد المحافظ" value={formatUsd(wt?.totalBalanceUsd || 0)} sub={`${(wt?.walletCount || 0).toLocaleString()} محفظة`} />
        <Tile icon={<ArrowUpCircle className="h-5 w-5 text-emerald-300" />} label="إيراد الشحن (30 يوم)" value={formatUsd(wt?.periodTopupsUsd || 0)} />
        <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="الربح من Meta" value={formatUsd(wt?.metaProfit || 0)} tone={(wt?.metaProfit || 0) >= 0 ? "ok" : "warn"} sub="محتسب − تكلفة" />
        <Tile icon={<CreditCard className="h-5 w-5 text-sky-300" />} label="مدفوعات مدفوعة (30 يوم)" value={formatUsd(pt?.paidVolumeUsd || 0)} sub={`${(pt?.paid || 0).toLocaleString()} عملية`} />
        <Tile icon={<Users className="h-5 w-5 text-sky-300" />} label="تجار نشطون" value={(wt?.activeTenants || 0).toLocaleString()} />
        <Tile icon={<CalendarClock className="h-5 w-5 text-brand-300" />} label="مسارات QR نشطة الآن" value={`${snapshot?.activeNow ?? 0} / ${snapshot?.lanes ?? 0}`} sub={`${snapshot?.availableNow ?? 0} متاح الآن`} />
        <Tile icon={<AlertCircle className={"h-5 w-5 " + ((wt?.pendingTopups || 0) > 0 ? "text-amber-300" : "text-slate-400")} />} label="طلبات شحن معلّقة" value={(wt?.pendingTopups || 0).toLocaleString()} tone={(wt?.pendingTopups || 0) > 0 ? "warn" : "ok"} />
        <Tile icon={<AlertCircle className={"h-5 w-5 " + ((wt?.unbilledUsd || 0) > 0 ? "text-rose-300" : "text-slate-400")} />} label="ديون غير محصّلة" value={formatUsd(wt?.unbilledUsd || 0)} sub={`${(wt?.unbilledConversations || 0).toLocaleString()} محادثة`} tone={(wt?.unbilledUsd || 0) > 0 ? "warn" : "ok"} />
      </div>

      {/* Hub navigation */}
      <div>
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
          <LayoutGrid className="h-4 w-4" />
          <span>أقسام الفوترة والتشغيل</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.href} href={c.href} className="card card-hover p-4 group">
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">{c.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{c.desc}</div>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-gold-300" />
                </div>
              </Link>
            );
          })}
        </div>
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
