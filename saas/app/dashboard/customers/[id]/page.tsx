import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import ChatView from "./chat-view";
import CustomerTabs from "./customer-tabs";
import { formatCustomerPhone } from "@/lib/phone";
import DeleteCustomerButton from "./delete-button";
import MergeCustomerButton from "./merge-button";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const [customer, orders, broadcastItems, knowledgeGaps] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: params.id },
      include: { conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
    }),
    (prisma as any).order.findMany({
      where: { customerId: params.id, userId: user.id },
      select: { id: true, createdAt: true, status: true, total: true, currency: true, items: { select: { name: true, quantity: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.broadcastItem.findMany({
      where: { customerId: params.id },
      select: { id: true, sentAt: true, status: true, broadcast: { select: { title: true } } },
      orderBy: { sentAt: "asc" },
    }),
    prisma.knowledgeGap.findMany({
      where: { customerId: params.id, userId: user.id },
      select: { id: true, createdAt: true, question: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);
  if (!customer || customer.userId !== user.id) notFound();

  type TEvent = {
    kind: "message" | "order" | "broadcast" | "ai_gap";
    id: string;
    at: string;
    [k: string]: any;
  };

  const events: TEvent[] = [
    ...(customer.conversation?.messages || []).map((m) => ({
      kind: "message" as const,
      id: m.id,
      at: m.createdAt.toISOString(),
      role: m.role,
      content: m.content,
    })),
    ...orders.map((o: any) => ({
      kind: "order" as const,
      id: o.id,
      at: new Date(o.createdAt).toISOString(),
      status: o.status,
      total: o.total || 0,
      currency: o.currency || "ج",
      items: o.items || [],
    })),
    ...broadcastItems
      .filter((b) => b.sentAt)
      .map((b) => ({
        kind: "broadcast" as const,
        id: b.id,
        at: b.sentAt!.toISOString(),
        broadcastName: b.broadcast.title,
        status: b.status,
      })),
    ...knowledgeGaps.map((g) => ({
      kind: "ai_gap" as const,
      id: g.id,
      at: g.createdAt.toISOString(),
      prompt: g.question,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div>
      <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
        <ArrowRight className="w-4 h-4" />
        رجوع للعملاء
      </Link>

      <div className="card p-5 mb-4 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/15 text-xl font-semibold text-brand-200">
          {(customer.name || customer.phone)[0]?.toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="text-xl font-semibold">{customer.name || "بدون اسم"}</div>
          <div className="text-sm text-slate-400 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            {(() => {
              const p = formatCustomerPhone(customer.phone);
              return p.isLid ? (
                <span className="text-slate-500 italic" title={p.raw}>{p.display}</span>
              ) : (
                <bdi dir="ltr" className="font-mono">{p.display}</bdi>
              );
            })()}
          </div>
        </div>
        <div className="text-sm text-slate-500 text-left flex flex-col items-end gap-1">
          <div>{customer.conversation?.messages.length || 0} رسالة</div>
          <MergeCustomerButton customerId={customer.id} customerName={customer.name} customerPhone={customer.phone} />
          <DeleteCustomerButton customerId={customer.id} />
        </div>
      </div>

      <CustomerTabs
        events={JSON.parse(JSON.stringify(events))}
        chatView={
          <ChatView
            customerId={customer.id}
            initialMessages={JSON.parse(JSON.stringify(customer.conversation?.messages || []))}
          />
        }
      />
    </div>
  );
}
