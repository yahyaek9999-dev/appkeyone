"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

interface Stat {
  num: string;
  unit?: string;
  label: string;
}

export default function AnimatedStatsSection({ stats }: { stats: readonly Stat[] }) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px 0px -60px 0px" });

  return (
    <section ref={ref} className="relative z-20 -mt-8 bg-black px-5 pb-12 sm:-mt-10">
      {/* Floating premium band — lifts off the hero, gold hairline columns,
          champagne-gradient numerals. The "scroll into the product" moment. */}
      <motion.div
        className="card-elevated mx-auto grid max-w-5xl grid-cols-2 gap-y-8 px-4 py-9 sm:grid-cols-4 sm:px-6 sm:py-10"
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
        }}
      >
        {stats.map((s: Stat, i: number) => (
          <motion.div
            key={s.label}
            className={`px-4 text-center ${i > 0 ? "sm:border-s sm:border-white/[0.07]" : ""}`}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] },
              },
            }}
          >
            <div className="metric-xl gold-text text-4xl sm:text-5xl">
              {s.num}
              {s.unit && (
                <span className="ms-1 text-sm font-normal text-slate-500">{s.unit}</span>
              )}
            </div>
            <div className="mt-2.5 text-xs leading-snug text-slate-400">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
