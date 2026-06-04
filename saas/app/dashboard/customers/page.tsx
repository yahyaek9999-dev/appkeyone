import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, MessageSquare, ChevronLeft } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";
import AiCopilotStrip from "@/components/ai-copilot-strip";

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

  // Lightweight book-of-business stats — reads as a CRM record list header.
  const active7d = customers.filter(
    (c) => c.lastSeenAt && Date.now() - new Date(c.lastSeenAt).getTime() < 7 * 86400000,
  ).length;

  return (
    <div className="space-y-5">
      {/* Record-list header — title + at-a-glance counts, no card farm. */}
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

      <AiCopilotStrip context="customers" />

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
          {/* Column header — the table is the spine of a CRM, not a list of cards. */}
          <div className="hidden grid-cols-[1fr_140px_120px_90px] items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 sm:grid">
            <span>العميل</span>
            <span>الهاتف</span>
            <span>آخر نشاط</span>
            <span className="text-start">الرسائل</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {customers.map((c) => {
              const last = c.conversation?.messages?.[0];
              const count = c.conversation?._count?.messages ?? 0;
              const p = formatCustomerPhone(c.phone);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/customers/${c.id}`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025] sm:grid-cols-[1fr_140px_120px_90px]"
                >
                  {/* Identity + last message preview */}
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name || c.phone} size="md" className="shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-white">{c.name || "بدون اسم"}</div>
                      {last && (
                        <div className="truncate text-[12px] text-slate-500">
                          {last.role === "user" ? "← " : "→ "}
                          {last.content}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Phone */}
                  <div className="hidden text-[12px] text-slate-400 sm:block">
                    {p.isLid ? (
                      <span className="italic text-slate-500" title={p.raw}>{p.display}</span>
                    ) : (
                      <bdi dir="ltr" className="font-mono">{p.display}</bdi>
                    )}
                  </div>
                  {/* Last activity */}
                  <div className="hidden text-[12px] text-slate-500 sm:block">{timeAgo(c.lastSeenAt)}</div>
                  {/* Message count + chevron */}
                  <div className="flex items-center justify-end gap-2 sm:justify-start">
                    <span className="text-[12px] tabular-nums text-slate-400">{count.toLocaleString("ar-EG")}</span>
                    <ChevronLeft className="h-4 w-4 text-slate-600 transition-colors group-hover:text-slate-400" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
