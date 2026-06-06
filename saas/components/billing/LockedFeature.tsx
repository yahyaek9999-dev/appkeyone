"use client";

/**
 * Locked-feature upsell. Drop in place of (or over) a gated page/section for
 * users whose plan doesn't include the capability. Mirrors the knowledge-brain
 * lock pattern: centered card with lock icon, value prop, and upgrade CTA.
 *
 * Two modes:
 *   - Standalone card (default): renders only the upsell.
 *   - Overlay (`children` provided): renders children blurred behind the card.
 */

import Link from "next/link";
import { Lock, Sparkles, ArrowLeft, ArrowRight } from "lucide-react";
import { getTier } from "@/lib/pricing/catalog";

export default function LockedFeature({
  title,
  description,
  recommendedTier,
  locale = "ar",
  children,
}: {
  title: string;
  description: string;
  recommendedTier?: string | null;
  locale?: "ar" | "en";
  children?: React.ReactNode;
}) {
  const lang = locale === "ar" ? "ar" : "en";
  const isRtl = locale === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const tier = recommendedTier ? getTier(recommendedTier) : undefined;

  const card = (
    <div className="relative mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/15">
        <Lock className="h-6 w-6 text-brand-300" />
      </div>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>

      {tier && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-200">
          <Sparkles className="h-3.5 w-3.5" />
          {locale === "ar" ? "متاح في" : "Available on"} {tier.name[lang]}
        </div>
      )}

      <div className="mt-6">
        <Link
          href={`/pricing?lang=${locale}#plans`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 hover:shadow-[0_6px_24px_-6px_rgba(104,114,212,0.8)]"
        >
          {locale === "ar" ? "ترقية الباقة" : "Upgrade plan"}
          <Arrow className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );

  if (!children) return card;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40 blur-sm" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">{card}</div>
    </div>
  );
}
