"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { GlowCard } from "./glow-card";

export interface BentoItem {
  title: string;
  desc: string;
  icon?: React.ReactNode;
}

/**
 * 21st.dev "features-8" bento register — an asymmetric grid where the lead tile
 * spans wide, supporting tiles fill the rest, every cell is a pointer-tracked
 * GlowCard. Replaces the old uniform 3-up feature grid for a custom, designed feel.
 *
 * Layout (lg): a 6-col grid.
 *   row 1: [ lead .......... span 4 ][ tile span 2 ]
 *   row 2: [ tile 2 ][ tile 2 ][ tile 2 ]            (3 × span 2)
 *   row 3: [ tile span 3 ][ tile span 3 ]
 */
const SPANS = [
  "lg:col-span-4",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-3",
  "lg:col-span-3",
];
const GLOWS: Array<"brand" | "gold" | "sky" | "rose"> = ["brand", "gold", "brand", "gold", "brand", "gold"];

export function BentoFeatures({ items, className }: { items: BentoItem[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -100px 0px" });
  const reduced = useReducedMotion();

  return (
    <div
      ref={ref}
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6", className)}
    >
      {items.map((item, i) => {
        const lead = i === 0;
        return (
          <motion.div
            key={i}
            className={cn("sm:col-span-1", SPANS[i % SPANS.length])}
            initial={reduced ? false : { opacity: 0, y: 22 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.55, delay: i * 0.06, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            <GlowCard glow={GLOWS[i % GLOWS.length]} className={cn("h-full", lead ? "p-7 sm:p-9" : "p-6")}>
              {/* Lead tile carries an emerald→gold wash so the grid has a focal point */}
              {lead && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-0"
                  style={{
                    background:
                      "radial-gradient(70% 90% at 0% 0%, rgba(12,122,108,0.16), transparent 60%), radial-gradient(60% 80% at 100% 100%, rgba(201,162,75,0.08), transparent 60%)",
                  }}
                />
              )}
              {item.icon && (
                <div
                  className={cn(
                    "mb-4 inline-flex items-center justify-center rounded-xl ring-1 ring-inset transition-colors",
                    lead
                      ? "h-14 w-14 border border-gold-500/30 bg-gradient-to-b from-brand-500/20 to-brand-700/10 ring-gold-500/10"
                      : "h-10 w-10 border border-white/[0.08] bg-white/[0.03] ring-white/[0.04] group-hover:border-white/[0.16]",
                  )}
                >
                  {item.icon}
                </div>
              )}
              <h3 className={cn("mb-2 font-semibold tracking-[-0.02em] text-white", lead ? "text-xl sm:text-2xl" : "text-[15px]")}>
                {item.title}
              </h3>
              <p className={cn("leading-relaxed text-slate-400", lead ? "text-[15px] sm:max-w-md" : "text-[13px]")}>
                {item.desc}
              </p>
              {lead && (
                <div className="mt-7 h-px w-full bg-gradient-to-r from-gold-500/50 via-white/[0.06] to-transparent" />
              )}
            </GlowCard>
          </motion.div>
        );
      })}
    </div>
  );
}
