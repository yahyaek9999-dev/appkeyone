import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ArrowRight, ArrowUpRight, AlertCircle, Package, Clock, MessageSquare } from "lucide-react";
import OrderActions from "./order-actions";
import { Avatar } from "@/components/ui/avatar";
import { OrderStatusPill, type OrderStatus } from "@/components/ui/order-status-pill";
import { formatCustomerPhone } from "@/lib/phone";

function toOrderStatus(s: string): OrderStatus {
  if (s === "canceled") return "cancelled";
  const known = [
    "pending", "confirmed", "preparing", "packed", "shipped",
    "out_for_delivery", "delivered", "returned", "refunded", "cancelled",
  ];
  return known.includes(s) ? (s as OrderStatus) : "pending";
}

const STATUS_BANNER: Record<string, { text: string; sub: string; color: string; icon: any } | null> = {
  pending: {
    text: "طلب معلّق — يحتاج تأكيداً",
    sub: "لم يتم تأكيد هذا الطلب بعد",
    color: "border-amber-500/25 bg-amber-500/[0.06] text-amber-200",
    icon: AlertCircle,
  },
  confirmed: {
    text: "تم التأكيد — جاهز للتجهيز",
    sub: "الخطوة التالية: تجهيز الطلب",
    color: "border-sky-500/20 bg-sky-500/[0.05] text-sky-200",
    icon: Package,
  },
  preparing: {
    text: "قيد التجهيز",
    sub: "الطلب في مرحلة التجهيز",
    color: "border-brand-500/20 bg-brand-500/[0.04] text-brand-200",
    icon: Clock,
  },
  shipped: {
    text: "تم الشحن",
    sub: "الطلب في الطريق إلى العميل",
    color: "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-200",
    icon: Package,
  },
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const order: any = await (prisma as any).order.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      items: true,
      timeline: { orderBy: { createdAt: "asc" } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!order) notFound();

  const status = toOrderStatus(order.status);
  const banner = STATUS_BANNER[order.status] || null;
  const BannerIcon = banner?.icon;

  const customerId = order.customer?.id;
  const customerName = order.customerName || order.customer?.name || "—";

  return (
    <div dir="rtl" className="space-y-5">

      {/* Navigation + title */}
      <div className="border-b border-white/[0.05] pb-5">
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          الطلبات
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="page-title">طلب #{order.id.slice(-6).toUpperCase()}</h1>
            <p className="page-desc mt-1">
              أُنشئ {new Date(order.createdAt).toLocaleString("ar-EG")}
            </p>
          </div>
          <OrderStatusPill status={status} size="md" />
        </div>
      </div>

      {/* Status-aware action banner */}
      {banner && BannerIcon && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${banner.color}`}>
          <BannerIcon className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{banner.text}</div>
            <div className="text-[11px] opacity-70 mt-0.5">{banner.sub}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Order summary */}
          <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
            <div className="border-b border-white/[0.05] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-white">تفاصيل الطلب</h3>
            </div>
            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-white/[0.05] sm:grid-cols-4">
              {[
                { label: "الإجمالي", value: `${(order.total || 0).toLocaleString()} ${order.currency || "EGP"}` },
                { label: "الشحن", value: `${(order.shipping || 0).toLocaleString()} ${order.currency || "EGP"}` },
                { label: "الخصم", value: order.discount ? `${order.discount.toLocaleString()} ${order.currency || "EGP"}` : "—" },
                { label: "الدفع", value: order.paymentMethod || "—" },
              ].map((f) => (
                <div key={f.label} className="px-4 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">{f.label}</div>
                  <div className="mt-1.5 text-[15px] font-bold tabular-nums text-white">{f.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Products */}
          <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
            <div className="border-b border-white/[0.05] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-white">المنتجات</h3>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {order.items?.length ? order.items.map((it: any) => (
                <div key={it.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-[13px] font-medium text-white">{it.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {[
                        it.size && `مقاس ${it.size}`,
                        it.color,
                        it.quantity > 1 && `×${it.quantity}`,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="tabular-nums text-[13px] font-medium text-white">
                    {(it.lineTotal || it.unitPrice * it.quantity || 0).toLocaleString()} {order.currency || "EGP"}
                  </div>
                </div>
              )) : (
                <div className="px-4 py-6 text-center text-[13px] text-slate-500">لا توجد منتجات.</div>
              )}
            </div>
          </section>

          {/* Notes (formerly aiNotes) */}
          {order.aiNotes && (
            <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
              <div className="border-b border-white/[0.05] px-4 py-3">
                <h3 className="text-[13px] font-semibold text-white">ملاحظات</h3>
              </div>
              <div className="px-4 py-3 text-[13px] text-slate-300 leading-relaxed">
                {order.aiNotes}
              </div>
            </section>
          )}

          {/* Timeline */}
          <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
            <div className="border-b border-white/[0.05] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-white">سجل الطلب</h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              {order.timeline?.length ? order.timeline.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <div className="flex-1">
                    <div className="text-[13px] text-slate-200">{t.message || t.kind}</div>
                    <div className="text-[11px] text-slate-500">{new Date(t.createdAt).toLocaleString("ar-EG")}</div>
                  </div>
                </div>
              )) : (
                <div className="py-3 text-[13px] text-slate-500">لا يوجد سجل بعد.</div>
              )}
            </div>
          </section>

        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* Customer */}
          <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
            <div className="border-b border-white/[0.05] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-white">العميل</h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar
                  name={customerName}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  {customerId ? (
                    <Link
                      href={`/dashboard/customers/${customerId}`}
                      className="inline-flex items-center gap-1 text-[14px] font-semibold text-white hover:text-brand-300 transition-colors"
                    >
                      {customerName}
                      <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
                    </Link>
                  ) : (
                    <div className="text-[14px] font-semibold text-white">{customerName}</div>
                  )}
                  {(() => {
                    const p = formatCustomerPhone(order.customerPhone || order.customer?.phone || "");
                    if (!p.raw) return null;
                    return p.isLid ? (
                      <div className="text-[11px] text-slate-600 italic">{p.display}</div>
                    ) : (
                      <bdi dir="ltr" className="text-[11px] font-mono text-slate-400">{p.display}</bdi>
                    );
                  })()}
                </div>
              </div>

              {/* Customer workspace links */}
              {customerId && (
                <div className="flex gap-2">
                  <Link
                    href={`/dashboard/customers/${customerId}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    الملف الشخصي <ArrowUpRight className="h-3 w-3" />
                  </Link>
                  <Link
                    href={`/dashboard/inbox?c=${customerId}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    المحادثة <MessageSquare className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {/* Shipping address */}
              {order.shippingAddress && (
                <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-400 leading-relaxed">
                  {order.shippingAddress}
                </div>
              )}
            </div>
          </section>

          {/* Actions */}
          <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
            <div className="border-b border-white/[0.05] px-4 py-3">
              <h3 className="text-[13px] font-semibold text-white">الإجراءات</h3>
            </div>
            <div className="px-4 py-3">
              <OrderActions
                orderId={order.id}
                status={order.status}
                fulfillmentStatus={order.fulfillmentStatus}
                trackingCode={order.trackingCode || ""}
                courierName={order.courierName || ""}
                trackingUrl={order.trackingUrl || ""}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
