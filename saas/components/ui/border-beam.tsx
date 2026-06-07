"use client";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BorderBeamProps {
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
  delay?: number;
}

export function BorderBeam({
  size = 120,
  duration = 8,
  colorFrom = "rgba(104,114,212,0.8)",
  colorTo = "rgba(162,169,232,0.2)",
  className,
  delay = 0,
}: BorderBeamProps) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]", className)}>
      <motion.div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to right, transparent, ${colorFrom}, ${colorTo}, transparent)`,
          height: "1px",
          width: `${size}px`,
          top: 0,
        }}
        animate={{ left: ["-20%", "120%"] }}
        transition={{
          duration,
          delay,
          ease: "linear",
          repeat: Infinity,
          repeatDelay: 0,
        }}
      />
    </div>
  );
}
