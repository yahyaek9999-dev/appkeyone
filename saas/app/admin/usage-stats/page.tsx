import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminUsageStatsPage() {
  const safe = async <T,>(run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch {
      return fallback;
    }
  };
  const [snapshots, totalMessages, totalAi, totalBroadcasts] = await Promise.all([
    safe(() => (prisma as any).usageDailySnapshot.findMany({ orderBy: { day: "desc" }, take: 30 }), [] as any[]),
    safe(() => (prisma as any).usageLedger.count({ where: { kind: "messages" } }), 0),
    safe(() => (prisma as any).usageLedger.count({ where: { kind: "ai" } }), 0),
    safe(() => (prisma as any).usageLedger.count({ where: { kind: "broadcast" } }), 0),
  ]);

  const latestSnapshot = (snapshots || [])[0];
  const totalUsage = totalMessages + totalAi + totalBroadcasts;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">إحصائيات الاستخدام</h1>
        <p className="page-desc">إجمالي الاستخدام المسجل على المنصة.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="text-sm text-slate-400">إجمالي الرسائل</div>
          <div className="text-3xl font-bold mt-2">{totalMessages.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="text-sm text-slate-400">إجمالي استدعاءات AI</div>
          <div className="text-3xl font-bold mt-2">{totalAi.toLocaleString()}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="text-sm text-slate-400">إجمالي البث الجماعي</div>
          <div className="text-3xl font-bold mt-2">{totalBroadcasts.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">اللقطات اليومية (آخر 30 يوم)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">التاريخ</th>
                <th className="text-right p-3">الرسائل</th>
                <th className="text-right p-3">AI</th>
                <th className="text-right p-3">البث</th>
                <th className="text-right p-3">المجموع</th>
                <th className="text-right p-3">موثوق</th>
              </tr>
            </thead>
            <tbody>
              {(snapshots || []).map((s: any) => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="p-3 font-mono text-xs">{s.day}</td>
                  <td className="p-3">{(s.messages || 0).toLocaleString()}</td>
                  <td className="p-3">{(s.aiRequests || 0).toLocaleString()}</td>
                  <td className="p-3">{(s.broadcasts || 0).toLocaleString()}</td>
                  <td className="p-3 font-bold">{(s.messages + s.aiRequests + s.broadcasts || 0).toLocaleString()}</td>
                  <td className="p-3">{s.verified ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}</td>
                </tr>
              ))}
              {(!snapshots || snapshots.length === 0) && <tr><td colSpan={6} className="p-8 text-center text-slate-400">لا توجد لقطات بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {latestSnapshot && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="font-bold mb-3">ملخص سريع</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-slate-400">آخر يوم</div>
              <div className="text-xl font-bold">{latestSnapshot.day}</div>
            </div>
            <div>
              <div className="text-slate-400">رسائل ذلك اليوم</div>
              <div className="text-xl font-bold">{(latestSnapshot.messages || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-slate-400">AI ذلك اليوم</div>
              <div className="text-xl font-bold">{(latestSnapshot.aiRequests || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-slate-400">بث ذلك اليوم</div>
              <div className="text-xl font-bold">{(latestSnapshot.broadcasts || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
