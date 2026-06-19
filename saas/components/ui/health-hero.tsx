import type { ReactNode } from "react";

/**
 * HealthHero — a reusable "operations health" summary header (UI only).
 * Big score gauge + risk level + trend + recommended actions + critical warnings
 * + a quick-fix actions slot. Each health center computes its own score and
 * passes it in. No new data/model — pure presentation over existing metrics.
 */
export type Trend = "up" | "down" | "flat";

function band(score: number) {
  if (score >= 80) return { label: "ممتاز", risk: "منخفض", ring: "text-emerald-400", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300" };
  if (score >= 60) return { label: "جيد", risk: "متوسط", ring: "text-sky-400", text: "text-sky-300", chip: "bg-sky-500/15 text-sky-300" };
  if (score >= 40) return { label: "يحتاج انتباه", risk: "مرتفع", ring: "text-amber-400", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-300" };
  return { label: "حرج", risk: "حرِج", ring: "text-rose-400", text: "text-rose-300", chip: "bg-rose-500/15 text-rose-300" };
}

function Gauge({ score, tone }: { score: number; tone: string }) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" className="shrink-0">
      <circle cx="46" cy="46" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-white/10" />
      <circle cx="46" cy="46" r={r} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" className={tone}
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 46 46)" />
      <text x="46" y="44" textAnchor="middle" className="fill-white text-[22px] font-extrabold">{Math.round(score)}</text>
      <text x="46" y="60" textAnchor="middle" className="fill-slate-400 text-[9px]">/ 100</text>
    </svg>
  );
}

const TREND = { up: { icon: "↑", cls: "text-emerald-300" }, down: { icon: "↓", cls: "text-rose-300" }, flat: { icon: "→", cls: "text-slate-400" } };

export default function HealthHero({
  title, score, summary, trend = "flat", trendLabel, recommendations = [], warnings = [], actions,
}: {
  title: string;
  score: number;
  summary: string;
  trend?: Trend;
  trendLabel?: string;
  recommendations?: string[];
  warnings?: string[];
  actions?: ReactNode;
}) {
  const b = band(score);
  const t = TREND[trend];
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/[0.07] blur-3xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
        <Gauge score={score} tone={b.ring} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{title}</h2>
            <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + b.chip}>{b.label}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-300">الخطورة: {b.risk}</span>
            {trendLabel && <span className={"text-xs font-semibold " + t.cls}>{t.icon} {trendLabel}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-400">{summary}</p>
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>

      {(warnings.length > 0 || recommendations.length > 0) && (
        <div className="relative mt-4 grid gap-3 md:grid-cols-2">
          {warnings.length > 0 && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3">
              <div className="mb-1 text-xs font-semibold text-rose-300">⚠ تحذيرات حرجة</div>
              <ul className="list-disc space-y-0.5 pe-5 text-xs text-slate-300">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="rounded-lg border border-brand-500/25 bg-brand-500/[0.05] p-3">
              <div className="mb-1 text-xs font-semibold text-brand-200">💡 إجراءات موصى بها</div>
              <ul className="list-disc space-y-0.5 pe-5 text-xs text-slate-300">{recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
