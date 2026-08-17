import { requirePagePermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import {
  MessageSquare, AlertTriangle, CheckCircle2,
  Clock, ArrowUpRight, ClipboardList, Flag, User,
} from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

const SEVERITY_LABELS: Record<string, { label: string; cls: string }> = {
  critical: { label: "حرج",   cls: "text-rose-300 bg-rose-500/10 border-rose-500/20" },
  high:     { label: "عالٍ",  cls: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
  medium:   { label: "متوسط", cls: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
  low:      { label: "منخفض", cls: "text-slate-400 bg-white/[0.04] border-white/[0.07]" },
};

const STATUS_LABELS: Record<string, string> = {
  open:         "مفتوح",
  acknowledged: "تم الاستلام",
  human_active: "نشط",
  resolved:     "مُحلَّل",
  dismissed:    "مُغلَق",
};

export default async function MyWorkPage() {
  const gate = await pageGate("my_work");
  if (!gate.uid) redirect("/login");
  if (!gate.allowed) return <LockedFeature title="عملي اليوم" description="قائمة مهام الوكيل: المحادثات المفتوحة والمهام المُسنَدة" recommendedTier={gate.recommendedTier} />;
  const { user } = await requirePagePermission("inbox");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    humanActiveConvs,
    openEscalations,
    flaggedMsgs,
    resolvedToday,
  ] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        handoffState: "human_active",
        customer: { userId: user.id },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, leadScore: true, assignedAdmin: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { humanActiveAt: "desc" },
      take: 30,
    }),
    (prisma as any).escalationTicket.findMany({
      where: { userId: user.id, status: { in: ["open", "acknowledged"] } },
      orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
      take: 30,
    }).catch(() => []),
    prisma.message.findMany({
      where: {
        flagged: true,
        createdAt: { gte: todayStart },
        conversation: { customer: { userId: user.id } },
      },
      include: { conversation: { include: { customer: { select: { id: true, name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    (prisma as any).escalationTicket.count({
      where: { userId: user.id, status: "resolved", resolvedAt: { gte: todayStart } },
    }).catch(() => 0),
  ]);

  const activeCount = humanActiveConvs.length;
  const escalationCount = (openEscalations as any[]).length;
  const flaggedCount = flaggedMsgs.length;

  return (
    <div className="space-y-0" dir="rtl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-white/[0.05] pb-5">
        <h1 className="page-title">عملي اليوم</h1>
        <p className="page-desc mt-1">
          المحادثات النشطة، التصعيدات المفتوحة، والرسائل المعلّمة — كل شيء في مكان واحد.
        </p>
      </div>

      {/* ── Summary band ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] my-6">
        <div className="px-5 py-4 text-center">
          <div className={`text-[28px] font-black tabular-nums leading-none ${activeCount > 0 ? "text-sky-300" : "text-slate-600"}`}>
            {activeCount}
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-slate-500">محادثة نشطة</div>
        </div>
        <div className="px-5 py-4 text-center">
          <div className={`text-[28px] font-black tabular-nums leading-none ${escalationCount > 0 ? "text-rose-300" : "text-slate-600"}`}>
            {escalationCount}
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-slate-500">تصعيد مفتوح</div>
        </div>
        <div className="px-5 py-4 text-center">
          <div className={`text-[28px] font-black tabular-nums leading-none ${resolvedToday > 0 ? "text-emerald-300" : "text-slate-600"}`}>
            {resolvedToday}
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-slate-500">أُنجز اليوم</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Active conversations ──────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-sky-400" />
              <h2 className="text-[13px] font-semibold text-white">محادثات بانتظار ردي</h2>
              {activeCount > 0 && (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                  {activeCount}
                </span>
              )}
            </div>
            <Link href="/dashboard/inbox" className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors">
              صندوق المحادثات <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {activeCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.01] py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/40 mb-3" />
              <p className="text-[13px] font-medium text-slate-400">لا توجد محادثات نشطة</p>
              <p className="text-[11px] text-slate-600 mt-1">جميع المحادثات تحت التشغيل التلقائي</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
              {humanActiveConvs.map((conv) => {
                const lastMsg = (conv as any).messages?.[0];
                const customer = (conv as any).customer;
                const waitSince = (conv as any).humanActiveAt;
                return (
                  <Link
                    key={conv.id}
                    href="/dashboard/inbox"
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
                  >
                    <Avatar name={customer.name || customer.phone} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-white">
                          {customer.name || customer.phone}
                        </span>
                        {waitSince && (
                          <span className="shrink-0 text-[10px] text-amber-400 tabular-nums">
                            {timeAgo(waitSince)}
                          </span>
                        )}
                      </div>
                      {lastMsg && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{lastMsg.content}</p>
                      )}
                      {customer.assignedAdmin && (
                        <div className="mt-1 flex items-center gap-1">
                          <User className="h-2.5 w-2.5 text-slate-600" />
                          <span className="text-[10px] text-slate-600">{customer.assignedAdmin}</span>
                        </div>
                      )}
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-700 mt-0.5" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Open escalations ─────────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <h2 className="text-[13px] font-semibold text-white">تصعيدات مفتوحة</h2>
              {escalationCount > 0 && (
                <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                  {escalationCount}
                </span>
              )}
            </div>
            <Link href="/dashboard/escalations" className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors">
              كل التصعيدات <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {escalationCount === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.01] py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/40 mb-3" />
              <p className="text-[13px] font-medium text-slate-400">لا توجد تصعيدات مفتوحة</p>
              <p className="text-[11px] text-slate-600 mt-1">جميع المحادثات تسير بشكل طبيعي</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
              {(openEscalations as any[]).map((t) => {
                const sev = SEVERITY_LABELS[t.severity] ?? SEVERITY_LABELS.medium;
                return (
                  <Link
                    key={t.id}
                    href="/dashboard/escalations"
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
                  >
                    <div className="mt-0.5 shrink-0">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${sev.cls}`}>
                        {sev.label}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-slate-200">{t.reason || t.trigger}</p>
                      {t.lastCustomerMessage && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">"{t.lastCustomerMessage}"</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-600">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{timeAgo(t.createdAt)}</span>
                        {t.assignedTo && (
                          <>
                            <span>·</span>
                            <User className="h-2.5 w-2.5" />
                            <span>{t.assignedTo}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-700 mt-0.5" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Flagged messages today ────────────────────────────────────────────── */}
      {flaggedCount > 0 && (
        <section className="mt-6">
          <div className="mb-4 flex items-center gap-2">
            <Flag className="h-4 w-4 text-amber-400" />
            <h2 className="text-[13px] font-semibold text-white">رسائل معلّمة اليوم</h2>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              {flaggedCount}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.06] divide-y divide-white/[0.04]">
            {flaggedMsgs.map((m) => {
              const customer = (m as any).conversation?.customer;
              return (
                <Link
                  key={m.id}
                  href="/dashboard/inbox"
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
                >
                  <Avatar name={customer?.name || customer?.phone || "?"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-white">
                        {customer?.name || customer?.phone || "—"}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-600">{timeAgo((m as any).createdAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{(m as any).content}</p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-700 mt-0.5" />
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
