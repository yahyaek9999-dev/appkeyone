"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { SectionReveal, Parallax } from "@/components/ui/section-reveal";

type IntegrationsContent = {
  eyebrow: string;
  heading: string;
  subheading: string;
  points: readonly string[];
  chatName: string;
  chatStatus: string;
  chatBubbleIn: string;
  chatBubbleOut: string;
};

const ease = [0.16, 1, 0.3, 1] as const;

export default function IntegrationsWhatsApp({
  m,
  dir = "rtl",
}: {
  m: IntegrationsContent;
  dir?: "rtl" | "ltr";
}) {
  const reduce = useReducedMotion();

  return (
    <section className="ai-section border-y border-white/[0.06] bg-white/[0.012]">
      <div className="ai-container">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <SectionReveal>
            <div className="max-w-xl">
              <span className="eyebrow mb-4 inline-flex items-center gap-2">
                <WhatsAppIcon className="h-3.5 w-3.5 text-brand-400" />
                {m.eyebrow}
              </span>
              <h2 className="display-heading text-3xl sm:text-4xl">{m.heading}</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
                {m.subheading}
              </p>

              <ul className="mt-8 space-y-4">
                {m.points.map((point, i) => (
                  <motion.li
                    key={point}
                    initial={reduce ? false : { opacity: 0, x: dir === "rtl" ? 14 : -14 }}
                    whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, delay: i * 0.08, ease }}
                    className="flex items-start gap-3"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-300">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-sm leading-relaxed text-slate-300">{point}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </SectionReveal>

          {/* WhatsApp chat panel */}
          <SectionReveal index={1}>
            <Parallax speed={26} className="relative mx-auto w-full max-w-sm">
              {/* soft halo */}
              <div className="absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_50%_30%,rgba(34,197,94,0.12),transparent_65%)]" aria-hidden="true" />

              <div className="surface relative overflow-hidden rounded-[1.75rem] shadow-float">
                {/* header */}
                <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25">
                    <WhatsAppIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{m.chatName}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-brand-300/90">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
                      {m.chatStatus}
                    </div>
                  </div>
                </div>

                {/* messages */}
                <div className="space-y-3 px-4 py-5">
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.15, ease }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[80%] rounded-2xl rounded-ss-sm border border-white/[0.06] bg-white/[0.05] px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-200">
                      {m.chatBubbleIn}
                    </div>
                  </motion.div>

                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.45, ease }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[82%] rounded-2xl rounded-se-sm bg-brand-500/90 px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-[0_8px_24px_-10px_rgba(34,197,94,0.6)]">
                      {m.chatBubbleOut}
                    </div>
                  </motion.div>
                </div>

                {/* input affordance */}
                <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-3">
                  <div className="h-9 flex-1 rounded-full border border-white/[0.06] bg-white/[0.03]" />
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white">
                    <WhatsAppIcon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </Parallax>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
