/**
 * /admin/brain — Admin Brain Center (Phase 10). Admin-gated by app/admin/layout.tsx.
 * Shows memory records, classifications, dialects, industry distribution, brain
 * usage and brain credits across all tenants.
 */
import { getBrainAdminStats } from "@/lib/brain/stats";
import { Brain } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminBrainPage() {
  const s = await getBrainAdminStats();
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1 flex items-center gap-2"><Brain className="h-6 w-6 text-brand-300" /> مركز الدماغ (Admin)</h1>
      <p className="page-desc">الذاكرة، التصنيفات، اللهجات، توزيع القطاعات، استهلاك الدماغ، والأرصدة — عبر كل المستأجرين.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="سجلات الذاكرة" value={s.memoryRecords} />
        <Tile label="ملفات الدماغ" value={s.profiles} />
        <Tile label="استدعاءات الدماغ" value={s.brainMessages} />
        <Tile label="كريدت مستهلك" value={s.creditsUsed} />
        <Tile label="رصيد الكريدت (إجمالي)" value={s.creditsBalance} />
        <Tile label="كريدت مصروف" value={s.creditsSpent} />
        <Tile label="محافظ الدماغ" value={s.walletCount} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <DistCard title="التصنيفات" rows={s.byType.map((r) => ({ label: r.type, count: r.count }))} />
        <DistCard title="اللهجات" rows={s.byDialect.map((r) => ({ label: r.dialect, count: r.count }))} />
        <DistCard title="القطاعات" rows={s.byIndustry.map((r) => ({ label: r.industry, count: r.count }))} />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-slate-400 text-sm mb-1">{label}</div>
      <div className="text-2xl font-extrabold">{value.toLocaleString()}</div>
    </div>
  );
}

function DistCard({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div className="card p-5">
      <h2 className="font-bold mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-sm">لا توجد بيانات بعد.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-white/5">
                <td className="p-1.5 font-mono text-slate-300">{r.label}</td>
                <td className="p-1.5 text-left font-bold">{r.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
