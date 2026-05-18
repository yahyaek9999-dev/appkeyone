import { prisma } from "@/lib/db";
import { Users, MessageCircle, DollarSign, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

async function getStats() {
  const [
    totalUsers,
    activeSubs,
    pendingSubs,
    expiredSubs,
    totalMessages,
    last7DaysSignups,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "user" } as any }),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "pending" } }),
    prisma.subscription.count({ where: { status: "expired" } }),
    prisma.message.count(),
    prisma.user.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, role: "user" as any },
    }),
  ]);

  // Compute estimated MRR (active subs * plan price)
  const activeSubsList = await prisma.subscription.findMany({
    where: { status: "active" },
    include: { plan: true },
  });
  const mrrUsd = activeSubsList.reduce((sum: number, s: any) => {
    const price = s.billingCycle === "yearly" ? Math.round((s.plan.yearlyUsd || s.plan.priceUsd * 10) / 12) : s.plan.priceUsd;
    return sum + price;
  }, 0);

  return { totalUsers, activeSubs, pendingSubs, expiredSubs, totalMessages, last7DaysSignups, mrrUsd };
}

export default async function AdminHome() {
  const s = await getStats();

  const cards = [
    { label: "إجمالي العملاء", value: s.totalUsers, icon: Users, color: "from-blue-500 to-cyan-500" },
    { label: "اشتراكات نشطة", value: s.activeSubs, icon: DollarSign, color: "from-emerald-500 to-green-500" },
    { label: "بانتظار التفعيل", value: s.pendingSubs, icon: AlertTriangle, color: "from-amber-500 to-orange-500" },
    { label: "إجمالي الرسائل", value: s.totalMessages.toLocaleString("en-US"), icon: MessageCircle, color: "from-purple-500 to-pink-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">نظرة عامة</h1>
        <p className="text-slate-400">إحصائيات المنصة في الوقت الفعلي.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mb-3`}>
              <c.icon className="w-5 h-5" />
            </div>
            <div className="text-sm text-slate-400">{c.label}</div>
            <div className="text-2xl font-bold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6">
          <div className="text-sm text-emerald-300">الإيراد الشهري المتوقع (MRR)</div>
          <div className="text-4xl font-bold mt-2">${s.mrrUsd.toLocaleString("en-US")}</div>
          <div className="text-sm text-slate-400 mt-2">من {s.activeSubs} اشتراك نشط</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-slate-400">تسجيلات آخر 7 أيام</div>
          <div className="text-4xl font-bold mt-2">{s.last7DaysSignups}</div>
          <div className="text-sm text-slate-400 mt-2">عميل جديد</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-sm text-slate-400">اشتراكات منتهية</div>
          <div className="text-4xl font-bold mt-2 text-rose-400">{s.expiredSubs}</div>
          <div className="text-sm text-slate-400 mt-2">تحتاج تجديد</div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="font-bold text-lg mb-3">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href="/admin/users" className="block p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
            <Users className="w-5 h-5 mb-2 text-brand-400" />
            <div className="font-semibold">إدارة العملاء</div>
            <div className="text-sm text-slate-400 mt-1">تفعيل/تجديد/إلغاء العضويات</div>
          </a>
          <a href="/admin/settings" className="block p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
            <DollarSign className="w-5 h-5 mb-2 text-emerald-400" />
            <div className="font-semibold">إعدادات الموقع</div>
            <div className="text-sm text-slate-400 mt-1">رقم الواتساب، البريد، البراند</div>
          </a>
          <a href="/admin/users" className="block p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition">
            <AlertTriangle className="w-5 h-5 mb-2 text-amber-400" />
            <div className="font-semibold">المعلقة ({s.pendingSubs})</div>
            <div className="text-sm text-slate-400 mt-1">عملاء بانتظار التفعيل</div>
          </a>
        </div>
      </div>
    </div>
  );
}
