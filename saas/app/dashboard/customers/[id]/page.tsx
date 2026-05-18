import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Phone, Trash2 } from "lucide-react";
import ChatView from "./chat-view";
import { formatCustomerPhone } from "@/lib/phone";
import DeleteCustomerButton from "./delete-button";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      conversation: {
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!customer || customer.userId !== user.id) notFound();

  return (
    <div>
      <Link href="/dashboard/customers" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
        <ArrowRight className="w-4 h-4" />
        رجوع للعملاء
      </Link>

      <div className="card p-5 mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-400 to-emerald-600 flex items-center justify-center font-bold text-xl">
          {(customer.name || customer.phone)[0]?.toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">{customer.name || "بدون اسم"}</div>
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
          <DeleteCustomerButton customerId={customer.id} />
        </div>
      </div>

      <ChatView
        customerId={customer.id}
        initialMessages={JSON.parse(JSON.stringify(customer.conversation?.messages || []))}
      />
    </div>
  );
}
