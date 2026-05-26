import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminAiLogsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const page = Math.max(1, Number(searchParams?.page || 1));
  const take = 100;
  const skip = (page - 1) * take;

  const [logs, total] = await Promise.all([
    (prisma as any).providerUsage.findMany({
      orderBy: { lastAt: "desc" },
      skip,
      take,
    }) || Promise.resolve([]),
    (prisma as any).providerUsage.count() || Promise.resolve(0),
  ]);

  const [llmEvents] = await Promise.all([
    (prisma as any).metricEvent.findMany({
      where: { kind: { in: ["llm_call", "llm_fail"] } },
      orderBy: { lastAt: "desc" },
      take: 50,
    }) || Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">سجل الذكاء الاصطناعي</h1>
        <p className="text-slate-400">استخدام مزوّدي LLM واستدعاءات النظام.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">استخدام المزوّدين (آخر {take})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">المزوّد</th>
                <th className="text-right p-3">الموديل</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="text-right p-3">استدعاءات</th>
                <th className="text-right p-3">فاشلة</th>
                <th className="text-right p-3">Tokens (in/out)</th>
                <th className="text-right p-3">متوسط الزمن</th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map((p: any) => {
                const avgMs = p.calls > 0 ? Math.round(p.totalLatencyMs / p.calls) : 0;
                return (
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="p-3 font-mono text-xs">{p.provider}</td>
                    <td className="p-3 text-xs text-slate-400">{p.model || "—"}</td>
                    <td className="p-3 text-xs text-slate-400">{p.day}</td>
                    <td className="p-3">{p.calls.toLocaleString()}</td>
                    <td className={`p-3 ${p.failures > 0 ? "text-rose-300" : ""}`}>{p.failures.toLocaleString()}</td>
                    <td className="p-3 font-mono text-xs">{p.inputTokens.toLocaleString()} / {p.outputTokens.toLocaleString()}</td>
                    <td className="p-3">{avgMs} ms</td>
                  </tr>
                );
              })}
              {(!logs || logs.length === 0) && <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد سجلات.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="border-b border-white/10 p-4 font-bold">أحداث LLM</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr>
                <th className="text-right p-3">النوع</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="text-right p-3">العدد</th>
              </tr>
            </thead>
            <tbody>
              {(llmEvents || []).map((e: any) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="p-3 font-mono text-xs">{e.kind}</td>
                  <td className="p-3 text-xs">{e.day}</td>
                  <td className="p-3">{(e.count || 0).toLocaleString()}</td>
                </tr>
              ))}
              {(!llmEvents || llmEvents.length === 0) && <tr><td colSpan={3} className="p-8 text-center text-slate-400">لا توجد أحداث.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {total > take && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <div>الصفحة {page} من {Math.ceil(total / take)}</div>
          <div className="flex gap-2">
            {page > 1 && <a className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/ai-logs?page=${page - 1}`}>السابق</a>}
            {page * take < total && <a className="px-3 py-1 rounded bg-white/5 hover:bg-white/10" href={`/admin/ai-logs?page=${page + 1}`}>التالي</a>}
          </div>
        </div>
      )}
    </div>
  );
}
