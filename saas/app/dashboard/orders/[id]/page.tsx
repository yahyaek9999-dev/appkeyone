import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ArrowRight } from "lucide-react";
import OrderActions from "./order-actions";
import { Avatar } from "@/components/ui/avatar";
import { OrderStatusPill, type OrderStatus } from "@/components/ui/order-status-pill";
import { formatCustomerPhone } from "@/lib/phone";

function toOrderStatus(s: string): OrderStatus {
  if (s === "canceled") return "cancelled";
  if (s === "pending" || s === "confirmed" || s === "shipped" || s === "delivered" || s === "refunded") return s;
  return "pending";
}

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/orders" className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <ArrowRight className="w-4 h-4" />
          الرجوع للقائمة
        </Link>
        <div className="text-xs text-slate-500">
          أُنشئ في {new Date(order.createdAt).toLocaleString("ar-EG")}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          <Card title={`الطلب #${order.id.slice(-6).toUpperCase()}`}>
            <div className="mb-4">
              <OrderStatusPill status={toOrderStatus(order.status)} size="md" />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="ثقة الاستخراج" value={`${order.aiConfidence || 0}%`} />
              <Field label="الإجمالي" value={`${(order.total || 0).toLocaleString()} ${order.currency || "EGP"}`} />
              <Field label="طريقة الدفع" value={order.paymentMethod || "—"} />
              <Field label="الشحن" value={`${(order.shipping || 0).toLocaleString()}`} />
              <Field label="الخصم" value={`${(order.discount || 0).toLocaleString()}`} />
            </div>
            {order.aiNotes && (
              <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-200 text-xs">
                {order.aiNotes}
              </div>
            )}
          </Card>

          <Card title="المنتجات">
            <div className="space-y-2">
              {order.items?.length ? order.items.map((it: any) => (
                <div key={it.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-slate-900/30">
                  <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-slate-500">
                      {it.size && `مقاس ${it.size}`}
                      {it.color && ` · ${it.color}`}
                      {it.quantity > 1 && ` · ×${it.quantity}`}
                    </div>
                  </div>
                  <div className="tabular-nums text-sm">
                    {(it.lineTotal || it.unitPrice * it.quantity).toLocaleString()} {order.currency || "EGP"}
                  </div>
                </div>
              )) : <div className="text-sm text-slate-500">لا توجد منتجات.</div>}
            </div>
          </Card>

          <Card title="السجل">
            <div className="space-y-2 text-sm">
              {order.timeline?.length ? order.timeline.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3">
                  <span className="mt-1 inline-block w-2 h-2 rounded-full bg-brand-400 shrink-0"></span>
                  <div className="flex-1">
                    <div>{t.message || t.kind}</div>
                    <div className="text-xs text-slate-500">{new Date(t.createdAt).toLocaleString("ar-EG")}</div>
                  </div>
                </div>
              )) : <div className="text-slate-500">لا يوجد سجل بعد.</div>}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card title="العميل">
            <div className="flex items-center gap-3">
              <Avatar
                name={order.customerName || order.customer?.name || order.customerPhone || "?"}
                size="lg"
              />
              <div className="space-y-1 text-sm min-w-0">
                <div className="font-medium truncate">{order.customerName || order.customer?.name || "—"}</div>
                {(() => {
                  const p = formatCustomerPhone(order.customerPhone || order.customer?.phone || "");
                  if (!p.raw) return null;
                  return p.isLid ? (
                    <div className="text-slate-500 italic text-xs" title={p.raw}>{p.display}</div>
                  ) : (
                    <bdi dir="ltr" className="text-slate-400 tabular-nums">{p.display}</bdi>
                  );
                })()}
              </div>
            </div>
            {order.shippingAddress && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900/40 border border-white/5 text-xs text-slate-300 leading-relaxed">
                {order.shippingAddress}
              </div>
            )}
          </Card>

          <Card title="الإجراءات">
            <OrderActions orderId={order.id} status={order.status} fulfillmentStatus={order.fulfillmentStatus} trackingCode={order.trackingCode || ""} courierName={order.courierName || ""} trackingUrl={order.trackingUrl || ""} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5">
      <h3 className="text-sm font-semibold mb-4 text-slate-300">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
