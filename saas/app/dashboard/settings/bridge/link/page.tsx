// /dashboard/settings/bridge/link — device-link APPROVAL page (server component).
//
// RFC 8628 user-approval step. The logged-in owner confirms the short user_code
// shown by their Bridge and approves it → the form POSTs /api/bridge/v1/device/approve.
//
// Additive & flag-gated. Auth: requirePagePermission("settings"). Supports an
// optional ?user_code= prefill (e.g. from a verification_uri_complete deep link),
// but the user always explicitly clicks Approve.

import { requirePagePermission } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { LinkForm } from "./link-form";

export const dynamic = "force-dynamic";

export default async function BridgeLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string }>;
}) {
  await requirePagePermission("settings");

  if (!bridgeEnabled()) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title mb-1">ربط جهاز Bridge</h1>
        </div>
        <div className="card p-6 max-w-2xl text-sm text-slate-300">
          <b className="text-slate-100">هذه الميزة غير مُفعّلة حالياً.</b>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const preset = (sp?.user_code || "").trim();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">ربط جهاز Bridge</h1>
        <p className="page-desc">
          أدخل الرمز الذي عرضه جهاز KEYONE Bridge لديك لاعتماد ربطه بمساحة عملك.
        </p>
      </div>

      <div className="card p-6 max-w-xl">
        <LinkForm presetCode={preset} />
      </div>

      <div className="card p-6 max-w-xl text-sm text-slate-300 space-y-2">
        <h3 className="font-bold text-slate-100 mb-1">كيف أحصل على الرمز؟</h3>
        <p>1. ثبّت وشغّل KEYONE Bridge على جهازك أو خادمك.</p>
        <p>
          2. نفّذ الأمر <span className="font-mono text-sky-300">keyone-bridge login</span> — سيعرض رمزاً قصيراً.
        </p>
        <p>3. انسخ الرمز هنا واضغط «اعتماد وربط الجهاز».</p>
        <p className="border-t border-white/10 pt-2 text-slate-400">
          🔒 الرمز صالح لمرة واحدة ولفترة قصيرة. KEYONE لا يخزّن بيانات دخول واتساب إطلاقاً.
        </p>
        <div className="pt-1">
          <a href="/dashboard/settings/bridge" className="text-sky-300 underline">← رجوع للوحة KEYONE Bridge</a>
        </div>
      </div>
    </div>
  );
}
