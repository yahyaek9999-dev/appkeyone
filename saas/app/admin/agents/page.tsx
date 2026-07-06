/** /admin/agents — Multi-Agent admin center (Phase 2). Admin-gated by layout. */
import { getAgentStats } from "@/lib/agents/orchestrator";
import { getActionStats } from "@/lib/actions/engine";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  const [agents, actions] = await Promise.all([getAgentStats(), getActionStats()]);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">مركز الوكلاء (Agents)</h1>
      <p className="page-desc">تنفيذات الوكلاء، القرارات، والإجراءات عبر كل المستأجرين.</p>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="تنفيذات الوكلاء" value={agents.executions} />
        <Tile label="القرارات" value={agents.decisions} />
        <Tile label="الإجراءات" value={actions.total} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Dist title="حسب الوكيل" rows={agents.byAgent.map((r) => ({ label: r.agent, count: r.count }))} />
        <Dist title="حسب نوع الإجراء" rows={actions.byType.map((r) => ({ label: r.actionType, count: r.count }))} />
        <Dist title="حسب الحالة" rows={actions.byStatus.map((r) => ({ label: r.status, count: r.count }))} />
      </div>
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value.toLocaleString()}</div></div>;
}
function Dist({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="card p-5"><h2 className="font-bold mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-slate-500 text-sm">لا توجد بيانات بعد.</p> : (
        <table className="w-full text-sm"><tbody>{rows.map((r) => (<tr key={r.label} className="border-t border-white/5"><td className="p-1.5 font-mono text-slate-300">{r.label}</td><td className="p-1.5 text-left font-bold">{r.count}</td></tr>))}</tbody></table>
      )}
    </div>
  );
}
