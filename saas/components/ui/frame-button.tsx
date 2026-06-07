"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FrameButtonProps {
  children: React.ReactNode;
  href: string;
  className?: string;
  variant?: "solid" | "outline";
  external?: boolean;
}

function Corners() {
  // animated L-shaped markers that push outward on hover (21st.dev "frame" register)
  const common = "absolute h-3 w-3 border-brand-300/70 transition-all duration-300 ease-premium";
  return (
    <>
      <span className={cn(common, "left-1 top-1 border-l-2 border-t-2 group-hover:left-0 group-hover:top-0")} />
      <span className={cn(common, "right-1 top-1 border-r-2 border-t-2 group-hover:right-0 group-hover:top-0")} />
      <span className={cn(common, "bottom-1 left-1 border-b-2 border-l-2 group-hover:bottom-0 group-hover:left-0")} />
      <span className={cn(common, "bottom-1 right-1 border-b-2 border-r-2 group-hover:bottom-0 group-hover:right-0")} />
    </>
  );
}

/**
 * 21st.dev "FrameButton" — a CTA framed by four animated corner markers that
 * snap to the edges on hover, with a soft glow bloom. Mapped onto KEYONE's
 * emerald brand. Renders as an anchor (hero CTAs link to WhatsApp / pricing).
 */
export function FrameButton({ children, href, className, variant = "solid", external }: FrameButtonProps) {
  const anchorProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <motion.a
      href={href}
      {...anchorProps}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "group relative inline-flex w-full items-center justify-center gap-2.5 overflow-visible rounded-xl px-8 py-3.5 text-sm font-semibold transition-colors duration-300 sm:w-auto",
        variant === "solid"
          ? "bg-gradient-to-b from-brand-500 to-brand-700 text-white ring-1 ring-inset ring-white/10 hover:from-brand-400 hover:to-brand-600"
          : "border border-white/[0.14] bg-white/[0.04] text-slate-200 backdrop-blur-sm hover:border-white/30 hover:text-white",
        className,
      )}
    >
      {/* glow bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-xl opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-60"
        style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(12,122,108,0.6), transparent 70%)" }}
      />
      <Corners />
      {children}
    </motion.a>
  );
}
