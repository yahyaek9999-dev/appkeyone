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
  colorFrom = "rgba(12,122,108,0.85)",
  colorTo = "rgba(201,162,75,0.3)",
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
