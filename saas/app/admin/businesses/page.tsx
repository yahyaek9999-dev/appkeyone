/**
 * Admin: real-time businesses overview.
 *
 * Lightweight view that joins data from existing tables only — no new
 * heavyweight queries. Each row shows the merchant's actual runtime state:
 *   - account & plan / suspended flag
 *   - WhatsApp connection status (QR mode + connected phone)
 *   - Meta Cloud configuration state + last quality rating
 *   - usage counters (msgs / ai / broadcasts) + cap
 *   - last 24h safety audit count
 *
 * Pagination kept simple: 50 rows per page. The query is a single
 * findMany() with selective includes so it stays cheap on hot paths.
 */

import { prisma } from "@/lib/db";
import Link from "next/link";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { SuspendButton } from "./suspend-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminBusinessesPage(props: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams.page || 1));
  const q = (searchParams.q || "").trim();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const where: any = q
    ? { OR: [{ email: { contains: q } }, { name: { contains: q } }, { phone: { contains: q } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        bot: {
          select: {
            whatsappStatus: true,
            whatsappPhone: true,
            connectionMode: true,
            metaPhoneNumberId: true,
            metaQualityRating: true,
            metaVerifiedAt: true,
          } as any,
        },
        subscription: { include: { plan: true } },
      },
    }) as any,
    prisma.user.count({ where }),
  ]);

  // For each user grab cheap aggregates in one round trip.
  const userIds = users.map((u: any) => u.id);
  const [safetyCounts, customerCounts] = await Promise.all([
    (prisma as any).safetyAudit?.groupBy
      ? (prisma as any).safetyAudit.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, createdAt: { gte: since } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.customer.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
  ]);

  const safetyByUser = new Map<string, number>();
  for (const r of safetyCounts) safetyByUser.set(r.userId, r._count._all);
  const customersByUser = new Map<string, number>();
  for (const r of customerCounts) customersByUser.set(r.userId, r._count._all);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">الأعمال (Real-time)</h1>
        <p className="text-slate-400">حالة كل تاجر بأرقام حقيقية — قاعدة بيانات مباشرة.</p>
      </div>

      <form className="flex gap-2" action="/admin/businesses" method="GET">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="ابحث بالبريد / الاسم / الهاتف"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
        />
        <button className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-sm font-bold">بحث</button>
      </form>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-slate-300">
            <tr className="text-right">
              <th className="p-3">العميل</th>
              <th className="p-3">الباقة</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">واتساب</th>
              <th className="p-3">Meta</th>
              <th className="p-3">رسائل (هذا الشهر)</th>
              <th className="p-3">AI</th>
              <th className="p-3">Broadcasts</th>
              <th className="p-3">عملاء</th>
              <th className="p-3">Safety (24س)</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => {
              const sub = u.subscription;
              const plan = sub?.plan;
              const mode = normalizeConnectionMode(u.bot?.connectionMode);
              const waState = u.bot?.whatsappStatus || "—";
              const metaConfigured = !!(u.bot?.metaPhoneNumberId);
              return (
                <tr key={u.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="p-3">
                    <div className="font-bold">
                      <Link href={`/admin/users#${u.id}`} className="hover:text-brand-300">{u.email}</Link>
                    </div>
                    <div className="text-slate-500 text-[10px]">{u.name || "—"} · {u.phone || "—"}</div>
                  </td>
                  <td className="p-3">
                    {plan ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] ${tierColor(plan.tier)}`}>
                        {plan.name} ({plan.tier || "basic"})
                      </span>
                    ) : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="p-3">
                    {u.suspended ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">معلّق</span>
                    ) : sub?.status === "active" ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">نشط</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 text-[10px]">{sub?.status || "بدون اشتراك"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="text-[11px]"><b>{mode === "meta_cloud" ? "Meta" : "QR"}</b> · {waState}</div>
                    <div className="text-slate-500 text-[10px]">{u.bot?.whatsappPhone || "—"}</div>
                  </td>
                  <td className="p-3">
                    {metaConfigured ? (
                      <span className={`text-[11px] ${qualityColor(u.bot?.metaQualityRating)}`}>{u.bot?.metaQualityRating || "—"}</span>
                    ) : (
                      <span className="text-slate-600 text-[11px]">—</span>
                    )}
                  </td>
                  <td className="p-3">{sub ? `${sub.msgsUsed} / ${plan?.monthlyMsgs || "∞"}` : "—"}</td>
                  <td className="p-3">{sub ? `${sub.aiRequestsUsed ?? 0} / ${plan?.aiRequestsMonthly ? plan.aiRequestsMonthly : "∞"}` : "—"}</td>
                  <td className="p-3">{sub ? `${sub.broadcastsUsed ?? 0} / ${plan?.broadcastsMonthly ? plan.broadcastsMonthly : "∞"}` : "—"}</td>
                  <td className="p-3 text-slate-300">{customersByUser.get(u.id) || 0}</td>
                  <td className="p-3">
                    {(safetyByUser.get(u.id) || 0) > 0 ? (
                      <span className="text-amber-300">{safetyByUser.get(u.id)}</span>
                    ) : <span className="text-slate-500">0</span>}
                  </td>
                  <td className="p-3">
                    <SuspendButton userId={u.id} suspended={!!u.suspended} role={u.role} />
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={10} className="p-8 text-center text-slate-500">لا توجد نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-400">
        <div>إجمالي: <b>{total}</b></div>
        <div className="flex gap-2">
          {page > 1 && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/businesses?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>السابق</Link>}
          {users.length === PAGE_SIZE && <Link className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/businesses?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>التالي</Link>}
        </div>
      </div>
    </div>
  );
}

function tierColor(tier?: string): string {
  switch (tier) {
    case "companies": return "bg-gold-500/20 text-gold-300";
    case "max":       return "bg-brand-500/20 text-brand-300";
    case "pro":       return "bg-emerald-500/20 text-emerald-300";
    default:          return "bg-slate-500/20 text-slate-300";
  }
}
function qualityColor(rating?: string | null): string {
  if (rating === "GREEN")  return "text-emerald-300";
  if (rating === "YELLOW") return "text-amber-300";
  if (rating === "RED")    return "text-rose-300";
  return "text-slate-400";
}
