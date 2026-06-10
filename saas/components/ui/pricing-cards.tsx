"use client";

import { Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { StaggerItem, HoverCard } from "@/components/ui/section-reveal";

export type PricingPlan = {
  slug: string;
  name: string;
  nameEn?: string;
  description?: string;
  priceUsd: number;
  yearlyUsd?: number | null;
  highlight?: string | null;
  popular?: boolean;
  features: string[];
  href?: string; // WA subscribe link (full variant)
  yearlyHref?: string; // WA yearly link (full variant)
  yearlyNote?: string; // precomputed on server (no fn props across the boundary)
};

type Labels = {
  perMonth: string;
  subscribeCta?: string;
  yearlyLabel?: string; // e.g. "أو اشترك سنوياً"
};

export default function PricingCards({
  plans,
  labels,
  variant = "full",
  locale = "ar",
}: {
  plans: PricingPlan[];
  labels: Labels;
  variant?: "full" | "preview";
  locale?: "ar" | "en";
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan, idx) => {
        const popular = Boolean(plan.popular);
        const features = variant === "preview" ? plan.features.slice(0, 4) : plan.features;
        return (
          <StaggerItem key={plan.slug} index={idx}>
            <HoverCard
              className={`group relative flex h-full flex-col rounded-2xl p-6 transition-all duration-300 ${
                popular
                  ? "card-elevated border-gold-500/30 shadow-glow-emerald lg:-mt-3 lg:mb-3"
                  : "surface surface-hover border border-white/[0.08]"
              }`}
            >
              {popular && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/70 to-transparent"
                />
              )}
              {plan.highlight && (
                <div className="absolute inset-x-0 -top-3 flex justify-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-3 py-1 text-[11px] font-semibold text-canvas-deep shadow-gold-ring">
                    {plan.highlight}
                  </span>
                </div>
              )}

              {plan.nameEn && variant === "full" && (
                <div className="font-en mb-1 text-xs uppercase tracking-wider text-slate-500">
                  {plan.nameEn}
                </div>
              )}
              <h3 className={`text-lg font-semibold ${popular ? "mt-2" : ""} text-white`}>{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-slate-500">
                  {plan.description}
                </p>
              )}

              <div className="my-5 flex items-baseline gap-1">
                <span className={`metric-xl text-5xl ${popular ? "gold-text" : "text-white"}`}>${plan.priceUsd}</span>
                <span className="text-sm text-slate-500">{labels.perMonth}</span>
              </div>

              {variant === "full" && plan.yearlyNote && (
                <div className="mb-4 text-xs text-emerald-400/80">{plan.yearlyNote}</div>
              )}

              <div className="mb-5 h-px bg-white/[0.06]" />

              <ul className="mb-6 space-y-2.5 text-sm">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                    <span className="text-slate-400">{f}</span>
                  </li>
                ))}
              </ul>

              {variant === "full" && plan.href && (
                <div className="mt-auto">
                  <a
                    href={plan.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      popular
                        ? "bg-brand-500 text-white hover:bg-brand-400"
                        : "border border-white/[0.1] text-slate-300 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {labels.subscribeCta}
                  </a>
                  {plan.yearlyHref && (
                    <a
                      href={plan.yearlyHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block text-center text-xs text-slate-500 transition hover:text-slate-300"
                    >
                      {labels.yearlyLabel}
                    </a>
                  )}
                </div>
              )}
            </HoverCard>
          </StaggerItem>
        );
      })}
    </div>
  );
}
