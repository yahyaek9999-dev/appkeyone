import { prisma } from "@/lib/db";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Owner Daily Check (J7). Decision-first, NOT a stat grid. Answers in one glance:
 * is everything okay — and if not, exactly what to do. Five areas only
 * (revenue / WhatsApp / subscriptions / customers / required action); each item
 * is an ACTION with a CTA. Passive numbers are demoted to a small strip below.
 */
async function getDaily() {
  const now = Date.now();
  const soon = new Date(now + 3 * 24 * 60 * 60 * 1000);
  const [activeSubsList, pendingSubs, expiredSubs, totalUsers, totalMessages] = await Promise.all([
    prisma.subscription.findMany({ where: { status: "active" }, include: { plan: true } }),
    prisma.subscription.count({ where: { status: "pending" } }),
    prisma.subscription.count({ where: { status: "expired" } }),
    prisma.user.count({ where: { role: "user" } as any }),
    prisma.message.count(),
  ]);
  const activeUserIds = activeSubsList.map((s: any) => s.userId);

  const [pendingProofs, disconnected, expiringSoon, openIncidents] = await Promise.all([
    (prisma as any).paymentProof.count({ where: { status: { in: ["pending", "under_review"] } } }).catch(() => 0),
    activeUserIds.length
      ? prisma.bot.count({ where: { userId: { in: activeUserIds }, whatsappStatus: { not: "connected" } } as any }).catch(() => 0)
      : Promise.resolve(0),
    prisma.subscription.count({ where: { status: "active", expiresAt: { lte: soon, gt: new Date() } } }).catch(() => 0),
    (prisma as any).incident.count({ where: { status: { in: ["open", "assigned"] } } }).catch(() => 0),
  ]);

  const mrrUsd = activeSubsList.reduce((sum: number, s: any) => {
    const price = s.billingCycle === "yearly" ? Math.round((s.plan.yearlyUsd || s.plan.priceUsd * 10) / 12) : s.plan.priceUsd;
    return sum + price;
  }, 0);

  return { activeSubs: activeSubsList.length, pendingSubs, expiredSubs, totalUsers, totalMessages, pendingProofs, disconnected, expiringSoon, openIncidents, mrrUsd };
}

type Action = { area: string; problem: string; cta: string; href: string; urgent: boolean };

export default async function AdminHome() {
  const s = await getDaily();

  // Build the action list — ONE line per real problem, ordered urgent-first.
  const actions: Action[] = [];
  if (s.pendingProofs > 0) actions.push({ area: "الإيرادات", problem: `${s.pendingProofs} دفعة بانتظار مراجعتك`, cta: "راجع المدفوعات", href: "/admin/payment-reviews", urgent: true });
  if (s.disconnected > 0) actions.push({ area: "واتساب", problem: `${s.disconnected} تاجر مشترك واتسابه غير متصل`, cta: "حالة واتساب", href: "/admin/whatsapp", urgent: true });
  if (s.openIncidents > 0) actions.push({ area: "العملاء", problem: `${s.openIncidents} حادثة مفتوحة تحتاج حلاً`, cta: "الحوادث", href: "/admin/incidents", urgent: true });
  if (s.expiredSubs > 0) actions.push({ area: "الاشتراكات", problem: `${s.expiredSubs} اشتراك منتهٍ`, cta: "تابع التجديد", href: "/admin/users", urgent: false });
  if (s.expiringSoon > 0) actions.push({ area: "الاشتراكات", problem: `${s.expiringSoon} اشتراك يقترب من الانتهاء (٣ أيام)`, cta: "تابع", href: "/admin/users", urgent: false });
  if (s.pendingSubs > 0) actions.push({ area: "العملاء", problem: `${s.pendingSubs} عميل بانتظار التفعيل`, cta: "فعّل", href: "/admin/users", urgent: false });
  actions.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  const allClear = actions.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">فحص اليوم</h1>
        <p className="page-desc">{allClear ? "كل شيء يعمل — لا إجراءات عاجلة." : "ما يحتاج إجراءً منك الآن، بالترتيب."}</p>
      </div>

      {/* Decision panel — the only thing the owner needs at 9 AM */}
      {allClear ? (
        <div className="card flex items-center gap-4 border-emerald-500/25 bg-emerald-500/[0.05] p-6">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-400" />
          <div>
            <div className="text-lg font-bold text-white">كل شيء على ما يرام ✓</div>
            <div className="text-sm text-slate-400">لا مدفوعات معلّقة، ولا انقطاع واتساب، ولا حوادث، ولا اشتراكات تحتاج انتباهك. استمتع بيومك.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {actions.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className={`card flex items-center gap-4 p-4 transition hover:bg-white/[0.03] ${a.urgent ? "border-rose-500/25 bg-rose-500/[0.04]" : "border-amber-500/20 bg-amber-500/[0.03]"}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${a.urgent ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-500">{a.area}</div>
                <div className="text-sm font-semibold text-white">{a.problem}</div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${a.urgent ? "bg-rose-500/15 text-rose-200" : "bg-white/[0.06] text-slate-200"}`}>
                {a.cta}
                <ChevronLeft className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Demoted: the numbers (reference only, not the focus) */}
      <div className="border-t border-white/[0.06] pt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">الأرقام</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="الإيراد الشهري (MRR)" value={`$${s.mrrUsd.toLocaleString("en-US")}`} />
          <Mini label="اشتراكات نشطة" value={s.activeSubs.toLocaleString()} />
          <Mini label="إجمالي العملاء" value={s.totalUsers.toLocaleString()} />
          <Mini label="إجمالي الرسائل" value={s.totalMessages.toLocaleString()} />
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-white">{value}</div>
    </div>
  );
}
