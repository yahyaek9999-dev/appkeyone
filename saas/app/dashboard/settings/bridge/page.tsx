// /dashboard/settings/bridge — KEYONE Bridge management panel (server component).
//
// Additive & flag-gated: when BRIDGE_ENABLED is off this page renders a plain
// "feature disabled" note and touches nothing else. No Meta Cloud / QR behaviour
// changes. Auth: requirePagePermission("settings") (same gate as meta-cloud).
//
// Shows every non-revoked Bridge of the caller's workspace with its telemetry
// (status, version, OS, last heartbeat, connected identities, primary flag) and
// the Phase-1 action buttons. Empty-state gives install + `keyone-bridge login`.
//
// Reads ONLY telemetry + token HASH-free fields via an explicit select — the
// tokenHash column is never touched here.

import { requirePagePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { BridgeActions } from "./bridge-actions";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  whatsapp: "واتساب",
  telegram: "تيليجرام",
};

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  connected:    { text: "متصل",        cls: "text-emerald-300" },
  connecting:   { text: "جارٍ الاتصال", cls: "text-amber-300" },
  linking:      { text: "جارٍ الربط",   cls: "text-amber-300" },
  disconnected: { text: "غير متصل",    cls: "text-slate-400" },
  logged_out:   { text: "تم الخروج",    cls: "text-rose-300" },
};

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("ar-EG"); } catch { return "—"; }
}

export default async function BridgePage() {
  const { user } = await requirePagePermission("settings");

  // Hard flag gate: nothing about Bridge is exposed when the master switch is off.
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

  const bridges = await (prisma as any).bridge.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      os: true,
      arch: true,
      version: true,
      status: true,
      isPrimary: true,
      lastHeartbeatAt: true,
      createdAt: true,
      transports: {
        select: { id: true, provider: true, state: true, identity: true, updatedAt: true },
        orderBy: { provider: "asc" },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">KEYONE Bridge</h1>
        <p className="page-desc">
          موصّل تستضيفه بنفسك يربط واتساب بمساحة عملك عبر KEYONE. تدير من هنا حالة الأجهزة والأرقام المرتبطة.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/dashboard/settings/bridge/link"
          className="btn-primary"
        >
          ربط جهاز Bridge جديد
        </a>
        <a href="/dashboard/settings/meta-cloud" className="text-sm text-slate-400 underline">
          ← رجوع لوضع الاتصال
        </a>
      </div>

      {bridges.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {bridges.map((b: any) => {
            const online = b.status === "online";
            return (
              <div key={b.id} className="card p-5 space-y-4">
                {/* Header: name + status + primary */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        online
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-500/15 text-slate-400 border border-white/10"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-slate-500"}`} />
                      {online ? "متصل" : "غير متصل"}
                    </span>
                    <span className="font-bold text-white">{b.name || "جهاز Bridge"}</span>
                    {b.isPrimary && (
                      <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                        الأساسي
                      </span>
                    )}
                  </div>
                </div>

                {/* Telemetry grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <Meta label="الإصدار" value={b.version || "—"} />
                  <Meta label="نظام التشغيل" value={[b.os, b.arch].filter(Boolean).join(" · ") || "—"} />
                  <Meta label="آخر نبضة" value={fmtDate(b.lastHeartbeatAt)} />
                </div>

                {/* Transports (connected identities) */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                  <div className="mb-2 text-xs font-medium text-slate-400">الأرقام / الحسابات المرتبطة</div>
                  {b.transports.length === 0 ? (
                    <p className="text-xs text-slate-500">لا توجد حسابات مرتبطة بعد على هذا الجهاز.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {b.transports.map((t: any) => {
                        const st = STATE_LABEL[t.state] || { text: t.state, cls: "text-slate-400" };
                        return (
                          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span className="text-slate-200">
                              {PROVIDER_LABEL[t.provider] || t.provider}
                              {t.identity && <span className="text-slate-400"> — {t.identity}</span>}
                            </span>
                            <span className={`text-xs font-bold ${st.cls}`}>{st.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Actions */}
                <BridgeActions bridgeId={b.id} isPrimary={b.isPrimary} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-100">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-6 max-w-2xl space-y-4">
      <div>
        <h2 className="section-title mb-1">لا يوجد جهاز Bridge بعد</h2>
        <p className="text-sm text-slate-400">
          ثبّت KEYONE Bridge على جهازك أو خادمك، سجّل الدخول، ثم أدخل الرمز الظاهر لربطه بمساحة عملك.
        </p>
      </div>

      <ol className="space-y-3 text-sm text-slate-300">
        <li>
          <b className="text-slate-100">1) نزّل وثبّت</b> برنامج KEYONE Bridge على الجهاز الذي سيبقى متصلاً (ويندوز / ماك / لينكس).
        </li>
        <li>
          <b className="text-slate-100">2) شغّل أمر الدخول</b> في الطرفية:
          <pre className="mt-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-sky-200">keyone-bridge login</pre>
          سيعرض لك الأمر رمزاً قصيراً (user code).
        </li>
        <li>
          <b className="text-slate-100">3) اعتمد الرمز</b> من صفحة الربط:
          <div className="mt-1.5">
            <a href="/dashboard/settings/bridge/link" className="text-sky-300 underline">فتح صفحة ربط الجهاز ←</a>
          </div>
        </li>
      </ol>

      <p className="text-xs text-slate-500 border-t border-white/10 pt-3">
        🔒 KEYONE لا يخزّن أبداً بيانات دخول واتساب أو الجلسات — فقط بيانات الحالة ورمز موثوق مُجزّأ (hash).
      </p>
    </div>
  );
}
