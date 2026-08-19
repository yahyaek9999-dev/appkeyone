// /admin/risk — Tenant Risk Center. Deterministic, explainable risk scores from
// real signals (lib/admin/tenant-risk). Every point is tied to a named signal.
import Link from "next/link";
import { getTenantRiskList, riskLevelMeta } from "@/lib/admin/tenant-risk";
import { ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminRiskPage() {
  const { rows, cohort, windowDays } = await getTenantRiskList({ minScore: 20, take: 300 });
  const critical = rows.filter((r) => r.level === "critical").length;
  const high = rows.filter((r) => r.level === "high").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">مخاطر التجّار</h1>
        <p className="page-desc">
          درجات خطر حتمية (deterministic) مبنية على إشارات فعلية — كل نقطة موثّقة في الكود. نافذة النشاط: {windowDays} يوم ·
          الكوهورت: {cohort} تاجر.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="حرج" value={critical} color="text-rose-300" />
        <Stat label="مرتفع" value={high} color="text-orange-300" />
        <Stat label="بحاجة مراجعة" value={rows.length} color="text-amber-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="py-10 text-center text-[12px] text-slate-600">لا تجّار بمخاطر تُذكر — كل الحسابات ضمن الحدود.</div>}
        {rows.map((r) => {
          const m = riskLevelMeta(r.level);
          return (
            <div key={r.userId} className={`rounded-xl border p-4 ${m.border} ${m.bg}`}>
              <div className="flex items-start gap-4">
                <div className="shrink-0 text-center">
                  <div className={`text-2xl font-bold tabular-nums ${m.text}`}>{r.score}</div>
                  <div className={`text-[10px] font-semibold ${m.text}`}>{m.label}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/tenants/${r.userId}`} className="group inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-brand-300">
                    {r.name || r.email || r.userId}
                    <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                  </Link>
                  {r.email && r.name && <span className="ms-2 text-[11px] text-slate-500" dir="ltr">{r.email}</span>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.reasons.map((reason, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[11px] text-slate-300">
                        {reason.label} <span className="text-rose-300/80">+{reason.points}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[12px] text-slate-400">→ {r.recommendedAction}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
