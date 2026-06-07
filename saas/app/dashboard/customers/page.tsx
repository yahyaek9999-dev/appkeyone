import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, MessageSquare, ArrowUpRight } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";
import InsightStrip from "@/components/insight-strip";
import { FadeInView } from "@/components/ui/stagger-reveal";

export default async function CustomersPage() {
  const { user } = await requirePagePermission("customers");
  const customers = await prisma.customer.findMany({
    where: { userId: user.id },
    orderBy: { lastSeenAt: "desc" },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { messages: true } },
        },
      },
    },
  });

  const active7d = customers.filter(
    (c) => c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() < 7 * 86400000,
  ).length;

  return (
    <div className="space-y-5">
      {/* Header — title + contextual counts */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">العملاء</h1>
          <p className="page-desc mt-1">
            {customers.length.toLocaleString("ar-EG")} سجل · {active7d.toLocaleString("ar-EG")} نشط هذا الأسبوع
          </p>
        </div>
        <Link href="/dashboard/inbox" className="btn-ghost h-9 text-[13px]">
          <MessageSquare className="h-4 w-4" />
          صندوق المحادثات
        </Link>
      </div>

      <InsightStrip context="customers" />

      <FadeInView delay={0.05}>
      {customers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="h-full w-full" />}
            title="لسه ما فيش عملاء"
            description="هيظهروا هنا تلقائياً لما يبعتوا رسائل لبوتك على واتساب."
            size="lg"
            action={
              <Link href="/dashboard/playground" className="btn-primary inline-flex">
                <MessageSquare className="h-4 w-4" />
                جرّب البوت بنفسك
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Premium CRM table header — dense, uppercase */}
          <div className="hidden grid-cols-[1fr_140px_100px_100px_80px] items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 sm:grid">
            <span>العميل</span>
            <span>الهاتف</span>
            <span className="text-center">آخر نشاط</span>
            <span className="text-center">الرسائل</span>
            <span className="text-center"></span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {customers.map((c) => {
              const last = c.conversation?.messages?.[0];
              const count = c.conversation?._count?.messages ?? 0;
              const p = formatCustomerPhone(c.phone);
              const isActive = c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() < 24 * 60 * 60 * 1000;
              return (
                <div
                  key={c.id}
                  className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[1fr_140px_100px_100px_80px]"
                >
                  {/* Identity + last message */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar name={c.name || c.phone} size="md" />
                      {isActive && (
                        <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas-deep bg-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/customers/${c.id}`} className="truncate text-[14px] font-medium text-white transition-colors hover:text-brand-300">
                          {c.name || "بدون اسم"}
                        </Link>
                      </div>
                      {last && (
                        <div className="truncate text-[12px] text-slate-500 leading-tight mt-0.5">
                          {last.role === "user" ? "← " : "→ "}
                          {last.content}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Phone */}
                  <div className="hidden text-[12px] text-slate-400 sm:block font-mono" dir="ltr">
                    {p.display}
                  </div>
                  {/* Last activity */}
                  <div className="hidden text-[12px] text-slate-500 sm:text-center sm:block">
                    {timeAgo(c.lastSeenAt)}
                  </div>
                  {/* Messages */}
                  <div className="hidden text-[12px] tabular-nums text-slate-400 sm:text-center sm:block">
                    {count.toLocaleString("ar-EG")}
                  </div>
                  {/* Action */}
                  <div className="flex justify-end">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 opacity-0 transition-all hover:bg-white/[0.04] hover:text-white group-hover:opacity-100"
                    >
                      فتح <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </FadeInView>
    </div>
  );
}
