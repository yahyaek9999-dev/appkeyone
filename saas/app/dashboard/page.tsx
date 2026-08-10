import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { evaluateSubscription, getSiteConfig } from "@/lib/admin";
import { redirect } from "next/navigation";
import {
  Crown, Clock, Inbox, ShoppingCart, DollarSign, ArrowUpRight,
  TrendingUp, Phone, AlertCircle, CheckCircle2,
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
import InsightStrip from "@/components/insight-strip";
import { FadeInView } from "@/components/ui/stagger-reveal";

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
    orderCount7d, orderCountPrior7d,
    revenueResult7d, revenueResultPrior7d,
    pendingOrderCount,
    recentOrders,
    aiCalls7d,
    businessContext,
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
    syncUserMilestones(user.id).catch(() => null),
    prisma.order.count({ where: { userId: user.id, createdAt: { gte: start7 } } }).catch(() => 0),
    prisma.order.count({ where: { userId: user.id, createdAt: { gte: start14, lt: start7 } } }).catch(() => 0),
    prisma.order.aggregate({ where: { userId: user.id, createdAt: { gte: start7 }, status: { not: "canceled" } }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } })),
    prisma.order.aggregate({ where: { userId: user.id, createdAt: { gte: start14, lt: start7 }, status: { not: "canceled" } }, _sum: { total: true } }).catch(() => ({ _sum: { total: null } })),
    prisma.order.count({ where: { userId: user.id, status: { in: ["pending", "confirmed"] } } }).catch(() => 0),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, customerName: true, customerPhone: true, total: true, currency: true, status: true, createdAt: true } }).catch(() => []),
    prisma.providerUsage.aggregate({ where: { userId: user.id, day: { gte: start7.toISOString().slice(0, 10) } }, _sum: { calls: true } }).catch(() => ({ _sum: { calls: null } })),
    resolveBusinessContext(user.id).catch(() => null),
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

  const aiCalls = (aiCalls7d as any)?._sum?.calls ?? 0;

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

  const attention: { label: string; href: string; tone: "amber" | "rose" | "brand"; count?: number }[] = [];
  if (bot.whatsappStatus !== "connected")
    attention.push({ label: "واتساب غير متصل — اربطه لاستقبال الرسائل", href: "/dashboard/whatsapp", tone: "rose" });
  if (!sub.active)
    attention.push({ label: "الاشتراك غير نشط — فعّل أو رقّي باقتك", href: "/pricing", tone: "amber" });
  if (modules.orders && (pendingOrderCount as number) > 0)
    attention.push({ label: "طلبات بانتظار المراجعة", href: "/dashboard/orders", tone: "amber", count: pendingOrderCount as number });
  if (flaggedCount > 0)
    attention.push({ label: "رسائل تحتاج متابعة", href: "/dashboard/inbox", tone: "amber", count: flaggedCount });
  if (usagePct >= 90)
    attention.push({ label: "اقتربت من حد رسائل باقتك", href: "/dashboard/usage", tone: "rose" });

  return (
    <div className="space-y-5">

      {/* ══ COMMAND CENTER ════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-2xl" style={{
        background: "linear-gradient(145deg,rgba(12,122,108,0.08) 0%,rgba(10,10,12,0.95) 55%,rgba(201,162,75,0.03) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* top hairline */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brand-500/40 via-white/[0.06] to-transparent" />
        {/* left-side ambient only */}
        <div className="pointer-events-none absolute inset-y-0 start-0 w-1/3 bg-[radial-gradient(ellipse_80%_60%_at_0%_50%,rgba(12,122,108,0.10),transparent_80%)]" />

        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_190px]">
          {/* Left: identity */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-brand-500" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {timeGreeting} · {now.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </div>
            <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-white">
              أهلاً،{" "}
              <span className="text-brand-300">{user.name || "صديقي"}</span>
            </h1>
            <p className="mt-2.5 text-[13px] leading-relaxed text-slate-500">
              {msgs30dToday > 0
                ? `وصلك ${msgs30dToday.toLocaleString("ar-EG")} رسالة اليوم`
                : "لا رسائل بعد اليوم"}
              {modules.orders && (pendingOrderCount as number) > 0 &&
                ` · ${(pendingOrderCount as number).toLocaleString("ar-EG")} طلب ينتظرك`}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <SubscriptionBadge sub={sub} daysLeft={daysLeft} waNum={waNum} />
              {bot.whatsappStatus === "connected" ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1.5 text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-emerald-300">واتساب متصل</span>
                </div>
              ) : (
                <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-3 py-1.5 text-xs text-amber-300 transition-colors hover:bg-amber-500/15">
                  <Phone className="h-3 w-3 shrink-0" />
                  اربط واتساب
                </Link>
              )}
            </div>
          </div>

          {/* Right: headline metric tile */}
          <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-black/25 px-5 py-6 text-center">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">
                {modules.orders ? "إيرادات ٧ أيام" : "رسائل ٧ أيام"}
              </div>
              <div className="mt-2 text-[44px] font-black leading-none tracking-[-0.05em] text-white tabular-nums">
                {modules.orders
                  ? (rev7d > 0 ? (rev7d / 100).toLocaleString("ar-EG") : "—")
                  : msgs7d.toLocaleString("ar-EG")}
              </div>
              {modules.orders && rev7d > 0 && <div className="mt-0.5 text-[10px] text-slate-600">جنيه</div>}
              {(() => {
                const d = modules.orders ? revDelta : msgs7dDelta;
                return d !== null ? (
                  <div className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${(d ?? 0) >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                    {(d ?? 0) >= 0 ? "▲" : "▼"} {Math.abs(Math.round(d ?? 0))}%
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ══ KPI BENTO ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <BigKPI label="إجمالي العملاء" value={customerCount} color="sky" />
        <BigKPI label="رسائل هذا الأسبوع" value={msgs7d} delta={msgs7dDelta} color="brand" spark={last7Series} />
        <BigKPI label="تفاعلات المساعد" value={aiCalls} color="purple" />
        {modules.orders
          ? <BigKPI label="طلبات معلّقة" value={pendingOrderCount as number} color={(pendingOrderCount as number) > 0 ? "amber" : "brand"} urgent={(pendingOrderCount as number) > 0} />
          : <BigKPI label="حملات البث" value={broadcastCount as number} color="sky" />
        }
      </div>

      {/* ══ ATTENTION ════════════════════════════════════════════════════════ */}
      {attention.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.06em] text-slate-600">
            <span className="h-px flex-1 bg-white/[0.05]" />
            يحتاج انتباهك
            <span className="h-px flex-1 bg-white/[0.05]" />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="group flex items-center gap-3 rounded-lg px-3.5 py-2.5 transition-colors hover:bg-white/[0.03]"
                style={{
                  borderLeft: `3px solid ${a.tone === "rose" ? "rgba(239,68,68,0.5)" : a.tone === "amber" ? "rgba(245,158,11,0.5)" : "rgba(12,122,108,0.5)"}`,
                  background: "rgba(255,255,255,0.015)",
                }}
              >
                {a.count !== undefined && (
                  <span className={`shrink-0 text-[13px] font-bold tabular-nums leading-none ${
                    a.tone === "rose" ? "text-rose-300" : "text-amber-300"
                  }`}>{a.count}</span>
                )}
                <span className="min-w-0 flex-1 text-[12px] text-slate-300">{a.label}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-700 transition-all group-hover:text-slate-400 group-hover:translate-x-[-1px] group-hover:translate-y-[-1px]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {milestones && !Object.values(milestones.reached).every(Boolean) && <ActivationChecklist milestones={milestones} vertical={vertical} modules={modules} />}

      <InsightStrip context="dashboard" />

      {/* ══ REVENUE BAND (commerce only) ══════════════════════════════════════ */}
      {modules.orders && (
        <FadeInView>
          <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.018]">
            <div className="grid gap-px bg-white/[0.05] sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/dashboard/orders" className="group bg-canvas-deep p-6 transition-colors hover:bg-white/[0.02] sm:col-span-2">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  <DollarSign className="h-3.5 w-3.5" />
                  الإيرادات · آخر 7 أيام
                </div>
                <div className="flex items-end gap-3">
                  <span className="text-[42px] font-black leading-none tracking-[-0.04em] text-white tabular-nums">
                    {rev7d > 0 ? (rev7d / 100).toLocaleString("ar-EG") : "—"}
                    {rev7d > 0 && <span className="ms-2 text-lg font-normal text-slate-500">ج</span>}
                  </span>
                  {revDelta !== null && <TrendBadge delta={revDelta} size="sm" />}
                </div>
                <div className="mt-4"><Sparkline data={last7Series} className="h-10 w-full text-brand-400" /></div>
              </Link>
              <MoneyCell icon={<ShoppingCart className="h-4 w-4" />} label="الطلبات" value={orders7d.toLocaleString("ar-EG")} delta={ordersDelta} sub={pendingOrderCount > 0 ? `${pendingOrderCount} معلّق` : undefined} href="/dashboard/orders" />
              <MoneyCell icon={<TrendingUp className="h-4 w-4" />} label="معدل التحويل" value={conversionPct !== null ? `${conversionPct}%` : "—"} href="/dashboard/analytics" />
            </div>
          </section>
        </FadeInView>
      )}

      {/* ══ ACTIVITY + DRIVERS ════════════════════════════════════════════════ */}
      <FadeInView delay={0.05}>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="card p-5 lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="section-title">نشاط المحادثات</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">آخر 30 يوم · {msgs7d.toLocaleString("ar-EG")} هذا الأسبوع</p>
              </div>
              <span className="text-[11px] tabular-nums text-slate-500">{msgs30dToday} اليوم</span>
            </div>
            <div className="relative h-32">
              {/* Bars */}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {last30.map((d, i) => (
                  <div key={d.day} className="flex flex-1 items-end" title={`${d.day}: ${d.total}`}>
                    <div
                      className="min-h-[3px] w-full rounded-sm"
                      style={{
                        height: `${Math.max((d.total / maxDaily) * 100, 3)}%`,
                        background: i >= 23 ? "rgba(47,147,132,0.55)" : "rgba(47,147,132,0.14)",
                      }}
                    />
                  </div>
                ))}
              </div>
              {/* SVG line overlay connecting bar peaks */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 290 128" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(47,147,132,0.15)" />
                    <stop offset="75%" stopColor="rgba(47,147,132,0.5)" />
                    <stop offset="100%" stopColor="rgba(47,147,132,0.9)" />
                  </linearGradient>
                </defs>
                <polyline
                  points={last30.map((d, i) => `${(i / 29) * 290},${128 - Math.max((d.total / maxDaily) * 120, 4)}`).join(" ")}
                  fill="none"
                  stroke="url(#lineGrad)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Today dot */}
                {(() => {
                  const last = last30[last30.length - 1];
                  const y = 128 - Math.max((last.total / maxDaily) * 120, 4);
                  return last.total > 0 ? <circle cx="290" cy={y} r="2.5" fill="#2f9384" /> : null;
                })()}
              </svg>
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-slate-700 tabular-nums">
              <span>٣٠ي</span><span>٢١ي</span><span>١٤ي</span><span>٧ي</span><span>اليوم</span>
            </div>
          </div>

          <div className="card p-5 lg:col-span-2">
            <h2 className="section-title mb-4">المحركات</h2>
            <div className="space-y-0.5">
              <DriverRow label="العملاء" value={customerCount.toLocaleString("ar-EG")} sub={`${topCustomers.length} نشط`} href="/dashboard/customers" barPct={100} />
              {modules.orders && <DriverRow label="الطلبات" value={orders7d.toLocaleString("ar-EG")} sub={pendingOrderCount > 0 ? `${pendingOrderCount} معلّق` : undefined} href="/dashboard/orders" delta={ordersDelta} barPct={customerCount > 0 ? Math.min((orders7d / customerCount) * 100 * 5, 100) : 0} />}
              <DriverRow label="تفاعلات المساعد" value={aiCalls.toLocaleString("ar-EG")} sub="هذا الأسبوع" href="/dashboard/analytics" barPct={msgs7d > 0 ? Math.min((aiCalls / msgs7d) * 100, 100) : 0} />
              <DriverRow label="المعرفة" value={docCount.toLocaleString("ar-EG")} sub="مستند" href="/dashboard/knowledge" barPct={Math.min(docCount * 10, 100)} />
            </div>
          </div>
        </div>
      </FadeInView>

      {/* ══ RECENT ACTIVITY ═══════════════════════════════════════════════════ */}
      <FadeInView delay={0.1}>
        <div className={`grid gap-4 ${modules.orders ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          {modules.orders && (
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">آخر الطلبات</h2>
                <Link href="/dashboard/orders" className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-white">
                  الكل <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              {!hasOrders || (recentOrders as any[]).length === 0 ? (
                <EmptyState icon={<ShoppingCart className="h-full w-full" />} title="لا طلبات بعد" description="الطلبات المستخرجة من محادثات واتساب تظهر هنا." size="sm" />
              ) : (
                <div className="space-y-0.5">
                  {(recentOrders as any[]).map((o) => (
                    <div key={o.id} className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.03]">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
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
                      <div className="shrink-0 text-[13px] font-bold tabular-nums text-white">
                        {o.total > 0 ? `${(o.total / 100).toLocaleString("ar-EG")} ج` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-title">آخر الرسائل</h2>
              <Link href="/dashboard/inbox" className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-white">
                الكل <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {recentMsgs.length === 0 ? (
              <EmptyState icon={<Inbox className="h-full w-full" />} title="لا رسائل بعد" description="اربط واتساب أو جرّب البوت." size="sm" />
            ) : (
              <div className="space-y-0.5">
                {recentMsgs.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5 rounded-xl p-2.5 transition-colors hover:bg-white/[0.03]">
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
            {sub.subscription && plan && (
              <div className="mt-4 border-t border-white/[0.05] pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-500">{plan.name}</span>
                  <Link href="/dashboard/usage" className="text-[10px] text-slate-400 transition-colors hover:text-white">التفاصيل</Link>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${usagePct > 90 ? "bg-rose-500" : usagePct > 70 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${usagePct}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-slate-500">
                  <span>{sub.subscription.msgsUsed.toLocaleString()} / {plan.monthlyMsgs.toLocaleString()}</span>
                  <span>{daysLeft} يوم متبقي</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </FadeInView>
    </div>
  );
}

// ── Mini sparkline — 7-bar inline chart ──────────────────────────────────────
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-6 items-end gap-[1.5px]">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${Math.max((v / max) * 100, 8)}%`,
            background: i === data.length - 1 ? color : `${color}60`,
          }}
        />
      ))}
    </div>
  );
}

// ── Big KPI — flat left-border stat card ──────────────────────────────────────
function BigKPI({ label, value, delta, color, spark, urgent }: {
  label: string; value: number; delta?: number | null;
  color: "brand" | "sky" | "purple" | "amber";
  spark?: number[];
  urgent?: boolean;
}) {
  const palette: Record<string, { accent: string; numColor: string }> = {
    brand:  { accent: "rgba(47,147,132,0.65)",  numColor: "#2f9384" },
    sky:    { accent: "rgba(56,189,248,0.55)",  numColor: "#38bdf8" },
    purple: { accent: "rgba(192,132,252,0.50)", numColor: "#c084fc" },
    amber:  { accent: "rgba(251,191,36,0.60)",  numColor: "#fbbf24" },
  };
  const p = palette[color];
  return (
    <div
      className="flex flex-col justify-between overflow-hidden rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.022)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        borderLeft: `3px solid ${urgent ? "rgba(251,191,36,0.8)" : p.accent}`,
      }}
    >
      <div className="text-[9px] font-medium tracking-[0.05em] text-slate-500">{label}</div>
      <div className="mt-2 text-[36px] font-black leading-none tabular-nums tracking-[-0.04em]" style={{ color: p.numColor }}>
        {value.toLocaleString("ar-EG")}
      </div>
      {spark && spark.length > 0 && (
        <div className="mt-3">
          <MiniSparkline data={spark} color={p.numColor} />
        </div>
      )}
      {delta !== undefined && delta !== null && !spark && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className={`text-[10px] font-bold tabular-nums ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {delta >= 0 ? "+" : ""}{Math.round(delta)}%
          </span>
          <span className="text-[9px] text-slate-700">7d</span>
        </div>
      )}
      {delta !== undefined && delta !== null && spark && (
        <div className="mt-1 text-[9px] tabular-nums" style={{ color: delta >= 0 ? "#34d399" : "#f87171" }}>
          {delta >= 0 ? "+" : ""}{Math.round(delta)}% vs الأسبوع
        </div>
      )}
    </div>
  );
}

// ── Money cell ────────────────────────────────────────────────────────────────
function MoneyCell({ icon, label, value, delta, sub, href }: {
  icon: React.ReactNode; label: string; value: string; delta?: number | null; sub?: string; href?: string;
}) {
  const inner = (
    <>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
        <span className="text-slate-400">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[26px] font-black leading-none tracking-[-0.03em] text-white tabular-nums">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="mt-2 flex items-center gap-1.5">
          {delta !== undefined && <TrendBadge delta={delta ?? null} size="sm" />}
          {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
        </div>
      )}
    </>
  );
  const cls = "bg-canvas-deep p-6 transition-colors hover:bg-white/[0.02]";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

// ── Driver row ────────────────────────────────────────────────────────────────
function DriverRow({ label, value, sub, href, delta, barPct }: {
  label: string; value: string; sub?: string; href?: string; delta?: number | null; barPct?: number;
}) {
  return (
    <Link href={href || "#"} className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.025]">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tabular-nums text-white">{value}</span>
          {delta !== undefined && delta !== null && (
            <span className={`text-[10px] tabular-nums ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {delta >= 0 ? "+" : ""}{Math.round(delta)}%
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {barPct !== undefined && (
            <div className="h-[2px] w-16 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-brand-500/60" style={{ width: `${Math.min(barPct, 100)}%` }} />
            </div>
          )}
          <span className="text-[10px] text-slate-600">{label}{sub ? ` · ${sub}` : ""}</span>
        </div>
      </div>
      <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-700 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

// ── Subscription badge ────────────────────────────────────────────────────────
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
