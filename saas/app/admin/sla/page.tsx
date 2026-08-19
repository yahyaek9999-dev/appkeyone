// /admin/sla — SLA Center. Shows only metrics the app actually records; where
// there is no history, it says so; where there is no data, status is "unavailable".
import { getSlaMetrics, type SlaStatus } from "@/lib/admin/sla";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const META: Record<SlaStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  healthy: { label: "سليم", cls: "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300", icon: CheckCircle2 },
  at_risk: { label: "معرّض", cls: "border-amber-500/25 bg-amber-500/[0.05] text-amber-300", icon: AlertTriangle },
  breached: { label: "متجاوَز", cls: "border-rose-500/30 bg-rose-500/[0.05] text-rose-300", icon: XCircle },
  unavailable: { label: "غير متاح", cls: "border-white/[0.08] bg-white/[0.02] text-slate-500", icon: HelpCircle },
};

export default async function AdminSlaPage() {
  const { metrics, windowDays } = await getSlaMetrics(7);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">مستوى الخدمة (SLA)</h1>
        <p className="page-desc">قياسات فعلية على آخر {windowDays} أيام من البيانات المُسجّلة. الأهداف افتراضية متحفّظة (غير تعاقدية).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {metrics.map((m) => {
          const mt = META[m.status];
          const Icon = mt.icon;
          return (
            <div key={m.key} className={`rounded-xl border p-4 ${mt.cls}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-semibold text-white">{m.label}</span>
                </div>
                <span className="text-[11px] font-medium">{mt.label}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-3">
                <div className="text-2xl font-bold tabular-nums text-white">
                  {m.current != null ? `${m.current.toLocaleString()}${m.unit}` : "—"}
                </div>
                <div className="text-[12px] text-slate-500">الهدف: {m.target}{m.unit}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{m.note}</span>
                <span>{m.sampleSize > 0 ? `عيّنة: ${m.sampleSize.toLocaleString()}` : ""}</span>
              </div>
              {!m.historical && m.current != null && (
                <div className="mt-1 text-[10px] text-slate-600">لا يُخزَّن سجل تاريخي لهذا المقياس — تُعرض القيمة الحالية فقط.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
