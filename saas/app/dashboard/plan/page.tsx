/** /dashboard/plan — per-plan dashboard (Phase 5): widgets, limits, onboarding. */
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { getEffectivePlan } from "@/lib/membership/plan";
import { getPlanDashboard } from "@/lib/plans/dashboards";

export const dynamic = "force-dynamic";

export default async function PlanDashboardPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");
  const plan = await getEffectivePlan(uid);
  const d = getPlanDashboard(plan.slug);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">لوحة باقتك — {d.name}</h1>
      <p className="page-desc">باقة <span className="font-mono">{d.slug}</span> ({d.tier}). كل باقة ترى عناصرها وحدودها وخطوات تهيئتها.</p>

      <div className="card p-5">
        <h2 className="font-bold mb-3">العناصر المتاحة (Widgets)</h2>
        <div className="flex flex-wrap gap-2">
          {d.widgets.map((w) => <span key={w} className="rounded-full bg-brand-500/15 text-brand-300 text-xs px-3 py-1 font-mono">{w}</span>)}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-bold mb-3">الحدود (Limits)</h2>
          <table className="w-full text-sm"><tbody>
            {Object.entries(d.limits).map(([k, v]) => (
              <tr key={k} className="border-t border-white/5"><td className="p-1.5 font-mono text-slate-300">{k}</td><td className="p-1.5 text-left font-bold">{v === 0 ? "∞" : v.toLocaleString()}</td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card p-5">
          <h2 className="font-bold mb-3">خطوات التهيئة (Onboarding)</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
            {d.onboarding.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
