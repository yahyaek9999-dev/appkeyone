"use client";

// Renders a WhatsApp pairing QR string (streamed from the Bridge) into a real,
// scannable QR image, entirely client-side. No external calls — the encoder runs
// in the browser.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({ data, size = 232 }: { data: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(data, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [data, size]);

  if (!url) {
    return (
      <div
        style={{ width: size, height: size }}
        className="animate-pulse rounded-xl bg-white/5"
        aria-label="جارٍ توليد رمز QR"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      width={size}
      height={size}
      alt="امسح رمز QR بواتساب"
      className="rounded-xl bg-white p-2"
    />
  );
}
