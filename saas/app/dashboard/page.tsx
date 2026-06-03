import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { redirect } from "next/navigation";
import {
  MessageSquare, Users, BellRing, TrendingUp, Phone, AlertCircle, CheckCircle2,
  Crown, Clock, Inbox, UserPlus,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { StatGrid } from "@/components/ui/stat-grid";
import { TrendBadge } from "@/components/ui/trend-badge";
import { Sparkline } from "@/components/ui/sparkline";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";
import { LiveOpsStrip } from "./live-ops-strip";
import { GettingStarted } from "./_getting-started";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const user = await requireUser();
  const bot = await prisma.bot.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, whatsappStatus: true } as any,
  }) as any;
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
    customerCount, msgCount, flaggedCount,
    msgs7d, msgsPrior7d, msgs30dToday,
    recentMsgs, topCustomers, dailySeries,
    docCount, integrationCount, broadcastCount,
  ] = await Promise.all([
    prisma.customer.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { flagged: true, conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { createdAt: { gte: start7 }, conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { createdAt: { gte: start14, lt: start7 }, conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { createdAt: { gte: new Date(now.getTime() - day) }, conversation: { customer: { userId: user.id } } } }),
    prisma.message.findMany({
      where: { conversation: { customer: { userId: user.id } } },
      orderBy: { createdAt: "desc" }, take: 8,
      include: { conversation: { include: { customer: true } } },
    }),
    prisma.customer.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" }, take: 6,
    }),
    prisma.$queryRawUnsafe<{ day: string; total: number }[]>(
      `SELECT strftime('%Y-%m-%d', m.createdAt) AS day, COUNT(*) AS total
       FROM Message m JOIN Conversation c ON c.id = m.conversationId
       JOIN Customer cu ON cu.id = c.customerId
       WHERE cu.userId = ? AND m.createdAt >= ?
       GROUP BY day ORDER BY day ASC`,
      user.id, start30.toISOString(),
    ).catch(() => []),
    prisma.document.count({ where: { userId: user.id } }),
    (prisma as any).commerceIntegration.count({ where: { userId: user.id, enabled: true } }).catch(() => 0),
    prisma.broadcast.count({ where: { userId: user.id } }).catch(() => 0),
  ]);

  const gettingStartedSteps = {
    whatsapp: bot.whatsappStatus === "connected",
    aiBot: Boolean(bot.name && bot.name.trim().length > 0),
    knowledge: docCount > 0,
    store: (integrationCount as number) > 0,
    campaign: (broadcastCount as number) > 0,
  };

  const seriesMap = new Map<string, number>();
  for (const row of dailySeries) seriesMap.set(row.day, Number(row.total));
  const last30: { day: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * day);
    const key = d.toISOString().slice(0, 10);
    last30.push({ day: key, total: seriesMap.get(key) || 0 });
  }
  const maxDaily = Math.max(1, ...last30.map((d) => d.total));
  const last7Series = last30.slice(-7).map((d) => d.total);

  const msgs7dDelta = msgsPrior7d > 0
    ? ((msgs7d - msgsPrior7d) / msgsPrior7d) * 100
    : msgs7d > 0 ? 100 : null;

  const plan = sub.subscription?.plan;
  const usagePct = plan && plan.monthlyMsgs > 0 && sub.subscription
    ? Math.min(100, Math.round((sub.subscription.msgsUsed / plan.monthlyMsgs) * 100))
    : 0;
  const daysLeft = sub.subscription?.expiresAt
    ? Math.max(0, Math.ceil((sub.subscription.expiresAt.getTime() - Date.now()) / day))
    : 0;

  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title mb-1">
            أهلاً, {user.name || "صديقي"}
          </h1>
          <p className="page-desc">نظرة عامة على أداء بوتك</p>
        </div>
        <SubscriptionBadge sub={sub} daysLeft={daysLeft} waNum={waNum} />
      </div>

      <GettingStarted steps={gettingStartedSteps} />

      <LiveOpsStrip />

      {/* Subscription banner */}
      {!sub.active && (
        <div className="card-hover flex flex-wrap items-center gap-4 border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle className="h-6 w-6 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">
              {sub.subscription?.status === "pending"
                ? "اشتراكك بانتظار التفعيل من الإدارة"
                : sub.subscription?.status === "expired"
                  ? "انتهت صلاحية اشتراكك"
                  : sub.reason === "quota_exceeded"
                    ? "وصلت الحد الأقصى من الرسائل لهذا الشهر"
                    : "ليس لديك اشتراك نشط"}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">تواصل معنا عبر واتساب لتفعيل أو ترقية الاشتراك.</div>
          </div>
          {waNum && (
            <a href={`https://wa.me/${waNum}?text=${encodeURIComponent("أريد تفعيل/ترقية اشتراكي")}`}
               target="_blank" rel="noopener noreferrer"
               className="btn-primary shrink-0 text-xs">
              تواصل واتساب
            </a>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <StatGrid cols={4}>
        <KpiCard icon={<Users className="h-4 w-4" />} label="إجمالي العملاء"
          value={customerCount.toLocaleString()} accent="from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/15" />
        <KpiCard icon={<MessageSquare className="h-4 w-4" />} label="إجمالي الرسائل"
          value={msgCount.toLocaleString()} accent="from-brand-500/20 to-emerald-500/5 text-brand-400 border-brand-500/15" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="آخر 7 أيام"
          value={msgs7d.toLocaleString()} accent="from-purple-500/20 to-pink-500/5 text-purple-400 border-purple-500/15"
          trend={msgs7dDelta} sparkline={last7Series} />
        <KpiCard icon={<BellRing className="h-4 w-4" />} label="تنبيهات الطلبات"
          value={flaggedCount.toLocaleString()} accent="from-amber-500/20 to-orange-500/5 text-amber-400 border-amber-500/15" />
      </StatGrid>

      {/* Usage card */}
      {sub.subscription && plan && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-slate-500">{plan.name}</span>
            </div>
            <div className="text-xs text-slate-400">
              {sub.subscription.msgsUsed.toLocaleString()} / {plan.monthlyMsgs.toLocaleString()} رسالة
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-slate-500">
            <span>اليوم: {msgs30dToday.toLocaleString()} رسالة</span>
            <span>متبقي {daysLeft} يوم على التجديد</span>
          </div>
        </div>
      )}

      {/* Chart + Top customers */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">نشاط آخر 30 يوم</h2>
            <span className="text-[11px] text-slate-500">{msgCount.toLocaleString()} رسالة</span>
          </div>
          <div className="flex h-36 items-end gap-px">
            {last30.map((d) => (
              <div key={d.day} className="group relative flex flex-1 items-end justify-center"
                   title={`${d.day}: ${d.total}`}>
                <div
                  className="w-full rounded-t bg-brand-500/20 transition hover:bg-brand-500/40"
                  style={{ height: `${Math.max((d.total / maxDaily) * 100, 2)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-600">
            <span>{last30[0]?.day?.slice(5) || ""}</span>
            <span>{last30[14]?.day?.slice(5) || ""}</span>
            <span>{last30[29]?.day?.slice(5) || ""}</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">عملاء نشطون</h2>
            <Link href="/dashboard/customers" className="text-[11px] text-brand-400 hover:underline">الكل ←</Link>
          </div>
          {topCustomers.length === 0 ? (
            <EmptyState icon={<UserPlus className="h-full w-full" />} title="لسه ما فيش عملاء"
              description="أول ما حد يكلّم البوت هيظهر هنا." size="sm" />
          ) : (
            <div className="space-y-1">
              {topCustomers.map((c) => (
                <Link key={c.id} href={`/dashboard/customers/${c.id}`}
                  className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]">
                  <Avatar name={c.name || c.phone} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{c.name || "بدون اسم"}</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {formatCustomerPhone(c.phone).display}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-600">{timeAgo(c.lastSeenAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent messages */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">آخر الرسائل</h2>
          <Link href="/dashboard/inbox" className="text-[11px] text-brand-400 hover:underline">عرض الكل ←</Link>
        </div>
        {recentMsgs.length === 0 ? (
          <EmptyState icon={<Inbox className="h-full w-full" />} title="لسه ما فيش رسائل"
            description="اربط واتساب أو جرّب البوت." size="md" />
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {recentMsgs.map((m) => (
              <div key={m.id} className="flex items-start gap-3 py-3">
                <Avatar name={m.role === "user" ? m.conversation.customer.name || m.conversation.customer.phone : bot.name || "البوت"} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-300">{m.conversation.customer.name || m.conversation.customer.phone}</span>
                    <span>·</span>
                    <span>{timeAgo(m.createdAt)}</span>
                    {m.flagged && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">تنبيه</span>}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-slate-400">{m.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp connect prompt */}
      {user.bot?.whatsappStatus !== "connected" && (
        <div className="card p-5 flex flex-wrap items-center gap-4 border-brand-500/20 bg-gradient-to-br from-brand-500/[0.06] to-transparent">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15">
            <Phone className="h-5 w-5 text-brand-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white">اربط واتساب لتفعيل البوت</h3>
            <p className="text-xs text-slate-400">امسح QR code من موبايلك في 30 ثانية</p>
          </div>
          <Link href="/dashboard/whatsapp" className="btn-primary shrink-0 text-xs">ابدأ الربط</Link>
        </div>
      )}
    </div>
  );
}

function SubscriptionBadge({ sub, daysLeft, waNum }: { sub: any; daysLeft: number; waNum: string }) {
  if (sub.active)
    return (
      <div className="inline-flex items-center gap-2.5 rounded-xl border border-emerald-500/15 bg-emerald-500/8 px-3.5 py-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <div className="text-xs">
          <div className="font-semibold text-white">{sub.subscription?.plan?.name || "اشتراك نشط"}</div>
          <div className="text-emerald-400/70">باقي {daysLeft} يوم</div>
        </div>
      </div>
    );
  if (sub.subscription?.status === "pending")
    return (
      <div className="inline-flex items-center gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/8 px-3.5 py-2">
        <Clock className="h-4 w-4 text-amber-400" />
        <div className="text-xs">
          <div className="font-semibold text-white">بانتظار التفعيل</div>
          {waNum && <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer" className="text-amber-300/70 hover:underline">راسل الإدارة</a>}
        </div>
      </div>
    );
  return (
    <Link href="/pricing" className="inline-flex items-center gap-2.5 rounded-xl border border-brand-500/15 bg-brand-500/8 px-3.5 py-2 transition hover:bg-brand-500/15">
      <Crown className="h-4 w-4 text-brand-400" />
      <div className="text-xs">
        <div className="font-semibold text-white">اختر باقتك</div>
        <div className="text-brand-400/70">ابدأ الاشتراك الآن</div>
      </div>
    </Link>
  );
}

function KpiCard({ icon, label, value, accent, trend, sparkline }: {
  icon: React.ReactNode; label: string; value: string | number;
  accent: string; trend?: number | null; sparkline?: number[];
}) {
  return (
    <div className="kpi-card">
      <div className="mb-3 flex items-start justify-between">
        <div className={`kpi-icon border ${accent}`}>{icon}</div>
        {trend !== undefined && <TrendBadge delta={trend} size="sm" />}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkline} height={28} tone="primary" />
        </div>
      )}
    </div>
  );
}
