import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  ShoppingBag,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
  Inbox,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  OrderStatusPill,
  type OrderStatus,
} from "@/components/ui/order-status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";

function toOrderStatus(s: string): OrderStatus {
  // KEYONE DB uses single-l "canceled"; component expects "cancelled".
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
  const pendingCount = countByStatus.pending || 0;
  const confirmedCount =
    (countByStatus.confirmed || 0) +
    (countByStatus.shipped || 0) +
    (countByStatus.delivered || 0);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-brand-400" />
            الطلبات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            طلبات تم استخراجها تلقائياً من محادثات العملاء.
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          icon={Clock}
          label="قيد المراجعة"
          value={pendingCount}
          tone="amber"
        />
        <Kpi
          icon={CheckCircle2}
          label="مؤكدة"
          value={confirmedCount}
          tone="emerald"
        />
        <Kpi
          icon={Truck}
          label="تم الشحن"
          value={countByStatus.shipped || 0}
          tone="indigo"
        />
        <Kpi
          icon={AlertTriangle}
          label="إيرادات مؤكدة"
          value={`${revenue.toLocaleString()} ج`}
          tone="sky"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 text-sm">
        <FilterTab href="/dashboard/orders" current={!status}>
          الكل
        </FilterTab>
        {Object.keys(STATUS_LABELS).map((s) => (
          <FilterTab
            key={s}
            href={`/dashboard/orders?status=${s}`}
            current={status === s}
          >
            {STATUS_LABELS[s]} ({countByStatus[s] || 0})
          </FilterTab>
        ))}
      </div>

      {/* Mobile cards: avoids horizontal table scrolling on low-width devices. */}
      <div className="space-y-3 md:hidden">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-2">
            <EmptyState
              icon={<Inbox className="w-full h-full" />}
              title="لا توجد طلبات حتى الآن"
              description="أول ما البوت يتعرّف على طلب في محادثة، هيظهر هنا."
              size="md"
            />
          </div>
        ) : (
          orders.map((o: any) => {
            const firstItem = o.items?.[0];
            return (
              <Link
                key={o.id}
                href={`/dashboard/orders/${o.id}`}
                className="block rounded-2xl border border-white/5 bg-slate-900/40 p-4 transition hover:border-brand-500/30 hover:bg-slate-900/70"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={o.customerName || o.customerPhone || "?"}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {o.customerName || "—"}
                      </div>
                      {(() => {
                        const p = formatCustomerPhone(o.customerPhone || "");
                        if (!p.raw) return null;
                        return p.isLid ? (
                          <div
                            className="truncate text-xs italic text-slate-500"
                            title={p.raw}
                          >
                            {p.display}
                          </div>
                        ) : (
                          <bdi
                            dir="ltr"
                            className="block truncate text-xs font-mono text-slate-500"
                          >
                            {p.display}
                          </bdi>
                        );
                      })()}
                    </div>
                  </div>
                  <OrderStatusPill status={toOrderStatus(o.status)} size="sm" />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">المنتج</span>
                    <span className="min-w-0 truncate text-left">
                      {firstItem?.name || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">الإجمالي</span>
                    <span className="tabular-nums">
                      {(o.total || 0).toLocaleString()} {o.currency || "EGP"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">الثقة</span>
                    <ConfidencePill value={o.aiConfidence || 0} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>التاريخ</span>
                    <span className="tabular-nums">
                      {new Date(o.createdAt).toLocaleString("ar-EG")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Desktop/tablet table */}
      <div className="hidden rounded-2xl border border-white/5 bg-slate-900/40 md:block md:overflow-hidden">
        <div className="mobile-scroll-x">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-900/60 text-slate-400">
              <tr>
                <th className="text-right p-3">العميل</th>
                <th className="text-right p-3">المنتج</th>
                <th className="text-right p-3">الإجمالي</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">الثقة</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={<Inbox className="w-full h-full" />}
                      title="لا توجد طلبات حتى الآن"
                      description="أول ما البوت يتعرّف على طلب في محادثة، هيظهر هنا."
                      size="md"
                    />
                  </td>
                </tr>
              )}
              {orders.map((o: any) => {
                const firstItem = o.items?.[0];
                return (
                  <tr
                    key={o.id}
                    className="border-t border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={o.customerName || o.customerPhone || "?"}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {o.customerName || "—"}
                          </div>
                          {(() => {
                            const p = formatCustomerPhone(
                              o.customerPhone || "",
                            );
                            if (!p.raw) return null;
                            return p.isLid ? (
                              <div
                                className="text-xs text-slate-500 italic"
                                title={p.raw}
                              >
                                {p.display}
                              </div>
                            ) : (
                              <bdi
                                dir="ltr"
                                className="text-xs text-slate-500 font-mono block"
                              >
                                {p.display}
                              </bdi>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="truncate max-w-[220px]">
                        {firstItem?.name || "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {firstItem?.size && `مقاس ${firstItem.size}`}
                        {firstItem?.color && ` · ${firstItem.color}`}
                        {firstItem?.quantity > 1 && ` · ×${firstItem.quantity}`}
                      </div>
                    </td>
                    <td className="p-3 tabular-nums">
                      {(o.total || 0).toLocaleString()} {o.currency || "EGP"}
                    </td>
                    <td className="p-3">
                      <OrderStatusPill
                        status={toOrderStatus(o.status)}
                        size="sm"
                      />
                    </td>
                    <td className="p-3">
                      <ConfidencePill value={o.aiConfidence || 0} />
                    </td>
                    <td className="p-3 text-xs text-slate-400 tabular-nums">
                      {new Date(o.createdAt).toLocaleString("ar-EG")}
                    </td>
                    <td className="p-3 text-left">
                      <Link
                        href={`/dashboard/orders/${o.id}`}
                        className="px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-brand-300 hover:bg-brand-500/20 text-xs"
                      >
                        فتح
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: any;
  tone: string;
}) {
  const toneClass: Record<string, string> = {
    amber:
      "from-amber-500/10 to-amber-500/0 border-amber-500/30 text-amber-200",
    emerald:
      "from-emerald-500/10 to-emerald-500/0 border-emerald-500/30 text-emerald-200",
    indigo:
      "from-indigo-500/10 to-indigo-500/0 border-indigo-500/30 text-indigo-200",
    sky: "from-sky-500/10 to-sky-500/0 border-sky-500/30 text-sky-200",
  };
  return (
    <div
      className={`p-4 rounded-2xl border bg-gradient-to-bl ${toneClass[tone]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs opacity-80">{label}</span>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function FilterTab({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full border text-xs ${
        current
          ? "bg-brand-500/15 border-brand-500/40 text-brand-200"
          : "bg-slate-900/40 border-white/5 text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const tone =
    value >= 70
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : value >= 40
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs border tabular-nums ${tone}`}
    >
      {value}%
    </span>
  );
}
