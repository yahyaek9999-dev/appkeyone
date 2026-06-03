import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { redirect } from "next/navigation";
import {
  MessageSquare, Users, BellRing, TrendingUp, Phone, AlertCircle, CheckCircle2,
  Crown, Clock, Inbox, UserPlus, ShoppingCart, DollarSign, Zap, ArrowUpRight,
  Activity, Bot,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { TrendBadge } from "@/components/ui/trend-badge";
import { Sparkline } from "@/components/ui/sparkline";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";
import { LiveOpsStrip } from "./live-ops-strip";
import { GettingStarted } from "./_getting-started";
import ActivationChecklist from "./_activation-checklist";
import { syncUserMilestones } from "@/lib/activation/track";
import AiCopilotStrip from "@/components/ai-copilot-strip";

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
    milestones,
    // Orders & revenue
    orderCount7d, orderCountPrior7d,
    revenueResult7d, revenueResultPrior7d,
    pendingOrderCount,
    recentOrders,
    // AI usage
    aiCalls7d,
  ] = await Promise.all([
    prisma.customer.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { flagged: true, conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { createdAt: { gte: start7 }, conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { createdAt: { gte: start14, lt: start7 }, conversation: { customer: { userId: user.id } } } }),
    prisma.message.count({ where: { createdAt: { gte: new Date(now.getTime() - day) }, conversation: { customer: { userId: user.id } } } }),
    prisma.message.findMany({
      where: { conversation: { customer: { userId: user.id } } },
      orderBy: { createdAt: "desc" }, take: 6,
      include: { conversation: { include: { customer: true } } },
    }),
    prisma.customer.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" }, take: 5,
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
    syncUserMilestones(user.id).catch(() => null),
    // Orders 7d
    prisma.order.count({ where: { userId: user.id, createdAt: { gte: start7 } } }).catch(() => 0),
    prisma.order.count({ where: { userId: user.id, createdAt: { gte: start14, lt: start7 } } }).catch(() => 0),
    // Revenue 7d
    prisma.order.aggregate({ where: { userId: user.id, createdAt: { gte: start7 }, status: { not: "canceled" } }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } })),
    prisma.order.aggregate({ where: { userId: user.id, createdAt: { gte: start14, lt: start7 }, status: { not: "canceled" } }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } })),
    // Pending orders
    prisma.order.count({ where: { userId: user.id, status: { in: ["pending", "confirmed"] } } }).catch(() => 0),
    // Recent orders
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, customerName: true, customerPhone: true, total: true, currency: true, status: true, createdAt: true } }).catch(() => []),
    // AI calls
    prisma.providerUsage.aggregate({ where: { userId: user.id, day: { gte: start7.toISOString().slice(0, 10) } }, _sum: { calls: true } }).catch(() => ({ _sum: { calls: null } })),
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

  const orders7d = orderCount7d as number;
  const ordersPrior = orderCountPrior7d as number;
  const ordersDelta = ordersPrior > 0 ? ((orders7d - ordersPrior) / ordersPrior) * 100 : orders7d > 0 ? 100 : null;

  const rev7d = (revenueResult7d as any)?._sum?.total ?? 0;
  const revPrior = (revenueResultPrior7d as any)?._sum?.total ?? 0;
  const revDelta = revPrior > 0 ? ((rev7d - revPrior) / revPrior) * 100 : rev7d > 0 ? 100 : null;

  const aiCalls = (aiCalls7d as any)?._sum?.calls ?? 0;

  // Conversion: orders / unique customers who messaged in last 7d (approximate)
  const conversionPct = msgs7d > 0 && orders7d > 0
    ? Math.min(99, Math.round((orders7d / Math.max(1, customerCount)) * 100))
    : null;

  const plan = sub.subscription?.plan;
  const usagePct = plan && plan.monthlyMsgs > 0 && sub.subscription
    ? Math.min(100, Math.round((sub.subscription.msgsUsed / plan.monthlyMsgs) * 100))
    : 0;
  const daysLeft = sub.subscription?.expiresAt
    ? Math.max(0, Math.ceil((sub.subscription.expiresAt.getTime() - Date.now()) / day))
    : 0;

  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
  const hasOrders = orders7d > 0 || (pendingOrderCount as number) > 0;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            أهلاً, {user.name || "صديقي"} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">آخر تحديث: {new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SubscriptionBadge sub={sub} daysLeft={daysLeft} waNum={waNum} />
          {bot.whatsappStatus === "connected" ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/8 px-2.5 py-1.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse shrink-0" />
              <span className="text-brand-300 font-medium">واتساب متصل</span>
            </div>
          ) : (
            <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/8 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/15 transition">
              <Phone className="h-3 w-3 shrink-0" />
              اربط واتساب
            </Link>
          )}
        </div>
      </div>

      {milestones && <ActivationChecklist milestones={milestones} />}
      <GettingStarted steps={gettingStartedSteps} />
      <LiveOpsStrip />

      {/* Phase 3: AI Copilot — one insight + recommendation + action */}
      <AiCopilotStrip context="dashboard" />

      {/* Subscription banner */}
      {!sub.active && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold text-white">
              {sub.subscription?.status === "pending" ? "اشتراكك بانتظار التفعيل" :
               sub.subscription?.status === "expired" ? "انتهت صلاحية اشتراكك" :
               sub.reason === "quota_exceeded" ? "وصلت الحد الأقصى من الرسائل" :
               "ليس لديك اشتراك نشط"}
            </span>
            <span className="text-slate-400 mr-2">تواصل معنا عبر واتساب للتفعيل أو الترقية.</span>
          </div>
          {waNum && (
            <a href={`https://wa.me/${waNum}?text=${encodeURIComponent("أريد تفعيل/ترقية اشتراكي")}`}
               target="_blank" rel="noopener noreferrer"
               className="btn-primary shrink-0 text-xs h-8">
              تواصل واتساب
            </a>
          )}
        </div>
      )}

      {/* ── Executive KPI row (above the fold) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Revenue */}
        <ExecKpi
          icon={<DollarSign className="h-4 w-4" />}
          label="إيرادات 7 أيام"
          value={rev7d > 0 ? `${(rev7d / 100).toLocaleString("ar-EG")} ج` : "—"}
          delta={revDelta}
          tone="emerald"
          href="/dashboard/orders"
          prominent
        />
        {/* Orders */}
        <ExecKpi
          icon={<ShoppingCart className="h-4 w-4" />}
          label="طلبات 7 أيام"
          value={orders7d.toLocaleString("ar-EG")}
          delta={ordersDelta}
          sub={pendingOrderCount > 0 ? `${pendingOrderCount} معلّق` : undefined}
          tone="blue"
          href="/dashboard/orders"
          prominent
        />
        {/* Conversations */}
        <ExecKpi
          icon={<MessageSquare className="h-4 w-4" />}
          label="محادثات 7 أيام"
          value={msgs7d.toLocaleString("ar-EG")}
          delta={msgs7dDelta}
          tone="brand"
          href="/dashboard/inbox"
        />
        {/* Conversion */}
        <ExecKpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="معدل التحويل"
          value={conversionPct !== null ? `${conversionPct}%` : "—"}
          tone="violet"
          href="/dashboard/analytics"
        />
        {/* AI impact */}
        <ExecKpi
          icon={<Bot className="h-4 w-4" />}
          label="ردود الذكاء الاصطناعي"
          value={aiCalls > 0 ? aiCalls.toLocaleString("ar-EG") : msgs7d.toLocaleString("ar-EG")}
          sub="آخر 7 أيام"
          tone="purple"
          href="/dashboard/analytics"
        />
      </div>

      {/* Usage bar (compact) */}
      {sub.subscription && plan && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <Crown className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-xs text-slate-400">{plan.name}</span>
          <div className="flex-1 min-w-[120px] h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full ${usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-500">
            {sub.subscription.msgsUsed.toLocaleString()} / {plan.monthlyMsgs.toLocaleString()} رسالة
          </span>
          <span className="text-[11px] text-slate-600">·</span>
          <span className="text-[11px] text-slate-500">يتجدد خلال {daysLeft} يوم</span>
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Activity chart — spans 2 cols */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="section-title">نشاط الرسائل</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">آخر 30 يوم · {msgs30dToday} رسالة اليوم</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-brand-400" />
              <span className="text-[11px] text-brand-300 font-medium">{msgCount.toLocaleString()} إجمالي</span>
            </div>
          </div>
          <div className="flex h-28 items-end gap-0.5">
            {last30.map((d) => (
              <div key={d.day} className="group relative flex flex-1 items-end justify-center"
                   title={`${d.day}: ${d.total}`}>
                <div
                  className="w-full min-h-[2px] rounded-t bg-brand-500/25 transition-all hover:bg-brand-400/50"
                  style={{ height: `${Math.max((d.total / maxDaily) * 100, 2)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-600">
            <span>{last30[0]?.day?.slice(5) || ""}</span>
            <span>{last30[14]?.day?.slice(5) || ""}</span>
            <span>{last30[29]?.day?.slice(5) || ""}</span>
          </div>
        </div>

        {/* Active customers */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">عملاء نشطون</h2>
            <Link href="/dashboard/customers" className="flex items-center gap-1 text-[11px] text-brand-400 hover:underline">
              الكل <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {topCustomers.length === 0 ? (
            <EmptyState icon={<UserPlus className="h-full w-full" />} title="لا عملاء بعد"
              description="أول محادثة ستظهر هنا." size="sm" />
          ) : (
            <div className="space-y-0.5">
              {topCustomers.map((c) => (
                <Link key={c.id} href={`/dashboard/customers/${c.id}`}
                  className="flex items-center gap-2.5 rounded-lg p-2 transition hover:bg-white/[0.04]">
                  <Avatar name={c.name || c.phone} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white leading-tight">{c.name || "—"}</div>
                    <div className="truncate text-[10px] text-slate-500">{formatCustomerPhone(c.phone).display}</div>
                  </div>
                  <div className="shrink-0 text-[10px] text-slate-600">{timeAgo(c.lastSeenAt)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Orders + Recent Messages side by side ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">آخر الطلبات</h2>
            <Link href="/dashboard/orders" className="flex items-center gap-1 text-[11px] text-brand-400 hover:underline">
              الكل <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {!hasOrders || (recentOrders as any[]).length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-full w-full" />}
              title="لا طلبات بعد"
              description="الطلبات المستخرجة من محادثات واتساب تظهر هنا."
              size="sm"
            />
          ) : (
            <div className="space-y-0.5">
              {(recentOrders as any[]).map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/[0.03]">
                  <div className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                    o.status === "delivered" ? "bg-brand-500/15 text-brand-300" :
                    o.status === "canceled" ? "bg-rose-500/15 text-rose-300" :
                    "bg-amber-500/15 text-amber-300"
                  }`}>
                    {o.status === "delivered" ? "✓" : o.status === "canceled" ? "✕" : "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white leading-tight">{o.customerName || o.customerPhone || "—"}</div>
                    <div className="text-[10px] text-slate-500">{timeAgo(o.createdAt)}</div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-white">
                    {o.total > 0 ? `${(o.total / 100).toLocaleString("ar-EG")} ج` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent messages */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">آخر الرسائل</h2>
            <Link href="/dashboard/inbox" className="flex items-center gap-1 text-[11px] text-brand-400 hover:underline">
              الكل <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentMsgs.length === 0 ? (
            <EmptyState icon={<Inbox className="h-full w-full" />} title="لا رسائل بعد"
              description="اربط واتساب أو جرّب البوت." size="sm" />
          ) : (
            <div className="space-y-0.5">
              {recentMsgs.map((m) => (
                <div key={m.id} className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-white/[0.03]">
                  <Avatar name={m.role === "user" ? m.conversation.customer.name || m.conversation.customer.phone : bot.name || "AI"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="font-medium text-slate-300 truncate max-w-[100px]">{m.conversation.customer.name || m.conversation.customer.phone}</span>
                      <span>·</span>
                      <span className="shrink-0">{timeAgo(m.createdAt)}</span>
                      {m.flagged && <span className="rounded bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-300 shrink-0">طلب</span>}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-400">{m.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick stats bar — KPIs not shown above */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallStat label="إجمالي العملاء" value={customerCount.toLocaleString("ar-EG")} icon={<Users className="h-3.5 w-3.5" />} href="/dashboard/customers" />
        <SmallStat label="إجمالي الرسائل" value={msgCount.toLocaleString("ar-EG")} icon={<MessageSquare className="h-3.5 w-3.5" />} href="/dashboard/inbox" />
        <SmallStat label="تنبيهات طلبات" value={flaggedCount.toLocaleString("ar-EG")} icon={<BellRing className="h-3.5 w-3.5" />} href="/dashboard/inbox" accent={flaggedCount > 0 ? "text-amber-300" : undefined} />
        <SmallStat label="مستندات المعرفة" value={docCount.toLocaleString("ar-EG")} icon={<Zap className="h-3.5 w-3.5" />} href="/dashboard/knowledge" />
      </div>
    </div>
  );
}

// ── Executive KPI card (top row) ────────────────────────────────────────────
function ExecKpi({
  icon, label, value, delta, sub, tone = "brand", href, prominent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
  tone?: "brand" | "emerald" | "blue" | "violet" | "purple";
  href?: string;
  prominent?: boolean;
}) {
  const toneMap: Record<string, string> = {
    brand:   "border-brand-500/20 bg-brand-500/[0.04]",
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04]",
    blue:    "border-blue-500/20 bg-blue-500/[0.04]",
    violet:  "border-violet-500/20 bg-violet-500/[0.04]",
    purple:  "border-purple-500/20 bg-purple-500/[0.04]",
  };
  const iconMap: Record<string, string> = {
    brand:   "text-brand-400",
    emerald: "text-emerald-400",
    blue:    "text-blue-400",
    violet:  "text-violet-400",
    purple:  "text-purple-400",
  };
  const valueMap: Record<string, string> = {
    brand:   "text-brand-100",
    emerald: "text-emerald-100",
    blue:    "text-blue-100",
    violet:  "text-violet-100",
    purple:  "text-purple-100",
  };
  const base = `rounded-xl border p-4 transition ${toneMap[tone]} ${prominent ? "sm:col-span-1" : ""}`;
  const inner = (
    <>
      <div className={`mb-2 flex items-center gap-1.5 text-[11px] font-medium ${iconMap[tone]}`}>
        {icon} <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold tracking-tight ${valueMap[tone]}`}>{value}</div>
      {(delta !== undefined || sub) && (
        <div className="mt-1 flex items-center gap-1.5">
          {delta !== undefined && <TrendBadge delta={delta ?? null} size="sm" />}
          {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
        </div>
      )}
    </>
  );
  if (href)
    return <Link href={href} className={`${base} hover:border-white/10 hover:bg-white/[0.04] group`}>{inner}</Link>;
  return <div className={base}>{inner}</div>;
}

// ── Small stat bar ────────────────────────────────────────────────────────────
function SmallStat({ label, value, icon, href, accent }: {
  label: string; value: string; icon: React.ReactNode; href?: string; accent?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition">
      <div className={`shrink-0 ${accent || "text-slate-500"}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-bold ${accent || "text-white"}`}>{value}</div>
        <div className="text-[11px] text-slate-500 truncate">{label}</div>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function SubscriptionBadge({ sub, daysLeft, waNum }: { sub: any; daysLeft: number; waNum: string }) {
  if (sub.active)
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/8 px-2.5 py-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        <div className="text-xs">
          <span className="font-semibold text-white">{sub.subscription?.plan?.name || "نشط"}</span>
          <span className="text-emerald-400/70 mr-1.5">· {daysLeft} يوم</span>
        </div>
      </div>
    );
  if (sub.subscription?.status === "pending")
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/8 px-2.5 py-1.5">
        <Clock className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-white">بانتظار التفعيل</span>
      </div>
    );
  return (
    <Link href="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-brand-500/15 bg-brand-500/8 px-2.5 py-1.5 transition hover:bg-brand-500/15">
      <Crown className="h-3.5 w-3.5 text-brand-400" />
      <span className="text-xs font-semibold text-white">اختر باقتك</span>
    </Link>
  );
}
