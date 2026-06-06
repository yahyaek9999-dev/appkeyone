"use client";

/**
 * Inline limit-reached / approaching-limit banner. Use at the top of a section
 * when a usage counter is near or at its cap. Links to pricing.
 */

import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";

export default function LimitBanner({
  message,
  ctaLabel,
  tone = "warn",
  locale = "ar",
}: {
  message: string;
  ctaLabel?: string;
  tone?: "warn" | "danger";
  locale?: "ar" | "en";
}) {
  const isRtl = locale === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const styles =
    tone === "danger"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : "border-amber-500/30 bg-amber-500/10 text-amber-200";

  return (
    <div
      className={`flex flex-col items-start gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${styles}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <Link
        href={`/pricing?lang=${locale}#plans`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
      >
        {ctaLabel ?? (locale === "ar" ? "ترقية الباقة" : "Upgrade")}
        <Arrow className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
