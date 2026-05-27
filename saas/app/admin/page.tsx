import { prisma } from "@/lib/db";
import { Users, MessageCircle, DollarSign, AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const [totalUsers, activeSubs, pendingSubs, expiredSubs, totalMessages, last7DaysSignups] =
    await Promise.all([
      prisma.user.count({ where: { role: "user" } as any }),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { status: "pending" } }),
      prisma.subscription.count({ where: { status: "expired" } }),
      prisma.message.count(),
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, role: "user" as any } }),
    ]);

  const activeSubsList = await prisma.subscription.findMany({
    where: { status: "active" }, include: { plan: true },
  });
  const mrrUsd = activeSubsList.reduce((sum: number, s: any) => {
    const price = s.billingCycle === "yearly" ? Math.round((s.plan.yearlyUsd || s.plan.priceUsd * 10) / 12) : s.plan.priceUsd;
    return sum + price;
  }, 0);
  return { totalUsers, activeSubs, pendingSubs, expiredSubs, totalMessages, last7DaysSignups, mrrUsd };
}

export default async function AdminHome() {
  const s = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">نظرة عامة</h1>
        <p className="page-desc">إحصائيات المنصة في الوقت الفعلي.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="إجمالي العملاء"
          value={s.totalUsers.toLocaleString()} accent="from-blue-500/20 to-blue-600/5 text-blue-400" />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="اشتراكات نشطة"
          value={s.activeSubs.toLocaleString()} accent="from-emerald-500/20 to-green-500/5 text-emerald-400" />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="بانتظار التفعيل"
          value={s.pendingSubs.toLocaleString()} accent="from-amber-500/20 to-orange-500/5 text-amber-400" />
        <StatCard icon={<MessageCircle className="h-4 w-4" />} label="إجمالي الرسائل"
          value={s.totalMessages.toLocaleString()} accent="from-purple-500/20 to-pink-500/5 text-purple-400" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="kpi-card border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] to-transparent">
          <div className="text-xs font-medium text-emerald-400/80">الإيراد الشهري المتوقع (MRR)</div>
          <div className="kpi-value mt-1">${s.mrrUsd.toLocaleString("en-US")}</div>
          <div className="mt-1 text-xs text-slate-500">من {s.activeSubs} اشتراك نشط</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">تسجيلات آخر 7 أيام</div>
          <div className="kpi-value mt-1">{s.last7DaysSignups}</div>
          <div className="mt-1 text-xs text-slate-500">عميل جديد</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">اشتراكات منتهية</div>
          <div className="kpi-value mt-1 text-rose-400">{s.expiredSubs}</div>
          <div className="mt-1 text-xs text-slate-500">تحتاج تجديد</div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="section-title mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href="/admin/users" className="card-hover p-4">
            <Users className="mb-2 h-5 w-5 text-brand-400" />
            <div className="text-sm font-semibold text-white">إدارة العملاء</div>
            <div className="mt-0.5 text-xs text-slate-500">تفعيل/تجديد/إلغاء العضويات</div>
          </Link>
          <Link href="/admin/settings" className="card-hover p-4">
            <DollarSign className="mb-2 h-5 w-5 text-emerald-400" />
            <div className="text-sm font-semibold text-white">إعدادات الموقع</div>
            <div className="mt-0.5 text-xs text-slate-500">رقم الواتساب، البريد، البراند</div>
          </Link>
          <Link href="/admin/users" className="card-hover border-amber-500/15 bg-amber-500/[0.04] p-4">
            <AlertTriangle className="mb-2 h-5 w-5 text-amber-400" />
            <div className="text-sm font-semibold text-white">المعلقة ({s.pendingSubs})</div>
            <div className="mt-0.5 text-xs text-slate-500">عملاء بانتظار التفعيل</div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string;
}) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon border ${accent}`}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
