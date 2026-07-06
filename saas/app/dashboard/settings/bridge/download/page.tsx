// /dashboard/settings/bridge/download — download the Bridge for the customer's OS.
// All downloads are served by KEYONE infrastructure — NO GitHub, no external
// repository links. Flag-gated; auth: settings. The client component auto-detects
// the OS.

import { requirePagePermission } from "@/lib/auth";
import { bridgeEnabled } from "@/lib/bridge/flags";
import { DownloadCards } from "./download-cards";

export const dynamic = "force-dynamic";

// Same-origin path served by Caddy from the KEYONE download store.
const DOWNLOAD_BASE = "/downloads/keyone-bridge";

async function currentVersion(): Promise<string | null> {
  const origin = process.env.NEXT_PUBLIC_BASE_URL || "https://w.keyone1.com";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${origin}${DOWNLOAD_BASE}/version.json`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      return j?.version ?? null;
    }
  } catch {
    /* download store not populated yet — page still works */
  }
  return null;
}

export default async function DownloadPage() {
  await requirePagePermission("settings");

  if (!bridgeEnabled()) {
    return (
      <div className="card p-6 max-w-2xl text-sm text-slate-300">
        <b className="text-slate-100">هذه الميزة غير مُفعّلة حالياً.</b>
      </div>
    );
  }

  const version = await currentVersion();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-1">تنزيل KEYONE Bridge</h1>
        <p className="page-desc">
          اخترنا لك النسخة المناسبة لنظامك تلقائياً. ثبّتها مرة واحدة — وكل شيء بعدها يُدار من لوحة التحكم.
          {version && <span className="ms-1 text-slate-400">(الإصدار الحالي: <b className="text-slate-200">{version}</b>)</span>}
        </p>
      </div>
      <DownloadCards base={DOWNLOAD_BASE} />
      <div className="flex items-center gap-2">
        <a href="/dashboard/settings/bridge" className="text-sm text-slate-400 underline">← رجوع للوحة تحكم Bridge</a>
      </div>
    </div>
  );
}
