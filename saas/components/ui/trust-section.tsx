"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { SectionReveal } from "@/components/ui/section-reveal";

type Badge = { title: string; desc: string };
type Metric = { value: string; unit: string; label: string };

type TrustContent = {
  eyebrow: string;
  heading: string;
  subheading: string;
  chips: readonly string[];
  badges: readonly Badge[];
  metrics: readonly Metric[];
};

const ease = [0.16, 1, 0.3, 1] as const;

// Icons map to the four real trust badges, in order.
const BADGE_ICONS = [Activity, ShieldCheck, Sparkles, Workflow];

export default function TrustSection({
  m,
  dir = "rtl",
}: {
  m: TrustContent;
  dir?: "rtl" | "ltr";
}) {
  const reduce = useReducedMotion();

  return (
    <section className="ai-section noise" id="trust">
      <div className="ai-container">
        <SectionReveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="eyebrow mb-4 inline-block">{m.eyebrow}</span>
            <h2 className="display-heading text-3xl sm:text-4xl">{m.heading}</h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              {m.subheading}
            </p>
          </div>
        </SectionReveal>

        {/* Capability chips — honest list of real capabilities */}
        <SectionReveal index={1}>
          <div className="mx-auto mb-12 flex max-w-4xl flex-wrap items-center justify-center gap-2.5">
            {m.chips.map((chip, i) => (
              <motion.span
                key={chip}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.04, ease }}
                className="chip"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400/80" />
                {chip}
              </motion.span>
            ))}
          </div>
        </SectionReveal>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Trust badges */}
          <div className="grid gap-4 sm:grid-cols-2">
            {m.badges.map((b, i) => {
              const Icon = BADGE_ICONS[i % BADGE_ICONS.length];
              return (
                <SectionReveal key={b.title} index={i}>
                  <div className="surface surface-hover h-full p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-[15px] font-semibold text-white">{b.title}</div>
                    <div className="mt-1 text-sm leading-relaxed text-slate-400">{b.desc}</div>
                  </div>
                </SectionReveal>
              );
            })}
          </div>

          {/* Metric tiles — values reused from existing stats, no invented totals */}
          <SectionReveal index={2}>
            <div className="surface noise grid h-full grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.04] lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-white/[0.06]">
              {m.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="relative bg-[#040b08] p-5 text-center lg:py-4"
                >
                  <div className="text-3xl font-bold tabular-nums text-white">
                    {metric.value}
                    {metric.unit && (
                      <span className="ms-1 text-sm font-normal text-slate-500">{metric.unit}</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{metric.label}</div>
                </div>
              ))}
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
