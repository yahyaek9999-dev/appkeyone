import { prisma } from "@/lib/db";
import Link from "next/link";
import { ResendQrButton } from "./resend-qr";
import { DisconnectWaButton } from "./disconnect-wa";

export const dynamic = "force-dynamic";

export default async function AdminWhatsappPage(props: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const q = (searchParams?.q || "").trim();
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 50;
  const skip = (page - 1) * take;

  const where: any = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { bot: { select: { whatsappStatus: true, whatsappPhone: true, connectionMode: true } } },
    }) as any,
    prisma.user.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">حالة واتساب</h1>
        <p className="text-slate-400">حالة اتصال واتساب لكل تاجر وإعادة الإرسال.</p>
      </div>

      <form className="flex gap-2" method="GET">
        <input name="q" defaultValue={q} placeholder="ابحث بالبريد أو الاسم..." className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1 max-w-md" />
        <button className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm font-bold">بحث</button>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">التاجر</th>
                <th className="text-right p-3">الوضع</th>
                <th className="text-right p-3">الرقم</th>
                <th className="text-right p-3">طريقة الربط</th>
                <th className="text-right p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => {
                const bot = u.bot;
                const waStatus = bot?.whatsappStatus || "disconnected";
                const statusColor = waStatus === "connected" ? "bg-emerald-500/15 text-emerald-300" : waStatus === "connecting" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300";
                return (
                  <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3">
                      <div className="font-medium">{u.name || u.email}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusColor}`}>{waStatus}</span>
                    </td>
                    <td className="p-3 font-mono text-xs" dir="ltr">{bot?.whatsappPhone || "—"}</td>
                    <td className="p-3 text-xs">{bot?.connectionMode || "qr"}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <ResendQrButton userId={u.id} />
                        <DisconnectWaButton userId={u.id} />
                        {waStatus !== "connected" && (
                          <Link href={`/admin/whatsapp?reconnect=${u.id}`} className="px-2 py-1 rounded bg-amber-500/15 text-amber-200 text-xs hover:bg-amber-500/25 border border-amber-500/30">
                            إعادة ربط
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد نتائج.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <div>إجمالي: {total}</div>
        <div className="flex gap-2">
          {page > 1 && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/whatsapp?page=${page - 1}${q ? `&q=${q}` : ""}`}>السابق</Link>}
          {skip + take < total && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/whatsapp?page=${page + 1}${q ? `&q=${q}` : ""}`}>التالي</Link>}
        </div>
      </div>
    </div>
  );
}
