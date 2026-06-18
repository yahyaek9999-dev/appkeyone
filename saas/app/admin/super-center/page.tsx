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
import { getExecutiveStats } from "@/lib/admin/executive";
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
  { href: "/admin/brain", label: "مركز الدماغ", desc: "الذاكرة والتصنيفات واللهجات والقطاعات وأرصدة الدماغ", icon: Activity },
  { href: "/admin/brain/global", label: "الدماغ العالمي", desc: "أنماط مجهولة الهوية متعلَّمة من كل المستأجرين", icon: Activity },
  { href: "/admin/agents", label: "مركز الوكلاء", desc: "تنفيذات الوكلاء والقرارات والإجراءات", icon: Users },
  { href: "/admin/reports", label: "التقارير التنفيذية", desc: "تقارير يومية/أسبوعية/شهرية للإيراد والربح والاستخدام", icon: BarChart3 },
  { href: "/admin/membership-audit", label: "تدقيق عزل الباقات", desc: "تغطية تبويب القدرات المدفوعة عبر الصفحات والـAPIs", icon: Activity },
  { href: "/admin/white-label", label: "العلامة البيضاء", desc: "إعدادات العلامة والألوان والنطاقات عبر المستأجرين", icon: LayoutGrid },
  { href: "/admin/brain/marketplace", label: "متجر الأدمغة", desc: "تفعيل/تعطيل وتسعير أدمغة القطاعات", icon: Coins },
  { href: "/admin/operations-center", label: "مركز العمليات", desc: "شاشة واحدة: إيراد، مدفوعات معلّقة، التزامات، حوادث، طاقم", icon: Activity },
  { href: "/admin/payment-reviews", label: "مراجعة المدفوعات", desc: "طابور اعتماد المدفوعات اليدوية → شحن + تفعيل", icon: CreditCard },
  { href: "/admin/payment-accounts", label: "حسابات الاستلام", desc: "طرق الدفع (9) وحسابات الاستلام للطاقم", icon: Wallet },
  { href: "/admin/staff", label: "إدارة الطاقم", desc: "إنشاء/إيقاف الطاقم، الأقسام، عبء العمل", icon: Users },
  { href: "/admin/incidents", label: "الحوادث", desc: "كشف الأعطال وتوجيهها تلقائيًا للأقسام", icon: AlertCircle },
  { href: "/admin/internal-kb", label: "المعرفة الداخلية", desc: "حلول الأعطال (مشكلة/سبب/حل) للطاقم", icon: BarChart3 },
  { href: "/admin/memberships", label: "مصفوفة الباقات", desc: "المقارنة الدقيقة لكل الباقات", icon: LayoutGrid },
];

export default async function AdminSuperCenterPage() {
  const [wallet, payments, snapshot, exec] = await Promise.all([
    getWalletPlatformStats({ days: 30 }).catch(() => null),
    getPaymentStats({ days: 30 }).catch(() => null),
    getQueueSnapshot().catch(() => null),
    getExecutiveStats().catch(() => null),
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

      {/* Executive band (Phase 6) */}
      <div>
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-3"><TrendingUp className="h-4 w-4" /><span>المؤشرات التنفيذية</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="MRR" value={formatUsd(exec?.mrr || 0)} />
          <Tile icon={<TrendingUp className="h-5 w-5 text-emerald-300" />} label="ARR" value={formatUsd(exec?.arr || 0)} />
          <Tile icon={<Wallet className="h-5 w-5 text-amber-300" />} label="التزام المحفظة" value={formatUsd(exec?.walletLiability || 0)} />
          <Tile icon={<Coins className="h-5 w-5 text-brand-300" />} label="التزام رصيد الدماغ" value={(exec?.brainCreditsLiability || 0).toLocaleString()} />
          <Tile icon={<Coins className="h-5 w-5 text-brand-300" />} label="التزام رصيد الحملات" value={(exec?.broadcastCreditsLiability || 0).toLocaleString()} />
          <Tile icon={<Activity className="h-5 w-5 text-sky-300" />} label="استهلاك الدماغ" value={(exec?.brainUsage || 0).toLocaleString()} />
          <Tile icon={<Send className="h-5 w-5 text-sky-300" />} label="استخدام API" value={(exec?.apiUsage || 0).toLocaleString()} />
          <Tile icon={<Users className="h-5 w-5 text-sky-300" />} label="عملاء" value={(exec?.customers || 0).toLocaleString()} sub={`+${(exec?.customers30 || 0).toLocaleString()} (30 يوم)`} />
          <Tile icon={<CalendarClock className="h-5 w-5 text-brand-300" />} label="حجوزات QR" value={(exec?.qrReservations || 0).toLocaleString()} sub={`${exec?.qrActive || 0} نشطة`} />
          <Tile icon={<BarChart3 className="h-5 w-5 text-emerald-300" />} label="أعلى باقة" value={exec?.topPlans?.[0]?.slug || "—"} sub={`${exec?.topPlans?.[0]?.count || 0} مشترك`} />
        </div>
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
