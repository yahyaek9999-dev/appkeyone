/** /admin/membership-audit — plan isolation coverage matrix (Phase 4). */
import { auditMembershipIsolation } from "@/lib/membership/audit";

export const dynamic = "force-dynamic";

export default async function MembershipAuditPage() {
  const a = auditMembershipIsolation();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">تدقيق عزل الباقات (Membership Isolation)</h1>
      <p className="page-desc">كل قدرة مدفوعة والصفحات/الواجهات التي تفرضها (مُتحقَّق منها في الكود).</p>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="قدرات مدفوعة" value={a.premiumCount} />
        <Tile label="مبوّبة (Gated)" value={a.gatedCount} />
        <Tile label="صفحات + APIs مغطّاة" value={a.totalPages + a.totalApis} />
      </div>
      <div className="card p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">القدرة</th><th className="p-1.5 text-right">أدنى باقة</th><th className="p-1.5 text-right">صفحات</th><th className="p-1.5 text-right">APIs</th><th className="p-1.5 text-left">مبوّبة</th></tr></thead>
          <tbody>
            {a.capabilities.map((c) => (
              <tr key={c.capability} className="border-t border-white/5">
                <td className="p-1.5 font-mono text-slate-300">{c.capability}{c.comingSoon ? " *" : ""}</td>
                <td className="p-1.5">{c.minTier || "—"}</td>
                <td className="p-1.5 text-xs text-slate-400">{c.pages.length}</td>
                <td className="p-1.5 text-xs text-slate-400">{c.apis.length}</td>
                <td className="p-1.5 text-left">{c.gated ? <span className="text-emerald-300 font-bold">✓</span> : <span className="text-rose-300 font-bold">✗</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-slate-500 text-xs mt-2">* = coming-soon module (entitlement-gated; UI/engine in progress).</p>
      </div>
    </div>
  );
}
function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card p-4"><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value.toLocaleString()}</div></div>;
}
