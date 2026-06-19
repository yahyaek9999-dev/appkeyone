import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminProtectionLogsPage({ searchParams }: { searchParams?: { kind?: string; page?: string } }) {
  const kind = searchParams?.kind;
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 100;
  const skip = (page - 1) * take;

  const where: any = {};
  const countWhere: any = {};
  if (kind) { where.kind = kind; countWhere.kind = kind; }

  const [logs, total, banEvents] = await Promise.all([
    (prisma as any).protectionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }) || Promise.resolve([]),
    (prisma as any).protectionLog.count({ where: countWhere }) || Promise.resolve(0),
    (prisma as any).banEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }) || Promise.resolve([]),
  ]);

  const SEVERITY_COLORS: Record<string, string> = {
    info: "bg-slate-500/15 text-slate-300",
    warn: "bg-amber-500/15 text-amber-300",
    critical: "bg-rose-500/15 text-rose-300",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">سجل الحماية</h1>
        <p className="page-desc">أحداث الحماية من الحظر والحسابات المحظورة.</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterTab href="/admin/protection-logs" current={!kind}>الكل</FilterTab>
        {["flood", "spam", "abuse", "loop", "suspicious", "ban", "unban"].map((k) => (
          <FilterTab key={k} href={`/admin/protection-logs?kind=${k}`} current={kind === k}>{k}</FilterTab>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">سجل الحماية (آخر {take})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">النوع</th>
                <th className="text-right p-3">الإجراء</th>
                <th className="text-right p-3">الخطورة</th>
                <th className="text-right p-3">السبب</th>
                <th className="text-right p-3">الهاتف</th>
                <th className="text-right p-3">النقاط</th>
                <th className="text-right p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map((l: any) => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="p-3 font-mono text-xs">{l.kind}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[l.severity] || "bg-slate-500/15 text-slate-300"}`}>
                      {l.severity}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-400 max-w-[200px] truncate">{l.reason || "—"}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{l.phone || "—"}</td>
                  <td className="p-3">{l.score ?? 0}</td>
                  <td className="p-3 text-xs text-slate-400">{new Date(l.createdAt).toLocaleString("ar-EG")}</td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد أحداث.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">أحداث الحظر (آخر 20)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">السبب</th>
                <th className="text-right p-3">الخطورة</th>
                <th className="text-right p-3">الهاتف</th>
                <th className="text-right p-3">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody>
              {(banEvents || []).map((b: any) => (
                <tr key={b.id} className="border-t border-white/5">
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${b.status === "active" ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                      {b.status === "active" ? "محظور" : "مرفوع"}
                    </span>
                  </td>
                  <td className="p-3 text-xs max-w-[200px] truncate">{b.reason}</td>
                  <td className="p-3">{b.severity}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{b.phone || "—"}</td>
                  <td className="p-3 text-xs text-slate-400">{new Date(b.createdAt).toLocaleString("ar-EG")}</td>
                </tr>
              ))}
              {(!banEvents || banEvents.length === 0) && <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد أحداث حظر.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {total > take && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <div>الصفحة {page} من {Math.ceil(total / take)}</div>
          <div className="flex gap-2">
            {page > 1 && <a className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/protection-logs?page=${page - 1}${kind ? `&kind=${kind}` : ""}`}>السابق</a>}
            {page * take < total && <a className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/protection-logs?page=${page + 1}${kind ? `&kind=${kind}` : ""}`}>التالي</a>}
          </div>
        </div>
      )}
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
