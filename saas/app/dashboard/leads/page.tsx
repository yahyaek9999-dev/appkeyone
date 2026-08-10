import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { Flame, MessageSquare, ChevronLeft, Users, TrendingUp, Activity } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LeadStatusBadge, type LeadStatus } from "@/components/ui/lead-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";

export const dynamic = "force-dynamic";

const SENTIMENT_BADGE: Record<string, { label: string; cls: string }> = {
  angry:    { label: "غاضب",   cls: "bg-rose-500/15 text-rose-300 ring-rose-500/25" },
  negative: { label: "سلبي",   cls: "bg-orange-500/15 text-orange-300 ring-orange-500/25" },
  neutral:  { label: "محايد",  cls: "bg-slate-500/15 text-slate-300 ring-slate-500/25" },
  positive: { label: "إيجابي", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25" },
};
const INTENT_BADGE: Record<string, { label: string; cls: string }> = {
  buy:       { label: "نية شراء", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25" },
  inquiry:   { label: "استفسار", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/25" },
  complaint: { label: "شكوى",    cls: "bg-rose-500/15 text-rose-300 ring-rose-500/25" },
  support:   { label: "دعم",     cls: "bg-amber-500/15 text-amber-300 ring-amber-500/25" },
  greeting:  { label: "تحية",    cls: "bg-slate-500/15 text-slate-300 ring-slate-500/25" },
  other:     { label: "أخرى",    cls: "bg-slate-500/15 text-slate-400 ring-slate-500/25" },
};

function scoreColor(score: number) {
  if (score >= 70) return "from-rose-500 to-orange-400";
  if (score >= 40) return "from-amber-500 to-yellow-400";
  return "from-slate-500 to-slate-400";
}
function scoreToStatus(score: number): LeadStatus {
  if (score >= 70) return "hot";
  if (score >= 40) return "qualified";
  if (score > 0) return "contacted";
  return "cold";
}

export default async function LeadsPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  const g = await pageGate("lead_scoring");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="العملاء المحتملون (تقييم الـ Leads)"
          description="رتّب عملاءك المحتملين حسب احتمالية الشراء وركّز جهدك على الأقرب للشراء. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }

  const leads = await prisma.customer.findMany({
    where: { userId: uid } as any,
    orderBy: { leadScore: "desc" } as any,
    take: 100,
    include: {
      conversation: {
        select: {
          id: true,
          updatedAt: true,
          _count: { select: { messages: true } },
          messages: {
            where: { role: "user" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true },
          },
        },
      },
    },
  });

  const hot = leads.filter((c: any) => c.leadScore >= 70).length;
  const warm = leads.filter((c: any) => c.leadScore >= 40 && c.leadScore < 70).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">العملاء المحتملون</h1>
        <p className="page-desc mt-1">مرتّبون حسب احتمالية الشراء — الأعلى نقاطاً هم الأقرب للشراء.</p>
      </div>

      {/* Stat band */}
      <div className="metric-group grid-cols-3">
        <LeadStat icon={<Flame className="h-4 w-4" />} label="ساخن · 70+" value={hot} tone="text-orange-300" />
        <LeadStat icon={<TrendingUp className="h-4 w-4" />} label="دافئ · 40–69" value={warm} tone="text-amber-300" />
        <LeadStat icon={<Activity className="h-4 w-4" />} label="إجمالي العملاء" value={leads.length} tone="text-white" />
      </div>

      {leads.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-full w-full" />}
            title="لا يوجد عملاء بعد"
            description="لما يبدأوا التواصل، هيظهروا هنا مرتّبين حسب نقاطهم."
            size="lg"
          />
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {leads.map((c: any) => {
              const sent = SENTIMENT_BADGE[c.lastSentiment || "neutral"] || SENTIMENT_BADGE.neutral;
              const intent = INTENT_BADGE[c.lastIntent || "other"] || INTENT_BADGE.other;
              const lastMsg = c.conversation?.messages[0]?.content || "—";
              return (
                <div key={c.id}>
                <div className="card-hover p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={c.name || c.phone} size="md" />
                      {c.leadScore >= 70 && (
                        <span className="absolute -top-0.5 -end-0.5">
                          <StatusDot tone="busy" pulse size="sm" label="عميل ساخن" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-white">{c.name || "—"}</div>
                      <div className="text-xs text-slate-500 font-mono" dir="ltr">{c.phone}</div>
                    </div>
                    <span className="shrink-0 text-lg font-semibold tabular-nums text-white">{c.leadScore}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={`h-full rounded-full bg-gradient-to-r ${scoreColor(c.leadScore)}`}
                         style={{ width: `${c.leadScore}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <LeadStatusBadge status={scoreToStatus(c.leadScore)} size="sm" />
                    <Pill className={intent.cls}>{intent.label}</Pill>
                    <Pill className={sent.cls}>{sent.label}</Pill>
                    <span className="text-xs text-slate-500">{c.conversation?._count.messages ?? 0} رسالة</span>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">{lastMsg.slice(0, 120)}</div>
                  {c.conversation && (
                    <Link
                      href={`/dashboard/inbox?c=${c.id}`}
                      className="btn-ghost mt-3 h-8 w-full text-xs"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      فتح المحادثة
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="card mobile-scroll-x hidden overflow-hidden md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-[26%]">العميل</th>
                  <th className="w-[20%]">النقاط</th>
                  <th>النية</th>
                  <th>المشاعر</th>
                  <th className="w-[24%]">آخر رسالة</th>
                  <th className="text-center">الرسائل</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((c: any) => {
                  const sent = SENTIMENT_BADGE[c.lastSentiment || "neutral"] || SENTIMENT_BADGE.neutral;
                  const intent = INTENT_BADGE[c.lastIntent || "other"] || INTENT_BADGE.other;
                  const lastMsg = c.conversation?.messages[0]?.content || "—";
                  return (
                    <tr key={c.id} className="group">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <Avatar name={c.name || c.phone} size="md" />
                            {c.leadScore >= 70 && (
                              <span className="absolute -top-0.5 -end-0.5">
                                <StatusDot tone="busy" pulse size="sm" label="عميل ساخن" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white">{c.name || "—"}</div>
                            <div className="text-xs text-slate-500 font-mono" dir="ltr">{c.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex min-w-[150px] items-center gap-2.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className={`h-full rounded-full bg-gradient-to-r ${scoreColor(c.leadScore)}`}
                                 style={{ width: `${c.leadScore}%` }} />
                          </div>
                          <span className="w-7 text-end text-sm font-semibold tabular-nums text-white">{c.leadScore}</span>
                        </div>
                        <div className="mt-1.5">
                          <LeadStatusBadge status={scoreToStatus(c.leadScore)} size="sm" />
                        </div>
                      </td>
                      <td><Pill className={intent.cls}>{intent.label}</Pill></td>
                      <td><Pill className={sent.cls}>{sent.label}</Pill></td>
                      <td className="max-w-[280px]">
                        <div className="truncate text-xs text-slate-400">{lastMsg.slice(0, 80)}</div>
                      </td>
                      <td className="text-center tabular-nums text-slate-400">
                        {c.conversation?._count.messages ?? 0}
                      </td>
                      <td className="text-start">
                        {c.conversation && (
                          <Link
                            href={`/dashboard/inbox?c=${c.id}`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 opacity-0 transition-all hover:bg-white/[0.04] hover:text-white group-hover:opacity-100"
                          >
                            <MessageSquare className="h-3 w-3" />
                            فتح
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function LeadStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="metric-cell">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums tracking-[-0.02em] ${tone}`}>
        {value.toLocaleString("ar-EG")}
      </div>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}
