import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import InsightStrip from "@/components/insight-strip";
import {
  ShoppingBag,
  ArrowUpRight,
} from "lucide-react";
import {
  OrderStatusPill,
  type OrderStatus,
} from "@/components/ui/order-status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";

function toOrderStatus(s: string): OrderStatus {
  if (s === "canceled") return "cancelled";
  if (
    s === "pending" ||
    s === "confirmed" ||
    s === "shipped" ||
    s === "delivered" ||
    s === "refunded"
  )
    return s;
  return "pending";
}

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  confirmed: "مؤكد",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  canceled: "ملغي",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const status = searchParams?.status;
  const where: any = { userId: user.id };
  if (status) where.status = status;

  const [orders, counts, revenueAgg] = await Promise.all([
    (prisma as any).order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true },
    }),
    (prisma as any).order.groupBy({
      by: ["status"],
      where: { userId: user.id },
      _count: { _all: true },
    }),
    (prisma as any).order.aggregate({
      where: {
        userId: user.id,
        status: { in: ["confirmed", "shipped", "delivered"] },
      },
      _sum: { total: true },
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  for (const row of counts) countByStatus[row.status] = row._count._all;

  const revenue = revenueAgg._sum?.total || 0;
  const totalOrders = Object.values(countByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {/* Header — clean summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">الطلبات</h1>
          <p className="page-desc mt-1">
            {totalOrders.toLocaleString()} طلب · {(revenue / 100).toLocaleString()} ج إيرادات مؤكدة
          </p>
        </div>
      </div>

      {/* Status summary strip — replaces KPI cards */}
      <div className="flex flex-wrap gap-1.5">
        <FilterTab href="/dashboard/orders" current={!status} label="الكل" count={totalOrders} />
        {Object.keys(STATUS_LABELS).map((s) => (
          <FilterTab
            key={s}
            href={`/dashboard/orders?status=${s}`}
            current={status === s}
            label={STATUS_LABELS[s]}
            count={countByStatus[s] || 0}
            palette={s === "canceled" ? "text-rose-400" : s === "delivered" ? "text-emerald-400" : s === "pending" ? "text-amber-400" : undefined}
          />
        ))}
      </div>

      <InsightStrip context="orders" />

      {/* Desktop table */}
      <div className="card overflow-hidden">
        <div className="hidden sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[35%]">العميل</th>
                <th className="w-[25%]">المنتج</th>
                <th className="w-[15%] text-end">الإجمالي</th>
                <th className="w-[15%] text-center">الحالة</th>
                <th className="w-[10%]"></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    <EmptyState
                      icon={<ShoppingBag className="h-full w-full" />}
                      title="لا توجد طلبات حتى الآن"
                      description="أول ما البوت يتعرّف على طلب في محادثة، هيظهر هنا."
                      size="sm"
                    />
                  </td>
                </tr>
              ) : (
                orders.map((o: any) => {
                  const firstItem = o.items?.[0];
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="min-w-0">
                          <Link href={`/dashboard/orders/${o.id}`} className="text-sm font-medium text-white transition-colors hover:text-brand-300">
                            {o.customerName || "—"}
                          </Link>
                          {(() => {
                            const p = formatCustomerPhone(o.customerPhone || "");
                            if (!p.raw) return null;
                            return (
                              <div className="text-[11px] text-slate-500 font-mono" dir="ltr">
                                {p.display}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm text-slate-300 truncate max-w-[200px]">
                          {firstItem?.name || "—"}
                        </div>
                        {firstItem?.quantity > 1 && (
                          <div className="text-[11px] text-slate-500">×{firstItem.quantity}</div>
                        )}
                      </td>
                      <td className="text-end">
                        <div className="text-sm font-semibold tabular-nums text-white">
                          {(o.total || 0).toLocaleString()} {o.currency || "ج"}
                        </div>
                        <div className={`text-[10px] tabular-nums ${o.aiConfidence >= 70 ? "text-emerald-500" : o.aiConfidence >= 40 ? "text-amber-500" : "text-slate-500"}`}>
                          {o.aiConfidence || 0}% ثقة
                        </div>
                      </td>
                      <td className="text-center">
                        <OrderStatusPill status={toOrderStatus(o.status)} size="sm" />
                      </td>
                      <td className="text-start">
                        <Link
                          href={`/dashboard/orders/${o.id}`}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-white"
                        >
                          فتح <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-white/[0.04] sm:hidden">
          {orders.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ShoppingBag className="h-full w-full" />}
                title="لا توجد طلبات حتى الآن"
                description="أول ما البوت يتعرّف على طلب في محادثة، هيظهر هنا."
                size="sm"
              />
            </div>
          ) : (
            orders.map((o: any) => {
              const firstItem = o.items?.[0];
              return (
                <Link
                  key={o.id}
                  href={`/dashboard/orders/${o.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{o.customerName || "—"}</span>
                      <OrderStatusPill status={toOrderStatus(o.status)} size="sm" />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>{firstItem?.name || "—"}</span>
                      <span>·</span>
                      <span className="tabular-nums">{(o.total || 0).toLocaleString()} {o.currency || "ج"}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 mt-1" />
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function FilterTab({
  href, current, label, count, palette,
}: {
  href: string; current: boolean; label: string; count: number; palette?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        current
          ? "bg-white/[0.07] border-white/[0.12] text-white"
          : "border-white/[0.06] text-slate-400 hover:border-white/[0.1] hover:text-slate-200"
      }`}
    >
      {label}
      <span className={`tabular-nums ${palette || "text-slate-500"}`}>{count}</span>
    </Link>
  );
}
