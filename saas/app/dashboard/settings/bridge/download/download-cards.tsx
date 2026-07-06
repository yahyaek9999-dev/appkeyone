"use client";

// Auto-detects the customer's OS and highlights the right download. ALL links
// point to KEYONE infrastructure (served by Caddy from the KEYONE download
// store) — no GitHub, no external repository, no registry links.

import { useEffect, useState } from "react";

type OS = "windows" | "mac" | "linux" | "docker";

export function DownloadCards({ base }: { base: string }) {
  const [detected, setDetected] = useState<OS>("linux");
  const [origin, setOrigin] = useState("https://w.keyone1.com");

  useEffect(() => {
    setOrigin(window.location.origin);
    const ua = (navigator.userAgent || "") + " " + ((navigator as any).platform || "");
    if (/Win/i.test(ua)) setDetected("windows");
    else if (/Mac|iPhone|iPad/i.test(ua)) setDetected("mac");
    else setDetected("linux");
  }, []);

  const dockerfile = `FROM debian:stable-slim
ADD ${origin}${base}/linux/keyone-bridge_linux_amd64 /usr/local/bin/keyone-bridge
RUN chmod +x /usr/local/bin/keyone-bridge
ENV KEYONE_BRIDGE_HOME=/data
ENTRYPOINT ["keyone-bridge","start"]`;

  const cards: {
    os: OS; name: string; icon: string; note: string;
    primary?: { label: string; href: string };
    links: { label: string; href: string }[];
  }[] = [
    {
      os: "windows", name: "Windows", icon: "🪟", note: "ويندوز 10/11 — يعمل في الخلفية تلقائياً.",
      primary: { label: "تنزيل لـ Windows", href: `${base}/windows/latest.exe` },
      links: [],
    },
    {
      os: "mac", name: "macOS", icon: "", note: "Apple Silicon و Intel — يُثبَّت كـ LaunchAgent.",
      primary: { label: "تنزيل المُثبِّت (.pkg)", href: `${base}/macos/latest.pkg` },
      links: [
        { label: "Apple Silicon (arm64)", href: `${base}/macos/keyone-bridge_darwin_arm64` },
        { label: "Intel (x64)", href: `${base}/macos/keyone-bridge_darwin_amd64` },
      ],
    },
    {
      os: "linux", name: "Linux", icon: "🐧", note: "Ubuntu / Debian وغيرها — خدمة systemd.",
      primary: { label: "تنزيل (.deb)", href: `${base}/linux/latest.deb` },
      links: [
        { label: "الملف الثنائي (x64)", href: `${base}/linux/keyone-bridge_linux_amd64` },
        { label: "الملف الثنائي (arm64)", href: `${base}/linux/keyone-bridge_linux_arm64` },
      ],
    },
    {
      os: "docker", name: "Docker", icon: "🐳", note: "شغّله في حاوية على أي خادم (يُنزّل من خوادم KEYONE).",
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
              <pre dir="ltr" className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-xs text-sky-200">{dockerfile}</pre>
            ) : (
              <div className="space-y-2">
                {c.primary && (
                  <a href={c.primary.href} download className="btn-primary inline-block w-full text-center">{c.primary.label}</a>
                )}
                <div className="flex flex-wrap gap-2">
                  {c.links.map((l) => (
                    <a key={l.label} href={l.href} download
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
          كل الملفات مستضافة على خوادم KEYONE. للتحقق من السلامة:
          <a href={`${base}/checksums.txt`} className="ms-1 text-sky-300 underline">بصمات SHA-256</a>
          <span className="mx-1">·</span>
          <a href={`${base}/version.json`} className="text-sky-300 underline">الإصدار</a>
        </p>
      </div>
    </div>
  );
}
