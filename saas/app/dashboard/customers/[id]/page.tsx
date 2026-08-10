import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Phone, ShoppingBag, MessageSquare, Calendar, TrendingUp, ArrowUpRight, Send, Package } from "lucide-react";
import ChatView from "./chat-view";
import CustomerTabs from "./customer-tabs";
import CopyPhoneButton from "./copy-phone-button";
import { formatCustomerPhone } from "@/lib/phone";
import DeleteCustomerButton from "./delete-button";
import MergeCustomerButton from "./merge-button";
import { timeAgo } from "@/lib/utils";
import { OrderStatusPill, type OrderStatus } from "@/components/ui/order-status-pill";

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

  // ── Derived customer value metrics ────────────────────────────────────────
  const completedOrders = (orders as any[]).filter((o) => o.status === "delivered");
  const totalRevenue = (orders as any[]).reduce((sum, o) => sum + (o.total || 0), 0);
  const msgCount = customer.conversation?.messages.length || 0;
  const lastInteraction = customer.lastSeenAt || customer.createdAt;
  const currency = (orders as any[])[0]?.currency || "ج";
  const orderCount = (orders as any[]).length;

  // Pending orders needing action
  const pendingOrders = (orders as any[]).filter((o) =>
    ["pending", "confirmed", "preparing"].includes(o.status)
  );
  // Days since last contact
  const daysSinceLast = Math.floor(
    (Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Customer stage based on behavior
  const stage = completedOrders.length >= 3
    ? "عميل دائم"
    : completedOrders.length >= 1
    ? "عميل نشط"
    : orderCount > 0
    ? "طلب أول"
    : msgCount > 0
    ? "محادثة فقط"
    : "جديد";

  const stageColor = completedOrders.length >= 3
    ? "text-brand-300 bg-brand-500/10 border-brand-500/20"
    : completedOrders.length >= 1
    ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
    : orderCount > 0
    ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
    : "text-slate-400 bg-white/[0.04] border-white/[0.08]";

  const initials = (customer.name || customer.phone || "؟")[0]?.toUpperCase();
  const phoneInfo = formatCustomerPhone(customer.phone);

  return (
    <div className="space-y-0">

      {/* ── Back navigation ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-200 transition-colors"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العملاء
        </Link>
      </div>

      {/* ── Customer workspace header ────────────────────────────────────── */}
      <div className="border-b border-white/[0.05] pb-6 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-500/10 text-xl font-bold text-brand-200">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[22px] font-bold text-white">{customer.name || "بدون اسم"}</h1>
                <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold ${stageColor}`}>
                  {stage}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {phoneInfo.isLid ? (
                  <span className="italic text-slate-600" title={phoneInfo.raw}>{phoneInfo.display}</span>
                ) : (
                  <>
                    <bdi dir="ltr" className="font-mono text-slate-400">{phoneInfo.display}</bdi>
                    <CopyPhoneButton phone={phoneInfo.raw} />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <MergeCustomerButton customerId={customer.id} customerName={customer.name} customerPhone={customer.phone} />
            <DeleteCustomerButton customerId={customer.id} />
          </div>
        </div>

        {/* Customer value strip */}
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.04] sm:grid-cols-4">
          <div className="bg-canvas-deep px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
              <ShoppingBag className="h-3 w-3" />
              الطلبات
            </div>
            <div className="mt-1.5 text-[22px] font-bold tabular-nums text-white">{orderCount}</div>
            {completedOrders.length > 0 && (
              <div className="text-[10px] text-emerald-400">{completedOrders.length} مُسلَّم</div>
            )}
          </div>
          <div className="bg-canvas-deep px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
              <TrendingUp className="h-3 w-3" />
              الإجمالي
            </div>
            <div className="mt-1.5 text-[22px] font-bold tabular-nums text-white">
              {totalRevenue > 0 ? `${(totalRevenue / 100).toLocaleString("ar-EG")}` : "—"}
            </div>
            {totalRevenue > 0 && <div className="text-[10px] text-slate-600">{currency}</div>}
          </div>
          <div className="bg-canvas-deep px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
              <MessageSquare className="h-3 w-3" />
              الرسائل
            </div>
            <div className="mt-1.5 text-[22px] font-bold tabular-nums text-white">{msgCount}</div>
          </div>
          <div className="bg-canvas-deep px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">
              <Calendar className="h-3 w-3" />
              آخر تفاعل
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-white">
              {timeAgo(lastInteraction)}
            </div>
            <div className="text-[10px] text-slate-600">
              {new Date(lastInteraction).toLocaleDateString("ar-EG")}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recommended next action ─────────────────────────────────────── */}
      {(() => {
        // Compute the single most relevant action
        if (pendingOrders.length > 0) {
          const o = pendingOrders[0];
          const firstItem = o.items?.[0]?.name;
          return (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
              <Package className="h-4 w-4 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1 text-[13px]">
                <span className="text-amber-200 font-medium">طلب معلّق</span>
                {firstItem && <span className="text-amber-300/70 mr-1.5">— {firstItem}</span>}
                {pendingOrders.length > 1 && <span className="text-amber-300/50 mr-1"> و{pendingOrders.length - 1} آخر</span>}
              </div>
              <Link
                href={`/dashboard/orders/${o.id}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
              >
                معالجة الطلب <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          );
        }
        if (daysSinceLast >= 7 && msgCount > 0) {
          return (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] px-4 py-3">
              <MessageSquare className="h-4 w-4 shrink-0 text-sky-400" />
              <div className="min-w-0 flex-1 text-[13px]">
                <span className="text-sky-200 font-medium">لا تواصل منذ {daysSinceLast} يوم</span>
                <span className="text-sky-300/60 mr-1.5">— أرسل رسالة متابعة</span>
              </div>
              <Link
                href={`/dashboard/inbox?c=${customer.id}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 transition-colors"
              >
                فتح المحادثة <Send className="h-3 w-3" />
              </Link>
            </div>
          );
        }
        if (stage === "محادثة فقط") {
          return (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/[0.04] px-4 py-3">
              <ShoppingBag className="h-4 w-4 shrink-0 text-brand-400" />
              <div className="min-w-0 flex-1 text-[13px]">
                <span className="text-brand-200 font-medium">عميل محتمل</span>
                <span className="text-brand-300/60 mr-1.5">— تواصل ولم يطلب بعد</span>
              </div>
              <Link
                href={`/dashboard/inbox?c=${customer.id}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-[11px] font-medium text-brand-200 hover:bg-brand-500/20 transition-colors"
              >
                تواصل معه <Send className="h-3 w-3" />
              </Link>
            </div>
          );
        }
        return null;
      })()}

      {/* ── Pending orders (if any, above tabs) ─────────────────────────── */}
      {pendingOrders.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-xl border border-white/[0.07]">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
            <span className="text-[12px] font-semibold text-white">طلبات تحتاج إجراء</span>
            <Link href="/dashboard/orders?status=pending" className="text-[11px] text-slate-500 hover:text-slate-200 transition-colors">
              كل الطلبات
            </Link>
          </div>
          {pendingOrders.slice(0, 3).map((o: any) => (
            <div key={o.id} className="flex items-center gap-3 border-b border-white/[0.03] px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-white">{o.items?.[0]?.name || "طلب"}</div>
                <div className="text-[11px] text-slate-500">
                  {(o.total / 100 || 0).toLocaleString("ar-EG")} {o.currency || "ج"}
                </div>
              </div>
              <OrderStatusPill status={(o.status === "canceled" ? "cancelled" : o.status) as OrderStatus} size="sm" />
              <Link
                href={`/dashboard/orders/${o.id}`}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                فتح <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── Customer workspace tabs ──────────────────────────────────────── */}
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
