// /dashboard/settings/bridge — KEYONE Bridge control center (server shell).
//
// Additive & flag-gated: when BRIDGE_ENABLED is off this renders a plain
// "feature disabled" note and touches nothing else. Auth: requirePagePermission
// ("settings"). Loads the read-only overview server-side for the first paint,
// then the client control center polls /api/bridge/v1/overview for live updates.
// The customer manages everything here and only ever installs the Bridge app.

import { requirePagePermission } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { pageGate } from "@/lib/membership/gate";
import LockedFeature from "@/components/billing/LockedFeature";
import { getBridgeOverview } from "@/lib/bridge/overview";
import { BridgeControlCenter } from "./control-center";

export const dynamic = "force-dynamic";

export default async function BridgePage() {
  const { user } = await requirePagePermission("settings");

  // whatsapp_bridge is a Growth (tier 1) capability and /api/bridge/v1/* enforces
  // it. Without the same gate here a Start tenant saw the full control centre and
  // then got 402 from every action — a feature advertised but not usable. Start
  // connects via Meta Cloud instead, which is available on every plan.
  const gate = await pageGate("whatsapp_bridge");
  if (!gate.allowed) {
    return (
      <div className="p-6">
        <LockedFeature
          locale="ar"
          recommendedTier={gate.recommendedTier}
          title="KEYONE Bridge"
          description="موصّل النقل المستضاف ذاتياً لربط واتساب من جهازك. متاح في باقة Growth فأعلى."
        />
      </div>
    );
  }

  if (!bridgeEnabled()) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">KEYONE Bridge</h1>
          <p className="page-desc">موصّل النقل المستضاف ذاتياً</p>
        </div>
        <div className="card p-6 max-w-2xl text-sm text-slate-300">
          <b className="text-slate-100">هذه الميزة غير مُفعّلة حالياً.</b>
          <p className="mt-1 text-slate-400">
            KEYONE Bridge غير متاح على حسابك بعد. تواصل مع الدعم لتفعيله.
          </p>
        </div>
      </div>
    );
  }

  const overview = await getBridgeOverview(user.id);

  return (
    <div className="space-y-6">
      <div className="border-b border-white/[0.05] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">KEYONE Bridge</h1>
            <p className="page-desc mt-1">
              موصّل تستضيفه بنفسك يربط واتساب بمساحة عملك — تدير كل شيء من هنا.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/dashboard/settings/bridge/download" className="btn-primary">تنزيل Bridge</a>
            <a href="/dashboard/settings/bridge/link" className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm font-bold text-slate-200 hover:bg-white/[0.06]">ربط جهاز</a>
          </div>
        </div>
      </div>

      <BridgeControlCenter initial={overview} downloadHref="/dashboard/settings/bridge/download" />
    </div>
  );
}
