import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { Flame, MessageSquare, ChevronLeft, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LeadStatusBadge, type LeadStatus } from "@/components/ui/lead-status-badge";
import { StatGrid } from "@/components/ui/stat-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/ui/status-dot";

export const dynamic = "force-dynamic";

const SENTIMENT_BADGE: Record<string, { label: string; cls: string }> = {
  angry:    { label: "غاضب",   cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  negative: { label: "سلبي",   cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  neutral:  { label: "محايد",  cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  positive: { label: "إيجابي", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};
const INTENT_BADGE: Record<string, { label: string; cls: string }> = {
  buy:       { label: "نية شراء", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  inquiry:   { label: "استفسار", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  complaint: { label: "شكوى",    cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  support:   { label: "دعم",     cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  greeting:  { label: "تحية",    cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  other:     { label: "أخرى",    cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="w-6 h-6 text-orange-400" />
            العملاء المحتملون
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ترتيب العملاء بحسب احتمالية الشراء — أعلى نقاط = أقرب للشراء.
          </p>
        </div>
      </div>

      <StatGrid cols={3}>
        <Stat label="ساخن (70+)" value={hot} cls="text-orange-300" />
        <Stat label="دافئ (40-69)" value={warm} cls="text-amber-300" />
        <Stat label="إجمالي" value={leads.length} cls="text-sky-300" />
      </StatGrid>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-white/5 text-slate-400">
            <tr>
              <th className="p-3 text-right">العميل</th>
              <th className="p-3 text-right">النقاط</th>
              <th className="p-3 text-right">النية</th>
              <th className="p-3 text-right">المشاعر</th>
              <th className="p-3 text-right">آخر رسالة</th>
              <th className="p-3 text-right">الرسائل</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((c: any) => {
              const sent = SENTIMENT_BADGE[c.lastSentiment || "neutral"] || SENTIMENT_BADGE.neutral;
              const intent = INTENT_BADGE[c.lastIntent || "other"] || INTENT_BADGE.other;
              const lastMsg = c.conversation?.messages[0]?.content || "—";
              return (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <Avatar name={c.name || c.phone} size="md" />
                        {c.leadScore >= 70 && (
                          <span className="absolute -top-0.5 -left-0.5">
                            <StatusDot tone="busy" pulse size="sm" label="عميل ساخن" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name || "—"}</div>
                        <div className="text-xs text-slate-400" dir="ltr">{c.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full bg-gradient-to-r ${scoreColor(c.leadScore)}`}
                             style={{ width: `${c.leadScore}%` }} />
                      </div>
                      <span className="text-xs font-mono tabular-nums">{c.leadScore}</span>
                    </div>
                    <div className="mt-1">
                      <LeadStatusBadge status={scoreToStatus(c.leadScore)} size="sm" />
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-1 rounded-md text-xs border ${intent.cls}`}>
                      {intent.label}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-1 rounded-md text-xs border ${sent.cls}`}>
                      {sent.label}
                    </span>
                  </td>
                  <td className="p-3 max-w-[280px]">
                    <div className="text-xs text-slate-300 truncate">{lastMsg.slice(0, 80)}</div>
                  </td>
                  <td className="p-3 text-slate-300">
                    {c.conversation?._count.messages ?? 0}
                  </td>
                  <td className="p-3">
                    {c.conversation && (
                      <Link
                        href={`/dashboard/inbox?c=${c.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs"
                      >
                        <MessageSquare className="w-3 h-3" />
                        فتح
                        <ChevronLeft className="w-3 h-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="p-0">
                  <EmptyState
                    icon={<Users className="w-full h-full" />}
                    title="لا يوجد عملاء بعد"
                    description="لما يبدأوا التواصل، هيظهروا هنا مرتّبين حسب نقاطهم."
                    size="md"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
