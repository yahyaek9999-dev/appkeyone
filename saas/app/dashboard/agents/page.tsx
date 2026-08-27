/** /dashboard/agents — tenant Multi-Agent center (Phase 2). Gated: smart_assistant. */
import { redirect } from "next/navigation";
import Link from "next/link";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { getAgentStats } from "@/lib/agents/orchestrator";
import { getActionStats } from "@/lib/actions/engine";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const g = await pageGate("smart_assistant");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return <div className="p-6"><LockedFeature locale="ar" recommendedTier={g.recommendedTier} title="نظام الوكلاء (Multi-Agent)" description="وكلاء مبيعات ودعم وCRM وطلبات وفوترة يعملون بذاكرة مشتركة. متاح في باقة Pro فأعلى." /></div>;
  }
  const [agents, actions] = await Promise.all([getAgentStats(g.uid), getActionStats(g.uid)]);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">نظام الوكلاء</h1>
      <p className="page-desc">
        وكلاء المبيعات والدعم وCRM والطلبات والفوترة يعملون بذاكرة مشتركة، ويُشغَّلون
        تلقائيًا مع محادثات عملائك. للتشغيل البرمجي، راجع{" "}
        <Link href="/dashboard/developer" className="text-brand-300 underline hover:text-brand-200">
          مركز المطوّرين
        </Link>
        .
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="تنفيذات" value={agents.executions} />
        <Tile label="قرارات" value={agents.decisions} />
        <Tile label="إجراءات" value={actions.total} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Dist title="القرارات حسب الوكيل" rows={agents.byAgent.map((r) => ({ label: r.agent, count: r.count }))} />
        <Dist title="الإجراءات حسب النوع" rows={actions.byType.map((r) => ({ label: r.actionType, count: r.count }))} />
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
