import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { redirect } from "next/navigation";
import {
  MessageSquare,
  Users,
  BellRing,
  TrendingUp,
  Phone,
  AlertCircle,
  CheckCircle2,
  Crown,
  Clock,
  Inbox,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { StatGrid } from "@/components/ui/stat-grid";
import { TrendBadge } from "@/components/ui/trend-badge";
import { Sparkline } from "@/components/ui/sparkline";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const user = await requireUser();

  // Polish: send brand-new users straight to the onboarding wizard if they
  // haven't created a bot yet. Existing users continue to see the dashboard.
  const bot = await prisma.bot.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!bot) redirect("/onboarding");

  const cfg = await getSiteConfig();
  const subRow = await prisma.subscription.findUnique({
    where: { userId: user.id },
    include: { plan: true },
  });
  const evalResult = evaluateSubscription(subRow);
  const sub = {
    active: evalResult.allowed,
    reason: (evalResult as any).reason as string | undefined,
    subscription: subRow,
  };

  const now = new Date();
  const day = 24 * 3600 * 1000;
  const start7 = new Date(now.getTime() - 7 * day);
  const start14 = new Date(now.getTime() - 14 * day);
  const start30 = new Date(now.getTime() - 30 * day);

  const [
    customerCount,
    msgCount,
    flaggedCount,
    msgs7d,
    msgsPrior7d,
    msgs30dToday,
    recentMsgs,
    topCustomers,
    dailySeries,
  ] = await Promise.all([
    prisma.customer.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({
      where: { flagged: true, conversation: { customer: { userId: user.id } } },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: start7 },
        conversation: { customer: { userId: user.id } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: start14, lt: start7 },
        conversation: { customer: { userId: user.id } },
      },
    }),
    prisma.message.count({
      where: {
        createdAt: { gte: new Date(now.getTime() - day) },
        conversation: { customer: { userId: user.id } },
      },
    }),
    prisma.message.findMany({
      where: { conversation: { customer: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { conversation: { include: { customer: true } } },
    }),
    prisma.customer.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" },
      take: 6,
    }),
    // Build last-30-day daily counts in one query.
    prisma.$queryRawUnsafe<{ day: string; total: number }[]>(
      `SELECT strftime('%Y-%m-%d', m.createdAt) AS day, COUNT(*) AS total
       FROM Message m
       JOIN Conversation c ON c.id = m.conversationId
       JOIN Customer cu ON cu.id = c.customerId
       WHERE cu.userId = ? AND m.createdAt >= ?
       GROUP BY day
       ORDER BY day ASC`,
      user.id,
      start30.toISOString()
    ).catch(() => []),
  ]);

  // Build a dense series for the last 30 days
  const seriesMap = new Map<string, number>();
  for (const row of dailySeries) {
    seriesMap.set(row.day, Number(row.total));
  }
  const last30: { day: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * day);
    const key = d.toISOString().slice(0, 10);
    last30.push({ day: key, total: seriesMap.get(key) || 0 });
  }
  const maxDaily = Math.max(1, ...last30.map((d) => d.total));
  const last7Series = last30.slice(-7).map((d) => d.total);

  // Real 7-day delta vs prior 7 days
  const msgs7dDelta =
    msgsPrior7d > 0
      ? ((msgs7d - msgsPrior7d) / msgsPrior7d) * 100
      : msgs7d > 0
      ? 100
      : null;

  const plan = sub.subscription?.plan;
  const usagePct =
    plan && plan.monthlyMsgs > 0 && sub.subscription
      ? Math.min(100, Math.round((sub.subscription.msgsUsed / plan.monthlyMsgs) * 100))
      : 0;
  const daysLeft = sub.subscription?.expiresAt
    ? Math.max(0, Math.ceil((sub.subscription.expiresAt.getTime() - Date.now()) / day))
    : 0;

  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">أهلاً, {user.name || "صديقي"} 👋</h1>
          <p className="text-slate-400">نظرة عامة على أداء بوتك</p>
        </div>
        <SubscriptionBadge sub={sub} daysLeft={daysLeft} waNum={waNum} />
      </div>

      {/* Subscription banner */}
      {!sub.active && (
        <div className="card p-5 mb-6 bg-amber-500/10 border-amber-500/30 flex flex-wrap items-center gap-4">
          <AlertCircle className="w-7 h-7 text-amber-400" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-bold mb-0.5">
              {sub.subscription?.status === "pending"
                ? "اشتراكك بانتظار التفعيل من الإدارة"
                : sub.subscription?.status === "expired"
                ? "انتهت صلاحية اشتراكك"
                : sub.reason === "quota_exceeded"
                ? "وصلت الحد الأقصى من الرسائل لهذا الشهر"
                : "ليس لديك اشتراك نشط"}
            </div>
            <div className="text-sm text-slate-300">
              تواصل معنا عبر واتساب لتفعيل أو ترقية الاشتراك.
            </div>
          </div>
          {waNum && (
            <a
              href={`https://wa.me/${waNum}?text=${encodeURIComponent("أريد تفعيل/ترقية اشتراكي")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              تواصل واتساب
            </a>
          )}
        </div>
      )}

      {/* Stats */}
      <StatGrid cols={4} className="mb-6">
        <Stat icon={<Users />} label="إجمالي العملاء" value={customerCount.toLocaleString()} color="from-blue-500 to-cyan-500" />
        <Stat icon={<MessageSquare />} label="إجمالي الرسائل" value={msgCount.toLocaleString()} color="from-brand-500 to-emerald-500" />
        <Stat
          icon={<TrendingUp />}
          label="آخر 7 أيام"
          value={msgs7d.toLocaleString()}
          color="from-purple-500 to-pink-500"
          trend={msgs7dDelta}
          sparkline={last7Series}
        />
        <Stat icon={<BellRing />} label="تنبيهات الطلبات" value={flaggedCount.toLocaleString()} color="from-amber-500 to-orange-500" />
      </StatGrid>

      {/* Usage card */}
      {sub.subscription && plan && (
        <div className="card p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">استهلاك الباقة الحالية</div>
              <div className="text-xl font-bold flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                {plan.name}
              </div>
            </div>
            <div className="text-sm text-slate-300">
              {sub.subscription.msgsUsed.toLocaleString()} / {plan.monthlyMsgs.toLocaleString()} رسالة
            </div>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePct > 90
                  ? "bg-gradient-to-r from-rose-500 to-red-500"
                  : usagePct > 70
                  ? "bg-gradient-to-r from-amber-500 to-orange-500"
                  : "bg-gradient-to-r from-brand-500 to-emerald-500"
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-slate-400">
            <span>اليوم: {msgs30dToday.toLocaleString()} رسالة</span>
            <span>متبقي {daysLeft} يوم على التجديد</span>
          </div>
        </div>
      )}

      {/* Chart + Top customers */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">نشاط آخر 30 يوم</h2>
            <span className="text-xs text-slate-400">{msgCount.toLocaleString()} رسالة إجمالاً</span>
          </div>
          <div className="flex items-end gap-0.5 md:gap-1 h-44">
            {last30.map((d) => {
              const h = (d.total / maxDaily) * 100;
              return (
                <div
                  key={d.day}
                  className="group flex-1 flex flex-col items-center justify-end relative"
                  title={`${d.day}: ${d.total}`}
                >
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-brand-500/30 to-brand-500 transition-all hover:from-brand-400 hover:to-brand-300"
                    style={{ height: `${Math.max(h, 2)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>{last30[0].day.slice(5)}</span>
            <span>{last30[14].day.slice(5)}</span>
            <span>{last30[29].day.slice(5)}</span>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">عملاء نشطون</h2>
            <Link href="/dashboard/customers" className="text-xs text-brand-400 hover:underline">
              الكل ←
            </Link>
          </div>
          {topCustomers.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-full h-full" />}
              title="لسه ما فيش عملاء"
              description="أول ما حد يكلّم البوت هيظهر هنا."
              size="sm"
            />
          ) : (
            <div className="space-y-2">
              {topCustomers.map((c) => (
                <Link
                  href={`/dashboard/customers/${c.id}`}
                  key={c.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition"
                >
                  <Avatar name={c.name || c.phone} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.name || "بدون اسم"}</div>
                    {(() => {
                      const p = formatCustomerPhone(c.phone);
                      return p.isLid ? (
                        <div className="text-[10px] text-slate-500 italic" title={p.raw}>{p.display}</div>
                      ) : (
                        <bdi dir="ltr" className="text-[10px] text-slate-500 block">{p.display}</bdi>
                      );
                    })()}
                  </div>
                  <div className="text-[10px] text-slate-500">{timeAgo(c.lastSeenAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent messages */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">آخر الرسائل</h2>
          <Link href="/dashboard/customers" className="text-sm text-brand-400 hover:underline">
            عرض الكل ←
          </Link>
        </div>
        {recentMsgs.length === 0 ? (
          <EmptyState
            icon={<Inbox className="w-full h-full" />}
            title="لسه ما فيش رسائل"
            description="اربط واتساب أو جرّب البوت."
            size="md"
          />
        ) : (
          <div className="space-y-2">
            {recentMsgs.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition"
              >
                <Avatar
                  name={m.role === "user" ? (m.conversation.customer.name || m.conversation.customer.phone) : "BOT"}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                    <span className="font-medium">
                      {m.conversation.customer.name || m.conversation.customer.phone}
                    </span>
                    <span>•</span>
                    <span>{timeAgo(m.createdAt)}</span>
                    {m.flagged && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                        تنبيه
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-200 truncate">{m.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp connect prompt */}
      {user.bot?.whatsappStatus !== "connected" && (
        <div className="card p-6 bg-gradient-to-br from-brand-600/20 to-emerald-600/20 border-brand-500/30">
          <div className="flex flex-wrap items-center gap-4">
            <Phone className="w-12 h-12 text-brand-400" />
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-bold text-lg">اربط واتساب لتفعيل البوت</h3>
              <p className="text-slate-300 text-sm">
                امسح QR code من موبايلك في 30 ثانية
              </p>
            </div>
            <Link href="/dashboard/whatsapp" className="btn-primary">
              ابدأ الربط
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionBadge({
  sub,
  daysLeft,
  waNum,
}: {
  sub: any;
  daysLeft: number;
  waNum: string;
}) {
  if (sub.active) {
    return (
      <div className="card px-4 py-3 flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5">
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        <div className="text-sm">
          <div className="font-bold">{sub.subscription?.plan?.name || "اشتراك نشط"}</div>
          <div className="text-slate-400 text-xs">باقي {daysLeft} يوم</div>
        </div>
      </div>
    );
  }
  if (sub.subscription?.status === "pending") {
    return (
      <div className="card px-4 py-3 flex items-center gap-3 border-amber-500/30 bg-amber-500/5">
        <Clock className="w-5 h-5 text-amber-400" />
        <div className="text-sm">
          <div className="font-bold">بانتظار التفعيل</div>
          {waNum && (
            <a
              href={`https://wa.me/${waNum}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 text-xs hover:underline"
            >
              راسل الإدارة
            </a>
          )}
        </div>
      </div>
    );
  }
  return (
    <Link
      href="/pricing"
      className="card px-4 py-3 flex items-center gap-3 border-brand-500/30 bg-brand-500/5 hover:bg-brand-500/10 transition"
    >
      <Crown className="w-5 h-5 text-brand-400" />
      <div className="text-sm">
        <div className="font-bold">اختر باقتك</div>
        <div className="text-slate-400 text-xs">ابدأ الاشتراك الآن</div>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
  trend,
  sparkline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  trend?: number | null;
  sparkline?: number[];
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}
        >
          {icon}
        </div>
        {trend !== undefined && (
          <TrendBadge delta={trend} size="sm" />
        )}
      </div>
      <div className="text-3xl font-extrabold tabular-nums">{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkline} height={28} tone="primary" />
        </div>
      )}
    </div>
  );
}
