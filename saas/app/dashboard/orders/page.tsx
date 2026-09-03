import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  ShoppingBag,
  ArrowUpRight,
  Download,
  Package,
} from "lucide-react";
import {
  OrderStatusPill,
  type OrderStatus,
} from "@/components/ui/order-status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricBand, Metric } from "@/components/ui/metric-band";
import { formatCustomerPhone } from "@/lib/phone";
import { LimelightTabs } from "@/components/ui/limelight-tabs";
import { PageHeader, HeaderFact } from "@/components/patterns/page-header";

function toOrderStatus(s: string): OrderStatus {
  if (s === "canceled") return "cancelled";
  // Recognise every status the order-actions dropdown can set (was: only 5).
  const known = [
    "pending", "confirmed", "preparing", "packed", "shipped",
    "out_for_delivery", "delivered", "returned", "refunded", "cancelled",
  ];
  return known.includes(s) ? (s as OrderStatus) : "pending";
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
  searchParams?: { status?: string; page?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const PAGE_SIZE = 100;
  const status = searchParams?.status;
  const page = Math.max(1, parseInt(searchParams?.page || "1", 10) || 1);
  const where: any = { userId: user.id };
  if (status) where.status = status;

  const [orders, counts, revenueAgg, filteredCount] = await Promise.all([
    (prisma as any).order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        total: true,
        currency: true,
        aiConfidence: true,
        status: true,
        items: { select: { name: true, quantity: true }, take: 1 },
      },
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
    (prisma as any).order.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const pageHref = (p: number) => `/dashboard/orders?${status ? `status=${status}&` : ""}page=${p}`;

  const countByStatus: Record<string, number> = {};
  for (const row of counts) countByStatus[row.status] = row._count._all;

  const revenue = revenueAgg._sum?.total || 0;
  const totalOrders = Object.values(countByStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="المبيعات"
        title="الطلبات"
        description="كل طلب استخرجه المساعد من محادثة — من أول ما يتأكد لحد ما يوصل العميل."
        meta={
          totalOrders > 0
            ? [
                <HeaderFact key="t" value={totalOrders.toLocaleString("ar-EG")} label="طلب" />,
                (countByStatus["pending"] || 0) > 0 ? (
                  <HeaderFact key="p" value={countByStatus["pending"]} label="بانتظار المراجعة" tone="warning" />
                ) : null,
              ]
            : undefined
        }
        secondary={
          totalOrders > 0 ? (
            <a
              href="/api/export?type=orders&format=csv"
              download
              className="btn-ghost h-9 text-[13px] inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              تصدير CSV
            </a>
          ) : undefined
        }
      />

      {/* Revenue anchors the page; the operational counts stay secondary.
          Evidence: the orders screenshot led with five equal-weight status
          pills and no money at all, so the page never answered "how much
          did we actually make?" — the first question a merchant asks. */}
      {totalOrders > 0 && (
        <MetricBand cols={4}>
          <Metric
            anchor
            label="إيراد مؤكد"
            value={`${revenue.toLocaleString("ar-EG")} ج.م`}
            tone="positive"
            hint="من الطلبات المؤكدة والمشحونة والمسلَّمة"
          />
          <Metric label="تم التسليم" value={countByStatus["delivered"] || 0} />
          <Metric
            label="بانتظار المراجعة"
            value={countByStatus["pending"] || 0}
            tone={(countByStatus["pending"] || 0) > 0 ? "warning" : "default"}
            hint={(countByStatus["pending"] || 0) > 0 ? "تحتاج تأكيد قبل الشحن" : undefined}
          />
        </MetricBand>
      )}

      {totalOrders === 0 ? (
        <EmptyState
          variant="page"
          icon={<ShoppingBag className="h-full w-full" />}
          title="لسه ما فيش طلبات"
          description="المساعد يقرأ المحادثة ويستخرج الطلب لوحده — المنتج والكمية والعنوان وطريقة الدفع — ويحطه هنا جاهز للمراجعة. مفيش إدخال يدوي."
          hint="الطلب يظهر هنا أول ما المساعد يتأكد منه. لو الكتالوج فاضي، هيفضل يسأل بدل ما يستخرج."
          action={
            <Link href="/dashboard/products" className="btn-primary px-4 py-2 text-sm">
              <Package className="h-4 w-4" /> جهّز الكتالوج
            </Link>
          }
          secondaryAction={
            <Link href="/dashboard/settings/order-settings" className="btn-ghost px-4 py-2 text-sm">
              إعدادات استخراج الطلبات
            </Link>
          }
          steps={[
            { title: "أضف منتجاتك", body: "المساعد لا يستخرج طلباً لمنتج لا يعرفه." },
            { title: "اربط واتساب", body: "الطلبات تُستخرج من المحادثات الواردة." },
            { title: "راجع وأكّد", body: "كل طلب يظهر هنا بدرجة ثقة قبل الشحن." },
          ]}
        />
      ) : (
      <>
      {/* Status filter — limelight sliding indicator */}
      <LimelightTabs
        activeKey={status || "all"}
        tabs={[
          { key: "all", label: "الكل", href: "/dashboard/orders", count: totalOrders },
          ...Object.keys(STATUS_LABELS).map((s) => ({
            key: s,
            label: STATUS_LABELS[s],
            href: `/dashboard/orders?status=${s}`,
            count: countByStatus[s] || 0,
            countClass: s === "canceled" ? "text-rose-400" : s === "delivered" ? "text-emerald-400" : s === "pending" ? "text-amber-400" : undefined,
          })),
        ]}
      />

      {/* Desktop table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] mobile-scroll-x">
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
                      title="لا توجد طلبات بهذه الحالة"
                      description="جرّب حالة أخرى من الشريط بالأعلى."
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
                        <div className={`text-[10px] ${(o.aiConfidence || 0) >= 70 ? "text-emerald-500" : (o.aiConfidence || 0) >= 40 ? "text-amber-500" : "text-slate-500"}`}>
                          {(o.aiConfidence || 0) >= 70 ? "استخراج دقيق" : (o.aiConfidence || 0) >= 40 ? "استخراج جزئي" : "يحتاج مراجعة"}
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
        <div className="divide-y divide-white/[0.04] md:hidden">
          {orders.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ShoppingBag className="h-full w-full" />}
                title="لا توجد طلبات بهذه الحالة"
                description="جرّب حالة أخرى من الشريط بالأعلى."
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
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-[13px]">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-ghost h-8">السابق</Link>
          ) : (
            <span className="h-8" />
          )}
          <span className="text-slate-400">صفحة {page.toLocaleString("ar-EG")} من {totalPages.toLocaleString("ar-EG")}</span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="btn-ghost h-8">التالي</Link>
          ) : (
            <span className="h-8" />
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
