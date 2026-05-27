import { prisma } from "@/lib/db";
import Link from "next/link";
import { OrderStatusUpdater } from "./order-status-updater";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  confirmed: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  preparing: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  shipped: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  delivered: "bg-emerald-600/15 text-emerald-400 border-emerald-600/30",
  canceled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default async function AdminOrdersPage({ searchParams }: { searchParams?: { status?: string; q?: string; page?: string } }) {
  const status = searchParams?.status;
  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 50;
  const skip = (page - 1) * take;

  const where: any = {};
  if (status) where.status = status;
  if (q) where.OR = [{ customerName: { contains: q } }, { customerPhone: { contains: q } }, { externalOrderId: { contains: q } }];

  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { user: { select: { email: true } } } }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }) as any,
  ]);

  const countByStatus: Record<string, number> = {};
  for (const row of counts) countByStatus[row.status] = row._count._all;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">إدارة الطلبات</h1>
        <p className="text-slate-400">إجمالي: {total} طلب</p>
      </div>

      <form className="flex gap-2" method="GET">
        <input name="q" defaultValue={q} placeholder="ابحث باسم العميل أو رقم الطلب..." className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1 max-w-md" />
        <button className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm font-bold">بحث</button>
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterTab href="/admin/orders" current={!status}>الكل ({total})</FilterTab>
        {Object.entries(STATUS_COLORS).map(([s]) => (
          <FilterTab key={s} href={`/admin/orders?status=${s}`} current={status === s}>
            {s} ({countByStatus[s] || 0})
          </FilterTab>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">العميل</th>
                <th className="text-right p-3">التاجر</th>
                <th className="text-right p-3">الإجمالي</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">المصدر</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3">
                    <div className="font-medium">{o.customerName || "—"}</div>
                    <div className="text-xs text-slate-500 font-mono" dir="ltr">{o.customerPhone || ""}</div>
                  </td>
                  <td className="p-3 text-xs">{o.user?.email || "—"}</td>
                  <td className="p-3 tabular-nums">{(o.total || 0).toLocaleString()} {o.currency || "EGP"}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_COLORS[o.status] || "bg-slate-500/15 text-slate-300"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-400">{o.source || "—"}{o.externalSource ? ` (${o.externalSource})` : ""}</td>
                  <td className="p-3 text-xs text-slate-400">{new Date(o.createdAt).toLocaleString("ar-EG")}</td>
                  <td className="p-3">
                    <OrderStatusUpdater orderId={o.id} currentStatus={o.status} />
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد طلبات.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <div>الصفحة {page} من {Math.ceil(total / take)}</div>
        <div className="flex gap-2">
          {page > 1 && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/orders?page=${page - 1}${status ? `&status=${status}` : ""}${q ? `&q=${q}` : ""}`}>السابق</Link>}
          {skip + take < total && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/orders?page=${page + 1}${status ? `&status=${status}` : ""}${q ? `&q=${q}` : ""}`}>التالي</Link>}
        </div>
      </div>
    </div>
  );
}

function FilterTab({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`px-3 py-1.5 rounded-full border text-xs ${current ? "bg-brand-500/15 border-brand-500/40 text-brand-200" : "bg-white/5 border-white/5 text-slate-400 hover:text-slate-200"}`}>
      {children}
    </Link>
  );
}
