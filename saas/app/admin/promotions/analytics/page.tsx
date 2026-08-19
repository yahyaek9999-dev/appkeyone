// /admin/promotions/analytics — promotion financial performance.
// Reuses the EXISTING promotion engine via lib/admin/finance.getPromotionImpact
// (built in Batch 3). Read-only; does not touch promotion lifecycle. Metrics are
// labelled ACTUAL / DERIVED; conversion is DERIVED where measurable.
import Link from "next/link";
import { getPromotionImpact } from "@/lib/admin/finance";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PromotionAnalyticsPage() {
  const promos = await getPromotionImpact();
  const active = promos.filter((p) => p.status === "active");
  const totalDiscount = promos.reduce((s, p) => s + p.discountUsd, 0);
  const totalRedemptions = promos.reduce((s, p) => s + p.redemptions, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">تحليلات العروض</h1>
          <p className="page-desc">أداء العروض من محرّك العروض الحالي — بيانات فعلية فقط.</p>
        </div>
        <Link href="/admin/promotions" className="btn-ghost text-sm">إدارة العروض ←</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="عروض" value={String(promos.length)} />
        <Stat label="نشطة" value={String(active.length)} color="text-emerald-300" />
        <Stat label="إجمالي الاستخدامات (فعلي)" value={totalRedemptions.toLocaleString()} />
        <Stat label="قيمة الخصم (فعلي)" value={usd(totalDiscount)} color="text-amber-300" />
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-slate-400">
              <tr>
                <th className="p-3 text-right">العرض</th>
                <th className="p-3 text-right">النوع</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">الاستخدامات (فعلي)</th>
                <th className="p-3 text-right">العملاء (فعلي)</th>
                <th className="p-3 text-right">معدّل الاستهلاك (مُشتق)</th>
                <th className="p-3 text-right">قيمة الخصم (فعلي)</th>
                <th className="p-3 text-right">ينتهي</th>
              </tr>
            </thead>
            <tbody>
              {promos.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-500">لا عروض.</td></tr>}
              {promos.map((p) => {
                // DERIVED: consumption = redemptions / usageLimit when a limit exists.
                const consumption = p.usageLimit && p.usageLimit > 0 ? Math.round((p.redemptions / p.usageLimit) * 100) : null;
                return (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-3">
                      <div className="font-semibold text-white">{p.name}</div>
                      {p.code && <code className="text-[10px] text-slate-500" dir="ltr">{p.code}</code>}
                    </td>
                    <td className="p-3 text-[12px] text-slate-400" dir="ltr">{p.type}</td>
                    <td className="p-3">
                      <span className={`rounded-md px-2 py-0.5 text-[11px] ${p.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-white/[0.05] text-slate-400"}`}>{p.status}</span>
                    </td>
                    <td className="p-3 tabular-nums text-slate-300">{p.redemptions}</td>
                    <td className="p-3 tabular-nums text-slate-300">{p.customers}</td>
                    <td className="p-3 tabular-nums">
                      {consumption != null ? <span className="text-slate-300">{consumption}%</span> : <span className="text-slate-600">غير متاح (بلا حد)</span>}
                    </td>
                    <td className="p-3 tabular-nums font-semibold text-amber-300">{usd(p.discountUsd)}</td>
                    <td className="p-3 text-[12px] text-slate-500">{p.endsAt ? new Date(p.endsAt).toLocaleDateString("ar-EG") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        «معدّل الاستهلاك» مُشتق = الاستخدامات ÷ حد الاستخدام (عند وجوده). العروض بلا حدّ تُعرض «غير متاح» بدل رقم مُختلق.
      </p>
    </div>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
