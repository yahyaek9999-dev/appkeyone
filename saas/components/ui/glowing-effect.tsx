"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowingEffectProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  strength?: "sm" | "md" | "lg";
  disabled?: boolean;
}

const STRENGTHS = {
  sm: "0 0 20px 0px",
  md: "0 0 40px 0px",
  lg: "0 0 70px 0px",
};

export function GlowingEffect({
  children,
  className,
  glowColor = "rgba(104,114,212,0.35)",
  strength = "md",
  disabled = false,
}: GlowingEffectProps) {
  if (disabled) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn("relative", className)}
      whileHover={{
        filter: `drop-shadow(${STRENGTHS[strength]} ${glowColor})`,
      }}
      initial={{ filter: "drop-shadow(0 0 0px transparent)" }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

interface PulseGlowProps {
  className?: string;
  color?: string;
  size?: number;
}

export function PulseGlow({ className, color = "rgba(104,114,212,0.4)", size = 300 }: PulseGlowProps) {
  return (
    <motion.div
      className={cn("pointer-events-none absolute rounded-full blur-[80px]", className)}
      style={{
        width: size,
        height: size,
        background: color,
        transform: "translate(-50%, -50%)",
      }}
      animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.95, 1.05, 0.95] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
