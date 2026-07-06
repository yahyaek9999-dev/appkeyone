import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage({ searchParams }: { searchParams?: { q?: string; page?: string } }) {
  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 50;
  const skip = (page - 1) * take;

  const where: any = {};
  if (q) where.OR = [{ name: { contains: q } }, { phone: { contains: q } }];

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip,
      take,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">عملاء المنصة</h1>
        <p className="page-desc">إجمالي: {total} عميل</p>
      </div>

      <form className="flex gap-2" method="GET">
        <input
          name="q" defaultValue={q}
          placeholder="ابحث بالاسم أو الهاتف..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
        />
        <button className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm font-bold">بحث</button>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">الاسم</th>
                <th className="text-right p-3">الهاتف</th>
                <th className="text-right p-3">التاجر</th>
                <th className="text-right p-3">النقاط</th>
                <th className="text-right p-3">النية</th>
                <th className="text-right p-3">آخر نشاط</th>
                <th className="text-right p-3">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c: any) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 font-medium">{c.name || "—"}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{c.phone}</td>
                  <td className="p-3 text-xs">{c.user?.name || c.user?.email || "—"}</td>
                  <td className="p-3">{c.leadScore ?? 0}</td>
                  <td className="p-3">{c.lastIntent || "—"}</td>
                  <td className="p-3 text-xs text-slate-400">{c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString("ar-EG") : "—"}</td>
                  <td className="p-3 text-xs text-slate-400">{new Date(c.createdAt).toLocaleString("ar-EG")}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا يوجد عملاء.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <div>الصفحة {page} من {Math.ceil(total / take)}</div>
        <div className="flex gap-2">
          {page > 1 && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/customers?page=${page - 1}${q ? `&q=${q}` : ""}`}>السابق</Link>}
          {skip + take < total && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/customers?page=${page + 1}${q ? `&q=${q}` : ""}`}>التالي</Link>}
        </div>
      </div>
    </div>
  );
}
