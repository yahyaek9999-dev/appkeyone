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
    <section ref={ref} className="border-y border-white/[0.06] bg-white/[0.012] px-5 py-10">
      <div className="mx-auto max-w-5xl">
        <motion.div
          className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-white/[0.06]"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
          }}
        >
          {stats.map((s: Stat) => (
            <motion.div
              key={s.label}
              className="px-4 text-center"
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] },
                },
              }}
            >
              <div className="text-3xl font-semibold tabular-nums text-white sm:text-[2rem]">
                {s.num}
                {s.unit && (
                  <span className="ms-1 text-sm font-normal text-slate-500">{s.unit}</span>
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
