"use client";

/**
 * Premium pricing cards + animated Monthly/Yearly billing toggle.
 * Dark luxury / glassmorphism, mobile-first, RTL-aware. Pro is highlighted as
 * the recommended plan; Enterprise shows a "Contact Sales" CTA instead of a
 * price. Plan/feature text is provided by the server (catalog-derived) so this
 * stays a pure presentation component.
 */

import { useState } from "react";
import { Check, Sparkles, ArrowLeft, ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { StaggerItem, HoverCard } from "@/components/ui/section-reveal";

export interface PricingTierVM {
  slug: string;
  name: string;
  tagline: string;
  audience: string[];
  priceMonthly: number | null;
  priceYearly: number | null;
  contactSales: boolean;
  popular: boolean;
  recommended: boolean;
  features: string[];
  hrefMonthly: string;
  hrefYearly: string;
  contactHref: string;
  savings: number | null;
}

export interface PricingLabels {
  monthly: string;
  yearly: string;
  saveBadge: string;
  perMonth: string;
  perYear: string;
  billedYearly: string; // "$X billed yearly"
  save: string; // "Save $%s"
  subscribeCta: string;
  contactCta: string;
  popularBadge: string;
  perfectFor: string;
}

export default function PricingExperience({
  tiers,
  labels,
  locale = "ar",
}: {
  tiers: PricingTierVM[];
  labels: PricingLabels;
  locale?: "ar" | "en";
}) {
  const [yearly, setYearly] = useState(false);
  const isRtl = locale === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div>
      {/* ───────── Billing toggle ───────── */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div
          role="tablist"
          aria-label={labels.monthly + " / " + labels.yearly}
          className="relative inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl"
        >
          {/* sliding pill */}
          <span
            aria-hidden
            className={`absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-brand-500 shadow-[0_4px_20px_-4px_rgba(12,122,108,0.7)] transition-transform duration-300 ease-out ${
              yearly
                ? isRtl
                  ? "-translate-x-[calc(100%+0.25rem)]"
                  : "translate-x-[calc(100%+0.25rem)]"
                : "translate-x-0"
            }`}
          />
          <button
            role="tab"
            aria-selected={!yearly}
            onClick={() => setYearly(false)}
            className={`relative z-10 rounded-full px-6 py-2 text-sm font-medium transition-colors ${
              !yearly ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {labels.monthly}
          </button>
          <button
            role="tab"
            aria-selected={yearly}
            onClick={() => setYearly(true)}
            className={`relative z-10 rounded-full px-6 py-2 text-sm font-medium transition-colors ${
              yearly ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {labels.yearly}
          </button>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-300 transition-opacity duration-300 ${
            yearly ? "opacity-100" : "opacity-60"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {labels.saveBadge}
        </span>
      </div>

      {/* ───────── Cards ───────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {tiers.map((t, idx) => {
          const featured = t.recommended || t.popular;
          const price = yearly ? t.priceYearly : t.priceMonthly;
          const href = t.contactSales
            ? t.contactHref
            : yearly
              ? t.hrefYearly
              : t.hrefMonthly;
          return (
            <StaggerItem key={t.slug} index={idx}>
              <HoverCard
                className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border p-6 backdrop-blur-xl transition-all duration-300 ${
                  featured
                    ? "border-gold-500/40 bg-gradient-to-b from-brand-500/[0.14] to-white/[0.02] shadow-[0_8px_44px_-10px_rgba(12,122,108,0.6)] xl:-mt-4 xl:mb-4"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                }`}
              >
                {featured && (
                  <>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/80 to-transparent"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-gold-400/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    />
                    <div className="absolute inset-x-0 -top-0 flex justify-center">
                      <span className="flex items-center gap-1 rounded-b-lg bg-gradient-to-b from-gold-400 to-gold-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-canvas-deep shadow-gold-ring">
                        <Sparkles className="h-3 w-3" />
                        {labels.popularBadge}
                      </span>
                    </div>
                  </>
                )}

                <div className={featured ? "mt-3" : ""}>
                  <h3 className="text-base font-bold text-white">{t.name}</h3>
                  <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-slate-400">
                    {t.tagline}
                  </p>
                </div>

                {/* Price */}
                <div className="my-4 min-h-[4.5rem]">
                  {t.contactSales ? (
                    <div className="flex flex-col">
                      <span className="text-2xl font-bold text-white">
                        {locale === "ar" ? "تسعير مخصّص" : "Custom"}
                      </span>
                      <span className="mt-1 text-xs text-slate-500">
                        {locale === "ar" ? "حسب احتياجك" : "Tailored to you"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <div className="flex items-baseline gap-1">
                        <span className={`metric-xl text-4xl sm:text-5xl ${featured ? "gold-text" : "text-white"}`}>
                          ${price}
                        </span>
                        <span className="text-sm text-slate-500">
                          {yearly ? labels.perYear : labels.perMonth}
                        </span>
                      </div>
                      {yearly && t.savings ? (
                        <span className="mt-1 text-xs text-gold-400">
                          {labels.save.replace("%s", String(t.savings))}
                        </span>
                      ) : (
                        <span className="mt-1 text-xs text-slate-600">
                          {!yearly && t.priceYearly
                            ? labels.billedYearly.replace("%s", String(t.priceYearly))
                            : " "}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mb-5 inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    featured
                      ? "bg-brand-500 text-white hover:bg-brand-400 hover:shadow-[0_6px_24px_-6px_rgba(12,122,108,0.8)]"
                      : "border border-white/15 text-slate-200 hover:border-brand-400/50 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {t.contactSales ? (
                    labels.contactCta
                  ) : (
                    <>
                      <WhatsAppIcon className="h-4 w-4" />
                      {labels.subscribeCta}
                    </>
                  )}
                </a>

                <div className="mb-4 h-px bg-white/[0.06]" />

                {/* Audience */}
                <div className="mb-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    {labels.perfectFor}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.audience.map((a) => (
                      <span
                        key={a}
                        className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <ul className="mt-2 space-y-2 text-[13px]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                      <span className="text-slate-400">{f}</span>
                    </li>
                  ))}
                </ul>
              </HoverCard>
            </StaggerItem>
          );
        })}
      </div>
    </div>
  );
}
