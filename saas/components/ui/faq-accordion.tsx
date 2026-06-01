"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";

type FaqItem = { q: string; a: string };

const ease = [0.16, 1, 0.3, 1] as const;

export default function FaqAccordion({ items }: { items: readonly FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start transition-colors hover:bg-white/[0.02] sm:px-6 sm:py-5"
            >
              <span className="text-[15px] font-medium text-white">{item.q}</span>
              <motion.span
                animate={reduce ? undefined : { rotate: isOpen ? 45 : 0 }}
                transition={{ duration: 0.3, ease }}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isOpen
                    ? "border-brand-500/40 bg-brand-500/10 text-brand-300"
                    : "border-white/10 text-slate-400"
                }`}
              >
                <Plus className="h-4 w-4" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.36, ease }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm leading-relaxed text-slate-400 sm:px-6">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
