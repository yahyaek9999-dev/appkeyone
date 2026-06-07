"use client";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { SpotlightCard } from "./spotlight-card";

interface FeatureItem {
  title: string;
  desc: string;
  // Pre-rendered icon element (passed from a Server Component as a serializable
  // React node — never the component function itself).
  icon?: React.ReactNode;
}

interface AnimatedFeaturesGridProps {
  items: FeatureItem[];
  className?: string;
  cols?: 2 | 3 | 4;
}

export function AnimatedFeaturesGrid({
  items,
  className,
  cols = 3,
}: AnimatedFeaturesGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px 0px -100px 0px" });

  const gridCols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <motion.div
      ref={ref}
      className={cn("grid gap-4", gridCols[cols], className)}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
      }}
    >
      {items.map((item, idx) => (
        <motion.div
          key={idx}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] },
            },
          }}
        >
          <SpotlightCard className="p-5">
            {item.icon && (
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                {item.icon}
              </div>
            )}
            <h3 className="mb-1.5 text-sm font-semibold text-white">{item.title}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{item.desc}</p>
          </SpotlightCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
