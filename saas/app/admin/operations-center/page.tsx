/** /admin/operations-center — single-screen production operations (Phase 13). */
import { getOperationsCenter } from "@/lib/admin/operations";
import { formatUsd } from "@/lib/wallet/money";

export const dynamic = "force-dynamic";

export default async function OperationsCenterPage() {
  const o = await getOperationsCenter();
  const e = o.exec, i = o.incidents, s = o.staff, p = o.proofs;
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1">مركز العمليات (Operations Center)</h1>
      <p className="page-desc">الإيراد، المدفوعات المعلّقة، الالتزامات، الحوادث المفتوحة، عبء الطاقم، صحة النظام.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="MRR" value={formatUsd(e?.mrr || 0)} />
        <Tile label="مدفوعات معلّقة" value={String(p?.pending || 0)} tone={(p?.pending || 0) > 0 ? "warn" : "ok"} />
        <Tile label="التزام المحفظة" value={formatUsd(e?.walletLiability || 0)} />
        <Tile label="التزام الكريدت" value={String((e?.brainCreditsLiability || 0) + (e?.broadcastCreditsLiability || 0))} />
        <Tile label="حوادث مفتوحة" value={String(i?.open || 0)} tone={(i?.open || 0) > 0 ? "warn" : "ok"} />
        <Tile label="طاقم نشط" value={String(s?.active || 0)} />
        <Tile label="إشعارات غير مقروءة" value={String(s?.unreadNotifications || 0)} />
        <Tile label="استخدام API" value={String(e?.apiUsage || 0)} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Dist title="الحوادث حسب القسم" rows={(i?.byDept || []).map((r) => ({ label: r.dept, count: r.count }))} />
        <Dist title="عبء العمل حسب القسم" rows={(s?.byDept || []).map((r) => ({ label: r.dept, count: r.count }))} />
        <Dist title="المدفوعات حسب الطريقة" rows={(p?.byMethod || []).map((r) => ({ label: r.method, count: r.count }))} />
      </div>
    </div>
  );
}
function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return <div className={`card p-4 border ${tone === "warn" ? "border-rose-500/30" : "border-white/5"}`}><div className="text-slate-400 text-sm mb-1">{label}</div><div className="text-2xl font-extrabold">{value}</div></div>;
}
function Dist({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return <div className="card p-5"><h2 className="font-bold mb-3">{title}</h2>{rows.length === 0 ? <p className="text-slate-500 text-sm">لا توجد بيانات.</p> : <table className="w-full text-sm"><tbody>{rows.map((r) => <tr key={r.label} className="border-t border-white/5"><td className="p-1.5 font-mono text-slate-300">{r.label}</td><td className="p-1.5 text-left font-bold">{r.count}</td></tr>)}</tbody></table>}</div>;
}
