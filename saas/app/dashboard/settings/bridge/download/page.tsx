// /dashboard/settings/bridge/download — download the Bridge for the customer's OS.
// Flag-gated; auth: settings. The client component auto-detects the OS.

import { requirePagePermission } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { DownloadCards } from "./download-cards";

export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  await requirePagePermission("settings");

  if (!bridgeEnabled()) {
    return (
      <div className="card p-6 max-w-2xl text-sm text-slate-300">
        <b className="text-slate-100">هذه الميزة غير مُفعّلة حالياً.</b>
      </div>
    );
  }

  const repo = process.env.BRIDGE_RELEASE_REPO || "yahyaek9999-dev/keyone-bridge";
  const base = `https://github.com/${repo}/releases/latest/download`;
  const releasesPage = `https://github.com/${repo}/releases/latest`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">تنزيل KEYONE Bridge</h1>
        <p className="page-desc">اخترنا لك النسخة المناسبة لنظامك تلقائياً. ثبّتها مرة واحدة — وكل شيء بعدها يُدار من لوحة التحكم.</p>
      </div>
      <DownloadCards base={base} releasesPage={releasesPage} />
      <div className="flex items-center gap-2">
        <a href="/dashboard/settings/bridge" className="text-sm text-slate-400 underline">← رجوع للوحة تحكم Bridge</a>
      </div>
    </div>
  );
}
