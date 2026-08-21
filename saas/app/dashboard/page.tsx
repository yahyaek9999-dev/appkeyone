import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { REVENUE_ELIGIBLE_STATUSES } from "@/lib/revenue/engine";
import { redirect } from "next/navigation";
import {
  Crown, Clock, DollarSign, ArrowUpRight,
  TrendingUp, Phone, CheckCircle2, ShoppingBag,
  MessageSquare, Users, AlertTriangle, AlertCircle,
  ArrowRight, RotateCcw, Flame, ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { TrendBadge } from "@/components/ui/trend-badge";
import { Sparkline } from "@/components/ui/sparkline";
import { EmptyState } from "@/components/ui/empty-state";
import ActivationChecklist from "./_activation-checklist";
import { syncUserMilestones } from "@/lib/activation/track";
import { resolveBusinessContext } from "@/lib/business-context";
import { DEFAULT_VERTICAL, moduleMap } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const user = await requireUser();
  const isAdmin = (user as any).role === "admin";
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
    customerCount, _msgCount, flaggedCount,
    msgs7d, msgsPrior7d, msgs30dToday,
    recentMsgs, topCustomers, dailySeries,
    docCount, integrationCount, broadcastCount,
    milestones,
    orderCount7d, orderCountPrior7d,
    revenueResult7d, revenueResultPrior7d,
    pendingOrderCount,
    recentOrders,
    aiCalls7d,
    businessContext,
    escalationCount,
    humanActiveCount,
    hotLeadCount,
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
      `SELECT TO_CHAR(m."createdAt", 'YYYY-MM-DD') AS day, COUNT(*) AS total
       FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
       JOIN "Customer" cu ON cu.id = c."customerId"
       WHERE cu."userId" = $1 AND m."createdAt" >= $2
       GROUP BY day ORDER BY day ASC`,
      user.id, start30,
    ).catch(() => []),
    prisma.document.count({ where: { userId: user.id } }),
    (prisma as any).commerceIntegration.count({ where: { userId: user.id, enabled: true } }).catch(() => 0),
    prisma.broadcast.count({ where: { userId: user.id } }).catch(() => 0),
    isAdmin ? Promise.resolve(null) : syncUserMilestones(user.id).catch(() => null),
    prisma.order.count({ where: { userId: user.id, createdAt: { gte: start7 } } }).catch(() => 0),
    prisma.order.count({ where: { userId: user.id, createdAt: { gte: start14, lt: start7 } } }).catch(() => 0),
    prisma.order.aggregate({ where: { userId: user.id, createdAt: { gte: start7 }, status: { in: REVENUE_ELIGIBLE_STATUSES } }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } })),
    prisma.order.aggregate({ where: { userId: user.id, createdAt: { gte: start14, lt: start7 }, status: { in: REVENUE_ELIGIBLE_STATUSES } }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } })),
    prisma.order.count({ where: { userId: user.id, status: { in: ["pending", "confirmed"] } } }).catch(() => 0),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, customerName: true, customerPhone: true, total: true, currency: true, status: true, createdAt: true } }).catch(() => []),
    prisma.providerUsage.aggregate({ where: { userId: user.id, day: { gte: start7.toISOString().slice(0, 10) } }, _sum: { calls: true } }).catch(() => ({ _sum: { calls: null } })),
    resolveBusinessContext(user.id).catch(() => null),
    (prisma as any).escalationTicket.count({ where: { userId: user.id, status: { in: ["open", "acknowledged"] } } }).catch(() => 0),
    prisma.conversation.count({ where: { handoffState: "human_active", customer: { userId: user.id } } }).catch(() => 0),
    prisma.customer.count({ where: { userId: user.id, leadScore: { gte: 75 } } }).catch(() => 0),
  ]);

  const vertical = businessContext?.vertical ?? DEFAULT_VERTICAL;
  const modules = businessContext?.modules ?? moduleMap(DEFAULT_VERTICAL, null);

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

  const hour = now.getHours();
  const timeGreeting = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء النور" : "مساء الخير";

  // ── Attention items — ordered by severity ──────────────────────────────────
  type AttentionTone = "rose" | "amber" | "brand";
  const attention: {
    label: string; why: string; action: string; href: string;
    tone: AttentionTone; count?: number;
  }[] = [];

  if (bot.whatsappStatus !== "connected")
    attention.push({
      label: "واتساب غير متصل",
      why: "النظام التلقائي لا يستطيع استقبال أو إرسال رسائل",
      action: "ربط الآن",
      href: "/dashboard/whatsapp",
      tone: "rose",
    });
  if (!sub.active && !isAdmin)
    attention.push({
      label: "الاشتراك غير نشط",
      why: "الخدمة موقوفة مؤقتاً حتى تجديد الباقة",
      action: "تفعيل الباقة",
      href: "/pricing",
      tone: "amber",
    });
  if (usagePct >= 90)
    attention.push({
      label: "اقتربت من حد الرسائل",
      why: `استخدمت ${usagePct}% من رسائل باقتك الشهرية`,
      action: "ترقية الباقة",
      href: "/dashboard/usage",
      tone: "rose",
    });
  if ((escalationCount as number) > 0)
    attention.push({
      label: "تصعيدات مفتوحة",
      why: "محادثات تحتاج تدخلاً فورياً من الفريق",
      action: "فتح التصعيدات",
      href: "/dashboard/escalations",
      tone: "rose",
      count: escalationCount as number,
    });
  if (modules.orders && (pendingOrderCount as number) > 0)
    attention.push({
      label: "طلبات بانتظار المراجعة",
      why: "طلبات وردت ولم تُحدَّث حالتها بعد",
      action: "مراجعة الطلبات",
      href: "/dashboard/orders",
      tone: "amber",
      count: pendingOrderCount as number,
    });
  if (flaggedCount > 0)
    attention.push({
      label: "رسائل تحتاج متابعة",
      why: "محادثات تم تمييزها تحتاج رداً",
      action: "فتح المحادثات",
      href: "/dashboard/inbox",
      tone: "amber",
      count: flaggedCount,
    });

  // ── Business status summary ────────────────────────────────────────────────
  const criticalCount = attention.filter((a) => a.tone === "rose").length;
  const warningCount = attention.filter((a) => a.tone === "amber").length;
  const statusOk = criticalCount === 0;
  const statusLabel = criticalCount > 0
    ? `${criticalCount} مشكلة تحتاج تدخلاً فورياً`
    : warningCount > 0
    ? `${warningCount} ${warningCount === 1 ? "تنبيه" : "تنبيهات"} تحتاج انتباهك`
    : "النشاط يسير بشكل طبيعي";

  return (
    <div className="space-y-0">

      {/* ══ HEADER — Executive greeting + status ════════════════════════════ */}
      <div className="border-b border-white/[0.05] pb-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow mb-3">
              {timeGreeting} · {now.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-white sm:text-[36px]">
              {user.name || "صديقي"}
            </h1>
            {/* Business status sentence */}
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${statusOk ? "bg-emerald-400" : criticalCount > 0 ? "bg-rose-400" : "bg-amber-400"}`} />
              <p className="text-[13px] text-slate-400">{statusLabel}
                {msgs30dToday > 0 && ` · ${msgs30dToday.toLocaleString("ar-EG")} رسالة اليوم`}
                {modules.orders && (pendingOrderCount as number) > 0 && ` · ${(pendingOrderCount as number)} طلب ينتظر`}
              </p>
            </div>
          </div>

          {/* Status cluster */}
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {bot.whatsappStatus === "connected" ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="font-medium text-emerald-300">واتساب متصل</span>
              </div>
            ) : (
              <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.07] px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/15 transition-colors">
                <Phone className="h-3 w-3" />
                اربط واتساب
              </Link>
            )}
            {sub.active ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-400" />
                <span className="font-medium text-white">{plan?.name || "نشط"}</span>
                {daysLeft > 0 && <span className="text-slate-500">· {daysLeft}ي</span>}
              </div>
            ) : sub.subscription?.status === "pending" ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-xs">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-medium text-white">بانتظار التفعيل</span>
              </div>
            ) : (
              <Link href="/pricing" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/[0.07] px-3 py-1.5 text-xs text-brand-300 hover:bg-brand-500/15 transition-colors">
                <Crown className="h-3.5 w-3.5" />
                اختر باقتك
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ══ ATTENTION QUEUE ══════════════════════════════════════════════════ */}
      {attention.length > 0 && (
        <section className="py-6 border-b border-white/[0.05]">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">يحتاج انتباهك</h2>
          </div>
          <div className="space-y-2">
            {attention.map((a) => {
              const borderColor = a.tone === "rose"
                ? "rgba(239,68,68,0.45)"
                : a.tone === "amber"
                ? "rgba(245,158,11,0.45)"
                : "rgba(47,147,132,0.45)";
              const countColor = a.tone === "rose" ? "text-rose-300" : "text-amber-300";
              return (
                <div
                  key={a.href + a.label}
                  className="flex items-center gap-4 rounded-lg px-4 py-3"
                  style={{ borderRight: `3px solid ${borderColor}`, background: "rgba(255,255,255,0.018)" }}
                >
                  {a.count !== undefined && (
                    <span className={`shrink-0 text-2xl font-black tabular-nums leading-none ${countColor}`}>{a.count}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white">{a.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{a.why}</div>
                  </div>
                  <Link
                    href={a.href}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    {a.action}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ══ OPPORTUNITY SIGNALS ══════════════════════════════════════════════ */}
      {((humanActiveCount as number) > 0 || (hotLeadCount as number) > 0) && (
        <section className="py-4 border-b border-white/[0.05]">
          <div className="mb-2.5 flex items-center gap-2">
            <Flame className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-slate-600">فرص نشطة</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(humanActiveCount as number) > 0 && (
              <Link href="/dashboard/my-work" className="inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3.5 py-2 hover:bg-sky-500/10 transition-colors">
                <ClipboardList className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-[12px] font-semibold text-sky-200">{(humanActiveCount as number).toLocaleString("ar-EG")} محادثة نشطة</span>
                <span className="text-[10px] text-slate-500">بانتظار الرد</span>
                <ArrowUpRight className="h-3 w-3 text-slate-600" />
              </Link>
            )}
            {(hotLeadCount as number) > 0 && (
              <Link href="/dashboard/leads" className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3.5 py-2 hover:bg-amber-500/10 transition-colors">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[12px] font-semibold text-amber-200">{(hotLeadCount as number).toLocaleString("ar-EG")} عميل ساخن</span>
                <span className="text-[10px] text-slate-500">فرص إيرادات</span>
                <ArrowUpRight className="h-3 w-3 text-slate-600" />
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ══ ACTIVATION CHECKLIST ══════════════════════════════════════════════ */}
      {!isAdmin && milestones && !Object.values(milestones.reached).every(Boolean) && (
        <div className="py-6 border-b border-white/[0.05]">
          <ActivationChecklist milestones={milestones} vertical={vertical} modules={modules} />
        </div>
      )}

      {/* ══ BUSINESS PERFORMANCE ══════════════════════════════════════════════ */}
      <section className="py-6 border-b border-white/[0.05]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-white">أداء النشاط</h2>
          <span className="text-[11px] text-slate-600">آخر 7 أيام مقارنةً بالأسبوع السابق</span>
        </div>

        {/* Metric band — not isolated cards */}
        <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] lg:grid-cols-4">
          {modules.orders && (
            <Link href="/dashboard/orders" className="group px-5 py-4 transition-colors hover:bg-white/[0.025]">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">الإيرادات</div>
              <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white tabular-nums">
                {rev7d > 0 ? `${(rev7d / 100).toLocaleString("ar-EG")}` : "—"}
              </div>
              {rev7d > 0 && <div className="text-[10px] text-slate-600">جنيه</div>}
              {revDelta !== null && (
                <div className={`mt-2 text-[11px] font-semibold tabular-nums ${revDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {revDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(revDelta))}%
                </div>
              )}
            </Link>
          )}
          {modules.orders && (
            <Link href="/dashboard/orders" className="group px-5 py-4 transition-colors hover:bg-white/[0.025]">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">الطلبات</div>
              <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white tabular-nums">{orders7d}</div>
              {(pendingOrderCount as number) > 0 && (
                <div className="mt-1 text-[11px] text-amber-400">{pendingOrderCount as number} معلّق</div>
              )}
              {ordersDelta !== null && (
                <div className={`mt-2 text-[11px] font-semibold tabular-nums ${ordersDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {ordersDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(ordersDelta))}%
                </div>
              )}
            </Link>
          )}
          <Link href="/dashboard/customers" className="group px-5 py-4 transition-colors hover:bg-white/[0.025]">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">العملاء</div>
            <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white tabular-nums">{customerCount.toLocaleString("ar-EG")}</div>
            <div className="mt-1 text-[11px] text-slate-600">{topCustomers.length} نشط مؤخراً</div>
          </Link>
          <Link href="/dashboard/inbox" className="group px-5 py-4 transition-colors hover:bg-white/[0.025]">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">الرسائل</div>
            <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-white tabular-nums">{msgs7d.toLocaleString("ar-EG")}</div>
            <div className="mt-1 text-[11px] text-slate-600">{msgs30dToday} اليوم</div>
            {msgs7dDelta !== null && (
              <div className={`mt-2 text-[11px] font-semibold tabular-nums ${msgs7dDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {msgs7dDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(msgs7dDelta))}%
              </div>
            )}
          </Link>
        </div>

        {/* Activity trend — 30-day bar chart */}
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[10px] text-slate-600">
            <span>نشاط المحادثات · 30 يوم</span>
            <span className="tabular-nums">{msgs30dToday} اليوم</span>
          </div>
          <div className="relative h-20">
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {last30.map((d, i) => (
                <div key={d.day} className="flex flex-1 items-end" title={`${d.day}: ${d.total}`}>
                  <div
                    className="min-h-[2px] w-full rounded-[1px] transition-all"
                    style={{
                      height: `${Math.max((d.total / maxDaily) * 100, 2)}%`,
                      background: i >= 23
                        ? `rgba(47,147,132,${0.3 + (i - 23) * 0.1})`
                        : "rgba(47,147,132,0.12)",
                    }}
                  />
                </div>
              ))}
            </div>
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 290 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lg2" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(47,147,132,0.1)" />
                  <stop offset="70%" stopColor="rgba(47,147,132,0.4)" />
                  <stop offset="100%" stopColor="rgba(47,147,132,0.8)" />
                </linearGradient>
              </defs>
              <polyline
                points={last30.map((d, i) => `${(i / 29) * 290},${80 - Math.max((d.total / maxDaily) * 72, 3)}`).join(" ")}
                fill="none" stroke="url(#lg2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
              />
              {(() => {
                const last = last30[last30.length - 1];
                const y = 80 - Math.max((last.total / maxDaily) * 72, 3);
                return last.total > 0 ? <circle cx="290" cy={y} r="2" fill="#2f9384" /> : null;
              })()}
            </svg>
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] text-slate-700 tabular-nums">
            <span>30 يوم</span><span>21 يوم</span><span>14 يوم</span><span>7 أيام</span><span>اليوم</span>
          </div>
        </div>
      </section>

      {/* ══ RECENT WORK ══════════════════════════════════════════════════════ */}
      <section className="py-6">
        <div className={`grid gap-6 ${modules.orders ? "lg:grid-cols-2" : "grid-cols-1"}`}>

          {/* Recent orders */}
          {modules.orders && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-slate-500" />
                  <h2 className="text-[13px] font-semibold text-white">آخر الطلبات</h2>
                  {(pendingOrderCount as number) > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      {pendingOrderCount as number} معلّق
                    </span>
                  )}
                </div>
                <Link href="/dashboard/orders" className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors">
                  الكل <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              {!hasOrders || (recentOrders as any[]).length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] p-8">
                  <EmptyState icon={<ShoppingBag className="h-full w-full" />} title="لا طلبات بعد" description="الطلبات المستخرجة من محادثات واتساب تظهر هنا." size="sm" />
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-white/[0.06]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.05]">
                        <th className="px-4 py-2.5 text-start text-[10px] font-medium uppercase tracking-[0.06em] text-slate-600">العميل</th>
                        <th className="px-4 py-2.5 text-end text-[10px] font-medium uppercase tracking-[0.06em] text-slate-600">القيمة</th>
                        <th className="px-4 py-2.5 text-center text-[10px] font-medium uppercase tracking-[0.06em] text-slate-600">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recentOrders as any[]).map((o, i) => (
                        <tr key={o.id} className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.015] ${i === (recentOrders as any[]).length - 1 ? "border-b-0" : ""}`}>
                          <td className="px-4 py-3">
                            <Link href={`/dashboard/orders/${o.id}`} className="group flex items-center gap-2.5">
                              <div className={`h-2 w-2 shrink-0 rounded-full ${
                                o.status === "delivered" ? "bg-emerald-400" :
                                o.status === "canceled" ? "bg-rose-400" : "bg-amber-400"
                              }`} />
                              <div>
                                <div className="text-[13px] font-medium text-white group-hover:text-brand-300 transition-colors">{o.customerName || "—"}</div>
                                <div className="text-[10px] text-slate-600">{timeAgo(o.createdAt)}</div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-end">
                            <div className="text-[13px] font-semibold tabular-nums text-white">
                              {o.total > 0 ? `${(o.total / 100).toLocaleString("ar-EG")} ج` : "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <OrderStatusChip status={o.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Recent conversations */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                <h2 className="text-[13px] font-semibold text-white">آخر المحادثات</h2>
                {flaggedCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    {flaggedCount} للمتابعة
                  </span>
                )}
              </div>
              <Link href="/dashboard/inbox" className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors">
                الكل <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {recentMsgs.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] p-8">
                <EmptyState icon={<MessageSquare className="h-full w-full" />} title="لا رسائل بعد" description="اربط واتساب وابدأ استقبال الرسائل." size="sm" />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
                {recentMsgs.slice(0, 5).map((m) => (
                  <Link
                    key={m.id}
                    href="/dashboard/inbox"
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.015]"
                  >
                    <Avatar
                      name={m.conversation.customer.name || m.conversation.customer.phone}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-white">
                          {m.conversation.customer.name || m.conversation.customer.phone}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-600">{timeAgo(m.createdAt)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {m.flagged && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">للمتابعة</span>
                        )}
                        <span className="truncate text-[12px] text-slate-500">{m.content}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ USAGE FOOTER (subtle, not a card) ════════════════════════════════ */}
      {sub.subscription && plan && (
        <div className="border-t border-white/[0.05] pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="shrink-0 text-[11px] font-medium text-slate-500">{plan.name}</div>
              <div className="flex-1 h-1 overflow-hidden rounded-full bg-white/[0.06] max-w-[160px]">
                <div
                  className={`h-full rounded-full ${usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-slate-600">
                {sub.subscription.msgsUsed.toLocaleString()} / {plan.monthlyMsgs.toLocaleString()} رسالة
              </span>
            </div>
            <div className="shrink-0 flex items-center gap-3 text-[10px] text-slate-600">
              <span>{daysLeft} يوم متبقي</span>
              <Link href="/dashboard/usage" className="hover:text-slate-300 transition-colors">التفاصيل</Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Order status chip ──────────────────────────────────────────────────────────
function OrderStatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    delivered:  { label: "مُسلَّم",  cls: "text-emerald-300 bg-emerald-500/10" },
    shipped:    { label: "شُحن",     cls: "text-blue-300 bg-blue-500/10" },
    confirmed:  { label: "مؤكد",    cls: "text-brand-300 bg-brand-500/10" },
    pending:    { label: "معلّق",   cls: "text-amber-300 bg-amber-500/10" },
    canceled:   { label: "ملغي",    cls: "text-rose-300 bg-rose-500/10" },
    cancelled:  { label: "ملغي",    cls: "text-rose-300 bg-rose-500/10" },
  };
  const s = map[status] ?? { label: status, cls: "text-slate-400 bg-white/[0.06]" };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>
  );
}
