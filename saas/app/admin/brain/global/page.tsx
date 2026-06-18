/** /admin/brain/global — Global Brain (Phase 1). Anonymized cross-tenant patterns. */
import { getGlobalBrainStats } from "@/lib/brain/global";

export const dynamic = "force-dynamic";

export default async function GlobalBrainPage() {
  const s = await getGlobalBrainStats();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">الدماغ العالمي (Global Brain)</h1>
      <p className="page-desc">تعلّم مجهول الهوية من كل المستأجرين — أنماط فقط، بدون أي بيانات عملاء.</p>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Insights" value={s.insights} />
        <Tile label="Patterns" value={s.patterns} />
        <Tile label="Knowledge" value={s.knowledge} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-bold mb-3">أعلى الأنماط (Patterns)</h2>
          {s.topPatterns.length === 0 ? <p className="text-slate-500 text-sm">لا توجد أنماط بعد — شغّل /api/cron/brain-learning.</p> : (
            <table className="w-full text-sm"><tbody>
              {s.topPatterns.map((p, i) => (
                <tr key={i} className="border-t border-white/5"><td className="p-1.5 font-mono text-xs text-slate-400">{p.patternType}</td><td className="p-1.5">{p.key}</td><td className="p-1.5 text-left font-bold">{p.occurrences} · {(p.successRate * 100).toFixed(0)}%</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-bold mb-3">أعلى الإشارات (Insights)</h2>
          {s.topInsights.length === 0 ? <p className="text-slate-500 text-sm">لا توجد بيانات بعد.</p> : (
            <table className="w-full text-sm"><tbody>
              {s.topInsights.map((p, i) => (
                <tr key={i} className="border-t border-white/5"><td className="p-1.5 font-mono text-slate-300">{p.type}</td><td className="p-1.5 text-left font-bold">{p.count}</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value.toLocaleString()}</div></div>;
}
