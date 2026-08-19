// /admin/dependencies — Feature Dependencies & Explainability.
//
// Surfaces the CANONICAL feature-control engine's result for every feature:
// final availability, the exact blocking reason, the dependency chain, and the
// contributing factors (kill switch, status, release train, rollout, plan gate).
// All verdicts come from lib/admin/feature-explain → lib/feature-control; this
// page computes nothing itself. Admin-only (enforced by app/admin/layout.tsx).
import { explainAllFeatures } from "@/lib/admin/feature-explain";
import DependencyExplorer from "./dependency-explorer";

export const dynamic = "force-dynamic";

export default async function AdminDependenciesPage() {
  const features = await explainAllFeatures();
  const unavailable = features.filter((f) => !f.available).length;
  const withDeps = features.filter((f) => f.dependencies.length > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title mb-1">الاعتماديات والتفسير</h1>
        <p className="page-desc">
          الحالة النهائية لكل ميزة كما يحسبها محرّك التحكم بالميزات — مع السبب الدقيق وسلسلة الاعتماديات. لا إعادة حساب،
          النتيجة من نفس المحرّك المعتمد.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="إجمالي الميزات" value={features.length} />
        <Stat label="غير متاحة الآن" value={unavailable} color={unavailable > 0 ? "text-amber-400" : "text-emerald-400"} />
        <Stat label="لها اعتماديات" value={withDeps} color="text-brand-400" />
      </div>

      <DependencyExplorer features={features} />
    </div>
  );
}

function Stat({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
