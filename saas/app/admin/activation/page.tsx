// Admin — Activation Funnel drop-off view. Read-only, no client JS.
//
// Shows, across ALL merchants, how many reached each step of the signup→value
// journey and where the biggest drop-off is. Counts are derived from the
// source-of-truth tables (see lib/activation/funnel.ts) so they're accurate for
// every account, not just those instrumented after the ledger shipped.

import { getActivationFunnel } from "@/lib/activation/funnel";
import { TrendingDown, Users, Sparkles, Rocket } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminActivationPage() {
  const funnel = await getActivationFunnel();
  const maxCount = Math.max(1, ...funnel.stages.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">قُمع التفعيل</h1>
        <p className="page-desc">رحلة التاجر من التسجيل إلى أول قيمة — وأين يحدث التسرّب.</p>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          icon={<Users className="h-4 w-4" />}
          label="إجمالي التسجيلات"
          value={funnel.totalSignups.toLocaleString()}
          accent="from-blue-500/20 to-blue-600/5 text-blue-400"
        />
        <Tile
          icon={<Sparkles className="h-4 w-4" />}
          label="نسبة التفعيل (وصلوا لأول رد آلي)"
          value={`${funnel.activationRatePct}%`}
          accent="from-emerald-500/20 to-green-500/5 text-emerald-400"
        />
        <Tile
          icon={<TrendingDown className="h-4 w-4" />}
          label="أكبر نقطة تسرّب"
          value={
            funnel.biggestDropOff
              ? `${funnel.biggestDropOff.dropOffPct}%`
              : "—"
          }
          sub={
            funnel.biggestDropOff
              ? `${funnel.biggestDropOff.fromLabel} ← ${funnel.biggestDropOff.toLabel}`
              : undefined
          }
          accent="from-rose-500/20 to-orange-500/5 text-rose-400"
        />
      </div>

      {/* Funnel bars */}
      <div className="card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-brand-400" />
          <h2 className="section-title">مراحل القُمع</h2>
        </div>
        <div className="space-y-3">
          {funnel.stages.map((s, i) => {
            const widthPct = Math.max(2, Math.round((s.count / maxCount) * 100));
            const isLeak =
              funnel.biggestDropOff &&
              s.label === funnel.biggestDropOff.toLabel &&
              (s.dropOffFromPrev ?? 0) > 0;
            return (
              <div key={s.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">
                    {i + 1}. {s.label}
                  </span>
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className="font-semibold text-white">{s.count.toLocaleString()}</span>
                    {s.conversionFromPrev !== null && (
                      <span className={isLeak ? "text-rose-300" : "text-slate-500"}>
                        ({s.conversionFromPrev}% من السابق)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/[0.04]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isLeak
                        ? "bg-gradient-to-l from-rose-500 to-orange-500"
                        : "bg-gradient-to-l from-brand-500 to-emerald-500"
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-slate-600">
          الأعداد عدد التُجّار المميّزين الذين وصلوا لكل مرحلة (مشتقة من بيانات الإنتاج).
          آخر تحديث: {new Date(funnel.generatedAt).toLocaleString("ar-EG")}
        </p>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon border bg-gradient-to-br ${accent}`}>{icon}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
