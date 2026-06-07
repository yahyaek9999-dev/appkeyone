import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { redirect } from "next/navigation";
import {
  MessageSquare, Crown, Clock, Inbox, ShoppingCart, DollarSign, ArrowUpRight,
  TrendingUp, Phone, AlertCircle, CheckCircle2, ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { TrendBadge } from "@/components/ui/trend-badge";
import { Sparkline } from "@/components/ui/sparkline";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveOpsStrip } from "./live-ops-strip";
import { GettingStarted } from "./_getting-started";
import ActivationChecklist from "./_activation-checklist";
import { syncUserMilestones } from "@/lib/activation/track";
import InsightStrip from "@/components/insight-strip";
import { FadeInView } from "@/components/ui/stagger-reveal";
import { GlowCard } from "@/components/ui/glow-card";

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
    customerCount, _msgCount, flaggedCount,
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

  // ── "What needs attention" — derived from the same data, no extra queries.
  // The executive lead: surface only the items that need a decision today.
  const attention: { label: string; href: string; tone: "amber" | "rose" | "brand"; count?: number }[] = [];
  if (bot.whatsappStatus !== "connected")
    attention.push({ label: "واتساب غير متصل — اربطه لاستقبال الرسائل", href: "/dashboard/whatsapp", tone: "rose" });
  if (!sub.active)
    attention.push({ label: "الاشتراك غير نشط — فعّل أو رقّي باقتك", href: "/pricing", tone: "amber" });
  if ((pendingOrderCount as number) > 0)
    attention.push({ label: "طلبات بانتظار المراجعة", href: "/dashboard/orders", tone: "amber", count: pendingOrderCount as number });
  if (flaggedCount > 0)
    attention.push({ label: "رسائل تحتاج متابعة", href: "/dashboard/inbox", tone: "amber", count: flaggedCount });
  if (usagePct >= 90)
    attention.push({ label: "اقتربت من حد رسائل باقتك", href: "/dashboard/usage", tone: "rose" });

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
            أهلاً، {user.name || "صديقي"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            آخر تحديث {new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SubscriptionBadge sub={sub} daysLeft={daysLeft} waNum={waNum} />
          {bot.whatsappStatus === "connected" ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 py-1.5 text-xs">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="font-medium text-emerald-300">واتساب متصل</span>
            </div>
          ) : (
            <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1.5 text-xs text-amber-300 transition-colors hover:bg-amber-500/15">
              <Phone className="h-3 w-3 shrink-0" />
              اربط واتساب
            </Link>
          )}
        </div>
      </div>

      {/* ── What needs attention ───────────────────────────────────────── */}
      {attention.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <AlertCircle className="h-3.5 w-3.5" />
            يحتاج انتباهك
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className={`group flex items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                  a.tone === "rose"
                    ? "border-rose-500/20 bg-rose-500/[0.05] hover:bg-rose-500/10"
                    : a.tone === "amber"
                      ? "border-amber-500/20 bg-amber-500/[0.05] hover:bg-amber-500/10"
                      : "border-brand-500/20 bg-brand-500/[0.05] hover:bg-brand-500/10"
                }`}
              >
                {a.count !== undefined && (
                  <span className={`grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1.5 text-sm font-semibold tabular-nums ${
                    a.tone === "rose" ? "bg-rose-500/15 text-rose-200" : "bg-amber-500/15 text-amber-200"
                  }`}>
                    {a.count.toLocaleString("ar-EG")}
                  </span>
                )}
                <span className="min-w-0 flex-1 text-[13px] text-slate-200">{a.label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {milestones && !Object.values(milestones.reached).every(Boolean) && <ActivationChecklist milestones={milestones} />}

      {/* What to do now — one AI-surfaced recommendation + action */}
      <InsightStrip context="dashboard" />

      {/* ── What makes money — revenue-led band, not a row of equal KPIs ──── */}
      <FadeInView>
      <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.018]">
        <div className="grid gap-px bg-white/[0.05] sm:grid-cols-2 lg:grid-cols-4">
          {/* Revenue — the lead, double width on desktop */}
          <Link
            href="/dashboard/orders"
            className="group bg-canvas-deep p-5 transition-colors hover:bg-white/[0.02] sm:col-span-2"
          >
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <DollarSign className="h-4 w-4 text-slate-400" />
              الإيرادات · آخر 7 أيام
            </div>
            <div className="flex items-end gap-3">
              <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-white tabular-nums">
                {rev7d > 0 ? `${(rev7d / 100).toLocaleString("ar-EG")}` : "—"}
                {rev7d > 0 && <span className="ms-1 text-base font-normal text-slate-500">ج</span>}
              </span>
              {revDelta !== null && <TrendBadge delta={revDelta} size="sm" />}
            </div>
            <div className="mt-3"><Sparkline data={last7Series} className="h-8 w-full text-brand-400" /></div>
          </Link>

          <MoneyCell icon={<ShoppingCart className="h-4 w-4" />} label="الطلبات" value={orders7d.toLocaleString("ar-EG")} delta={ordersDelta} sub={pendingOrderCount > 0 ? `${pendingOrderCount} معلّق` : undefined} href="/dashboard/orders" />
          <MoneyCell icon={<TrendingUp className="h-4 w-4" />} label="معدل التحويل" value={conversionPct !== null ? `${conversionPct}%` : "—"} href="/dashboard/analytics" />
        </div>
      </section>
      </FadeInView>

      {/* ── What happened — activity + drivers ─────────────────────────────── */}
      <FadeInView delay={0.05}>
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Activity — message volume over 30d */}
        <div className="card p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-title">نشاط المحادثات</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">آخر 30 يوم · {msgs7d.toLocaleString("ar-EG")} هذا الأسبوع</p>
            </div>
            <span className="text-[11px] tabular-nums text-slate-500">{msgs30dToday} اليوم</span>
          </div>
          <div className="flex h-28 items-end gap-0.5">
            {last30.map((d) => (
              <div key={d.day} className="group relative flex flex-1 items-end justify-center" title={`${d.day}: ${d.total}`}>
                <div
                  className="min-h-[2px] w-full rounded-t-sm bg-brand-500/30 transition-colors group-hover:bg-brand-400/60"
                  style={{ height: `${Math.max((d.total / maxDaily) * 100, 2)}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Drivers — what's driving performance */}
        <div className="card p-4 lg:col-span-2">
          <h2 className="section-title mb-3">المحركات</h2>
          <div className="space-y-3">
            <DriverRow label="العملاء" value={customerCount.toLocaleString("ar-EG")} sub={`${topCustomers.length} نشط هذا الأسبوع`} href="/dashboard/customers" />
            <DriverRow label="الطلبات" value={orders7d.toLocaleString("ar-EG")} sub={`${pendingOrderCount} معلّق`} href="/dashboard/orders" delta={ordersDelta} />
            <DriverRow label="محادثات الذكاء" value={aiCalls.toLocaleString("ar-EG")} sub="استدعاء هذا الأسبوع" href="/dashboard/analytics" />
            <DriverRow label="المعرفة" value={docCount.toLocaleString("ar-EG")} sub="مستند" href="/dashboard/knowledge" />
          </div>
        </div>
      </div>
      </FadeInView>

      {/* ── What should I do next — orders + messages ──────────────────────── */}
      <FadeInView delay={0.1}>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">آخر الطلبات</h2>
            <Link href="/dashboard/orders" className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-white">
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
                <div key={o.id} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-white/[0.03]">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${
                    o.status === "delivered" ? "bg-emerald-500/12 text-emerald-300" :
                    o.status === "canceled" ? "bg-rose-500/12 text-rose-300" :
                    "bg-amber-500/12 text-amber-300"
                  }`}>
                    {o.status === "delivered" ? "✓" : o.status === "canceled" ? "✕" : "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium leading-tight text-white">{o.customerName || o.customerPhone || "—"}</div>
                    <div className="text-[10px] text-slate-500">{timeAgo(o.createdAt)}</div>
                  </div>
                  <div className="shrink-0 text-[13px] font-semibold tabular-nums text-white">
                    {o.total > 0 ? `${(o.total / 100).toLocaleString("ar-EG")} ج` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent messages + plan usage */}
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">آخر الرسائل</h2>
            <Link href="/dashboard/inbox" className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-white">
              الكل <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentMsgs.length === 0 ? (
            <EmptyState icon={<Inbox className="h-full w-full" />} title="لا رسائل بعد" description="اربط واتساب أو جرّب البوت." size="sm" />
          ) : (
            <div className="space-y-0.5">
              {recentMsgs.slice(0, 3).map((m) => (
                <div key={m.id} className="flex items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-white/[0.03]">
                  <Avatar name={m.role === "user" ? m.conversation.customer.name || m.conversation.customer.phone : bot.name || "AI"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="max-w-[100px] truncate font-medium text-slate-300">{m.conversation.customer.name || m.conversation.customer.phone}</span>
                      <span>·</span>
                      <span className="shrink-0">{timeAgo(m.createdAt)}</span>
                      {m.flagged && <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] font-medium text-amber-300">طلب</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-slate-400">{m.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Plan usage — inline, not a separate card */}
          {sub.subscription && plan && (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-500">{plan.name}</span>
                <Link href="/dashboard/usage" className="text-[10px] text-slate-500 hover:text-white">Details</Link>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full ${usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${usagePct}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-slate-600">
                <span>{sub.subscription.msgsUsed.toLocaleString()} / {plan.monthlyMsgs.toLocaleString()}</span>
                <span>{daysLeft} يوم متبقي</span>
              </div>
            </div>
          )}
        </div>
      </div>
      </FadeInView>

      {/* ── Why — trend insights ───────────────────────────────────────────── */}
      <FadeInView delay={0.15}>
      <div className="grid gap-4 sm:grid-cols-4">
        <InsightCard
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="حركة الرسائل"
          value={msgs7d.toLocaleString("ar-EG")}
          delta={msgs7dDelta}
          period="مقارنة بالأسبوع السابق"
        />
        <InsightCard
          icon={<ShoppingBag className="h-3.5 w-3.5" />}
          label="الطلبات"
          value={orders7d.toLocaleString("ar-EG")}
          delta={ordersDelta}
          period="مقارنة بالأسبوع السابق"
        />
        <InsightCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="الإيرادات"
          value={rev7d > 0 ? `${(rev7d / 100).toLocaleString("ar-EG")} ج` : "—"}
          delta={revDelta}
          period="آخر 7 أيام"
        />
        <InsightCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="معدل التحويل"
          value={conversionPct !== null ? `${conversionPct}%` : "—"}
          period="العملاء → طلبات"
        />
      </div>
      </FadeInView>
    </div>
  );
}

// ── Money cell — secondary revenue metric inside the money band. ──────────────
function MoneyCell({ icon, label, value, delta, sub, href }: {
  icon: React.ReactNode; label: string; value: string; delta?: number | null; sub?: string; href?: string;
}) {
  const inner = (
    <>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <span className="text-slate-400">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-white tabular-nums">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="mt-2 flex items-center gap-1.5">
          {delta !== undefined && <TrendBadge delta={delta ?? null} size="sm" />}
          {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
        </div>
      )}
    </>
  );
  const cls = "bg-canvas-deep p-5 transition-colors hover:bg-white/[0.02]";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

// ── Driver row — compact metric in the "what's driving" panel. ────────────────
function DriverRow({ label, value, sub, href, delta }: {
  label: string; value: string; sub?: string; href?: string; delta?: number | null;
}) {
  const inner = (
    <Link href={href || "#"} className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{value}</span>
          {delta !== undefined && delta !== null && (
            <span className={`text-[10px] tabular-nums ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {delta >= 0 ? "+" : ""}{Math.round(delta)}%
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
      {sub && <span className="text-[10px] text-slate-600">{sub}</span>}
    </Link>
  );
  return inner;
}

// ── Insight card — trend insight row. ─────────────────────────────────────────
function InsightCard({ icon, label, value, delta, period }: {
  icon: React.ReactNode; label: string; value: string; delta?: number | null; period?: string;
}) {
  return (
    <GlowCard glow="brand" className="p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-white">{value}</span>
        {delta !== undefined && delta !== null && (
          <TrendBadge delta={delta} size="sm" />
        )}
      </div>
      {period && <div className="mt-0.5 text-[10px] text-slate-600">{period}</div>}
    </GlowCard>
  );
}

function SubscriptionBadge({ sub, daysLeft, waNum }: { sub: any; daysLeft: number; waNum: string }) {
  if (sub.active)
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.07] px-2.5 py-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        <div className="text-xs">
          <span className="font-medium text-white">{sub.subscription?.plan?.name || "نشط"}</span>
          <span className="mr-1.5 text-emerald-400/70">· {daysLeft} يوم</span>
        </div>
      </div>
    );
  if (sub.subscription?.status === "pending")
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.07] px-2.5 py-1.5">
        <Clock className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-medium text-white">بانتظار التفعيل</span>
      </div>
    );
  return (
    <Link href="/pricing" className="inline-flex items-center gap-2 rounded-lg border border-brand-500/15 bg-brand-500/[0.07] px-2.5 py-1.5 transition-colors hover:bg-brand-500/15">
      <Crown className="h-3.5 w-3.5 text-brand-400" />
      <span className="text-xs font-medium text-white">اختر باقتك</span>
    </Link>
  );
}
