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
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <span className="eyebrow mb-4 inline-block">{m.eyebrow}</span>
            <h2 className="section-heading">{m.heading}</h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              {m.subheading}
            </p>
          </div>
        </SectionReveal>

        {/* Metric showcase — the centerpiece. Large champagne numerals on a
            single elevated band, gold hairline columns. */}
        <SectionReveal index={1}>
          <div className="card-elevated mb-14 grid grid-cols-2 gap-y-9 px-4 py-10 sm:grid-cols-4 sm:px-6">
            {m.metrics.map((metric, i) => (
              <div
                key={metric.label}
                className={`px-4 text-center ${i > 0 ? "sm:border-s sm:border-white/[0.07]" : ""}`}
              >
                <div className="metric-xl gold-text text-4xl sm:text-5xl">
                  {metric.value}
                  {metric.unit && (
                    <span className="ms-1 text-sm font-normal text-slate-500">{metric.unit}</span>
                  )}
                </div>
                <div className="mt-2.5 text-xs leading-snug text-slate-400">{metric.label}</div>
              </div>
            ))}
          </div>
        </SectionReveal>

        {/* Capability chips — honest list of real capabilities */}
        <SectionReveal index={2}>
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

        {/* Trust badges */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {m.badges.map((b, i) => {
            const Icon = BADGE_ICONS[i % BADGE_ICONS.length];
            return (
              <SectionReveal key={b.title} index={i}>
                <div className="surface surface-hover h-full p-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gold-500/25 bg-gradient-to-b from-brand-500/15 to-brand-700/10 text-brand-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-[15px] font-semibold text-white">{b.title}</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-slate-400">{b.desc}</div>
                </div>
              </SectionReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
