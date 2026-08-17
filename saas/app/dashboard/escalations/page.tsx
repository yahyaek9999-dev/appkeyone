import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { getUserIdForPermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import EscalationActions from "@/app/dashboard/escalations/ticket-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { pageGate } from "@/lib/membership/gate";
import { LockedFeature } from "@/components/billing/LockedFeature";

export const dynamic = "force-dynamic";

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const SEV_STYLE: Record<string, { dot: string; badge: string; border: string }> = {
  critical: {
    dot: "bg-rose-500",
    badge: "text-rose-300 bg-rose-500/10 border-rose-500/25",
    border: "border-rose-500/30",
  },
  high: {
    dot: "bg-orange-500",
    badge: "text-orange-300 bg-orange-500/10 border-orange-500/25",
    border: "border-orange-500/20",
  },
  medium: {
    dot: "bg-amber-500",
    badge: "text-amber-300 bg-amber-500/10 border-amber-500/25",
    border: "border-white/[0.07]",
  },
  low: {
    dot: "bg-slate-500",
    badge: "text-slate-300 bg-white/[0.05] border-white/10",
    border: "border-white/[0.07]",
  },
};

const HANDOFF_LABELS: Record<string, string> = {
  ai_active: "استجابة تلقائية",
  human_active: "موظف نشط",
  escalated: "مصعّد",
  waiting_human: "ينتظر موظف",
};

const SEV_LABELS: Record<string, string> = {
  critical: "حرجة",
  high: "عالية",
  medium: "متوسطة",
  low: "منخفضة",
};

function timeWaiting(d: Date): string {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}س`;
  return `${Math.floor(hrs / 24)}ي`;
}

export default async function EscalationsPage() {
  const gate = await pageGate("escalations");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="التصعيدات والمتابعة" description="تتبّع الحالات الحرجة وإدارة تصعيدات الفريق" recommendedTier={gate.recommendedTier} />;
  const uid = gate.uid;

  const [tickets, resolved24h] = await Promise.all([
    (prisma as any).escalationTicket
      .findMany({
        where: { userId: uid, status: { in: ["open", "acknowledged", "human_active"] } },
        orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
        take: 100,
      })
      .catch(() => []),
    (prisma as any).escalationTicket
      .count({
        where: {
          userId: uid,
          status: "resolved",
          updatedAt: { gte: new Date(Date.now() - 86400000) },
        },
      })
      .catch(() => 0),
  ]);

  // Sort: critical → high → medium → low, then by time (oldest first)
  const sorted = [...tickets].sort((a: any, b: any) => {
    const sevDiff = (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const critical = tickets.filter((t: any) => t.severity === "critical" || t.severity === "high").length;
  const waiting = tickets.filter((t: any) => t.status === "open").length;
  const longWait = tickets.filter((t: any) => {
    const mins = (Date.now() - new Date(t.updatedAt).getTime()) / 60000;
    return mins > 60 && t.status !== "resolved";
  }).length;

  return (
    <div className="space-y-5" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">التصعيدات</h1>
          <p className="page-desc mt-1">
            {tickets.length > 0
              ? `${tickets.length} محادثة تحتاج تدخلاً${critical > 0 ? ` · ${critical} عالية الأولوية` : ""}`
              : "لا توجد محادثات تحتاج تدخلاً الآن"}
          </p>
        </div>
        {resolved24h > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-[12px] text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {resolved24h} حُلّت اليوم
          </div>
        )}
      </div>

      {/* Priority band — only if there's something to show */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">عالية الأولوية</div>
            <div className={`mt-1.5 text-2xl font-bold tabular-nums ${critical > 0 ? "text-rose-400" : "text-slate-500"}`}>{critical}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">تنتظر استلاماً</div>
            <div className={`mt-1.5 text-2xl font-bold tabular-nums ${waiting > 0 ? "text-amber-400" : "text-slate-500"}`}>{waiting}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">انتظار &gt;١ ساعة</div>
            <div className={`mt-1.5 text-2xl font-bold tabular-nums ${longWait > 0 ? "text-orange-400" : "text-slate-500"}`}>{longWait}</div>
          </div>
        </div>
      )}

      {/* Priority queue */}
      <div className="space-y-2">
        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.01]">
            <EmptyState
              icon={<ShieldAlert className="h-full w-full" />}
              title="لا توجد محادثات تحتاج تدخلاً"
              description="حين يرصد المساعد موقفاً يحتاج مساعدة بشرية، ستظهر هنا مباشرةً."
            />
          </div>
        ) : (
          sorted.map((t: any) => {
            const sev = SEV_STYLE[t.severity] || SEV_STYLE.medium;
            const wait = timeWaiting(t.updatedAt);
            const isCritical = t.severity === "critical";

            return (
              <div
                key={t.id}
                className={`overflow-hidden rounded-xl border bg-white/[0.015] ${isCritical ? "border-rose-500/30" : "border-white/[0.07]"}`}
              >
                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Severity indicator */}
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className={`${isCritical ? "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 " + sev.dot : ""}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${sev.dot}`} />
                  </span>

                  {/* Customer + summary */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.customerId ? (
                        <Link
                          href={`/dashboard/customers/${t.customerId}`}
                          className="text-[13px] font-semibold text-white hover:text-brand-300 transition-colors"
                        >
                          {t.customerName || t.summary || "عميل"}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-semibold text-white">{t.customerName || t.summary || "عميل"}</span>
                      )}
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${sev.badge}`}>
                        {SEV_LABELS[t.severity] || t.severity}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-400">
                        {HANDOFF_LABELS[t.handoffState] || t.handoffState}
                      </span>
                    </div>
                    {/* Issue excerpt */}
                    {t.summary && t.summary !== (t.customerName || "") && (
                      <div className="mt-0.5 text-[12px] text-slate-500 truncate max-w-[420px]">{t.summary}</div>
                    )}
                  </div>

                  {/* Time waiting */}
                  <div className="shrink-0 flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="h-3 w-3" />
                    {wait}
                  </div>

                  {/* Open conversation link */}
                  {t.conversationId && (
                    <Link
                      href={`/dashboard/inbox?c=${t.customerId || ""}`}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                      فتح <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>

                {/* Last customer message — collapsed excerpt */}
                {t.lastCustomerMessage && (
                  <div className="mx-4 mb-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-400 line-clamp-2">
                    {t.lastCustomerMessage}
                  </div>
                )}

                {/* Emotional signals */}
                {(t.angerScore >= 60 || t.frustrationScore >= 60 || t.confidenceScore < 40) && (
                  <div className="mx-4 mb-3 flex flex-wrap gap-1.5">
                    {t.angerScore >= 60 && (
                      <span className="rounded-full border border-rose-500/25 bg-rose-500/8 px-2 py-0.5 text-[11px] text-rose-300">مزاج صعب</span>
                    )}
                    {t.frustrationScore >= 60 && (
                      <span className="rounded-full border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 text-[11px] text-amber-300">إحباط واضح</span>
                    )}
                    {t.confidenceScore < 40 && (
                      <span className="rounded-full border border-sky-500/25 bg-sky-500/8 px-2 py-0.5 text-[11px] text-sky-300">يحتاج طمأنة</span>
                    )}
                  </div>
                )}

                {/* Actions row */}
                <div className="border-t border-white/[0.04] px-4 py-2.5">
                  <EscalationActions
                    ticketId={t.id}
                    status={t.status}
                    initialDraft={(t as any).aiDraftReply}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
