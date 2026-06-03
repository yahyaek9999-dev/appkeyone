import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, Search, MessageSquare } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";

export default async function CustomersPage() {
  const { user } = await requirePagePermission("customers");
  const customers = await prisma.customer.findMany({
    where: { userId: user.id },
    orderBy: { lastSeenAt: "desc" },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">العملاء</h1>
          <p className="text-slate-400">{customers.length} عميل</p>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="w-full h-full" />}
            title="لسه ما فيش عملاء"
            description="هيظهروا هنا تلقائياً لما يبعتوا رسائل لبوتك على واتساب."
            size="lg"
            action={
              <Link href="/dashboard/playground" className="btn-primary inline-flex">
                <MessageSquare className="w-4 h-4" />
                جرّب البوت بنفسك
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card divide-y divide-white/5">
          {customers.map((c) => {
            const last = c.conversation?.messages?.[0];
            return (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className="flex items-center gap-4 p-4 hover:bg-white/[0.03] transition"
              >
                <Avatar name={c.name || c.phone} size="lg" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="font-semibold truncate">{c.name || "بدون اسم"}</div>
                    <div className="text-xs text-slate-500">{timeAgo(c.lastSeenAt)}</div>
                  </div>
                  {(() => {
                    const p = formatCustomerPhone(c.phone);
                    return p.isLid ? (
                      <div className="text-xs text-slate-500 italic" title={p.raw}>{p.display}</div>
                    ) : (
                      <bdi dir="ltr" className="text-xs text-slate-500 font-mono block">{p.display}</bdi>
                    );
                  })()}
                  {last && (
                    <div className="text-sm text-slate-400 truncate mt-1">
                      {last.role === "user" ? "← " : "→ "}
                      {last.content}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
