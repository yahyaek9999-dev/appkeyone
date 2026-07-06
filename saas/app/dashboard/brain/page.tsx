/**
 * /dashboard/brain — Customer Brain Center (Phase 11). Plan-gated on smart_assistant.
 * Shows customer memory, classifications, lead scores, usage and Brain credits.
 */
import { redirect } from "next/navigation";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { getBrainTenantStats } from "@/lib/brain/stats";
import { Brain } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const g = await pageGate("smart_assistant");
  if (!g.uid) redirect("/login");
  if (!g.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={g.recommendedTier}
          title="مركز الدماغ (KEYONE Brain)"
          description="ذكاء تجاري يبني ذاكرة لكل عميل، يصنّف نواياه، ويكتشف لهجته وقطاعه. متاح في باقة Pro فأعلى."
        />
      </div>
    );
  }
  const s = await getBrainTenantStats(g.uid);
  return (
    <div className="space-y-6">
      <h1 className="page-title mb-1 flex items-center gap-2"><Brain className="h-6 w-6 text-brand-300" /> مركز الدماغ</h1>
      <p className="page-desc">ذاكرة عملائك، تصنيفاتهم، درجات الأهلية، الاستهلاك، والكريدت.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="سجلات الذاكرة" value={s.memoryRecords} />
        <Tile label="استدعاءات الدماغ" value={s.brainMessages} />
        <Tile label="كريدت مستهلك" value={s.creditsUsed} />
        <Tile label="رصيد الكريدت" value={s.balance} />
        <Tile label="كريدت مصروف" value={s.totalSpent} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-5">
          <h2 className="font-bold mb-3">التصنيفات</h2>
          {s.byType.length === 0 ? <p className="text-slate-500 text-sm">لا توجد تصنيفات بعد.</p> : (
            <table className="w-full text-sm"><tbody>
              {s.byType.map((r) => (
                <tr key={r.type} className="border-t border-white/5"><td className="p-1.5 font-mono text-slate-300">{r.type}</td><td className="p-1.5 text-left font-bold">{r.count}</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card p-5 md:col-span-2">
          <h2 className="font-bold mb-3">أعلى العملاء (درجة الأهلية)</h2>
          {s.topProfiles.length === 0 ? <p className="text-slate-500 text-sm">لم تُبنَ ملفات الدماغ بعد — استدعِ /api/brain/memory لإثرائها.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-slate-400 text-xs"><th className="p-1.5 text-right">العميل</th><th className="p-1.5 text-right">القطاع</th><th className="p-1.5 text-right">اللهجة</th><th className="p-1.5 text-right">المرحلة</th><th className="p-1.5 text-left">الدرجة</th></tr></thead>
                <tbody>
                  {s.topProfiles.map((p) => (
                    <tr key={p.customerId} className="border-t border-white/5">
                      <td className="p-1.5 font-mono text-xs text-slate-400">{p.customerId.slice(0, 8)}…</td>
                      <td className="p-1.5">{p.industry}</td>
                      <td className="p-1.5">{p.dialect || "—"}</td>
                      <td className="p-1.5">{p.stage}</td>
                      <td className="p-1.5 text-left font-bold text-brand-300">{p.leadScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
