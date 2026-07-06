"use client";

// Auto-detects the customer's OS and highlights the right download, with the
// other platforms + Docker available. Links resolve to the latest published
// release assets (stable per-OS binary names) or the releases page for installers.

import { useEffect, useState } from "react";

type OS = "windows" | "mac" | "linux" | "docker";

export function DownloadCards({ base, releasesPage }: { base: string; releasesPage: string }) {
  const [detected, setDetected] = useState<OS>("linux");

  useEffect(() => {
    const ua = (navigator.userAgent || "") + " " + ((navigator as any).platform || "");
    if (/Win/i.test(ua)) setDetected("windows");
    else if (/Mac|iPhone|iPad/i.test(ua)) setDetected("mac");
    else setDetected("linux");
  }, []);

  const cards: {
    os: OS; name: string; icon: string; note: string;
    primary?: { label: string; href: string };
    links: { label: string; href: string }[];
  }[] = [
    {
      os: "windows", name: "Windows", icon: "🪟", note: "ويندوز 10/11 — يُثبَّت كخدمة تعمل تلقائياً.",
      primary: { label: "تنزيل المُثبِّت (.msi)", href: releasesPage },
      links: [{ label: "الملف التنفيذي (x64)", href: `${base}/keyone-bridge_windows_amd64.exe` }],
    },
    {
      os: "mac", name: "macOS", icon: "", note: "Apple Silicon و Intel — يُثبَّت كـ LaunchAgent.",
      primary: { label: "تنزيل المُثبِّت (.pkg)", href: releasesPage },
      links: [
        { label: "Apple Silicon (arm64)", href: `${base}/keyone-bridge_darwin_arm64` },
        { label: "Intel (x64)", href: `${base}/keyone-bridge_darwin_amd64` },
      ],
    },
    {
      os: "linux", name: "Linux", icon: "🐧", note: "Ubuntu / Debian وغيرها — خدمة systemd.",
      primary: { label: "تنزيل (.deb / AppImage)", href: releasesPage },
      links: [
        { label: "الملف الثنائي (x64)", href: `${base}/keyone-bridge_linux_amd64` },
        { label: "الملف الثنائي (arm64)", href: `${base}/keyone-bridge_linux_arm64` },
      ],
    },
    {
      os: "docker", name: "Docker", icon: "🐳", note: "شغّله في حاوية على أي خادم.",
      links: [],
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((c) => {
        const isDetected = c.os === detected;
        return (
          <div key={c.os} className={`card p-5 space-y-3 ${isDetected ? "ring-2 ring-sky-500/40" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{c.icon}</span>
                <h3 className="font-bold text-white">{c.name}</h3>
              </div>
              {isDetected && (
                <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-300">نظامك</span>
              )}
            </div>
            <p className="text-sm text-slate-400">{c.note}</p>

            {c.os === "docker" ? (
              <pre dir="ltr" className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-xs text-sky-200">
{`docker run -d --name keyone-bridge \\
  -v keyone-bridge:/data \\
  -e KEYONE_BRIDGE_HOME=/data \\
  ghcr.io/${releasesPage.split("/").slice(3, 5).join("/")}:latest`}
              </pre>
            ) : (
              <div className="space-y-2">
                {c.primary && (
                  <a href={c.primary.href} className="btn-primary inline-block w-full text-center">{c.primary.label}</a>
                )}
                <div className="flex flex-wrap gap-2">
                  {c.links.map((l) => (
                    <a key={l.label} href={l.href}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/10">
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="md:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-sm text-slate-300 space-y-2">
        <b className="text-slate-100">بعد التثبيت:</b>
        <ol className="list-decimal space-y-1 pe-5 text-slate-400">
          <li>شغّل الأمر <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-sky-200">keyone-bridge login</code> (يظهر لك رمز قصير).</li>
          <li>اعتمد الرمز من <a href="/dashboard/settings/bridge/link" className="text-sky-300 underline">صفحة ربط الجهاز</a>.</li>
          <li>ارجع للوحة التحكم واضغط «بدء الربط» لمسح رمز QR بواتساب.</li>
        </ol>
        <p className="text-xs text-slate-500">
          إن لم تُنشَر الإصدارات بعد، ستجد الملفات على <a href={releasesPage} target="_blank" rel="noreferrer" className="text-sky-300 underline">صفحة الإصدارات</a>.
        </p>
      </div>
    </div>
  );
}
