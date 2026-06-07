"use client";

import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  /** Hue family of the spotlight glow. Brand = emerald, gold = champagne. */
  glow?: "brand" | "gold" | "sky" | "rose";
  /** Spotlight radius in px. */
  radius?: number;
}

const GLOW: Record<NonNullable<GlowCardProps["glow"]>, { spot: string; ring: string }> = {
  brand: { spot: "rgba(47,147,132,0.22)", ring: "rgba(12,122,108,0.55)" },
  gold:  { spot: "rgba(201,162,75,0.20)", ring: "rgba(201,162,75,0.55)" },
  sky:   { spot: "rgba(56,189,248,0.18)", ring: "rgba(56,189,248,0.5)" },
  rose:  { spot: "rgba(244,63,94,0.18)",  ring: "rgba(244,63,94,0.5)" },
};

/**
 * 21st.dev "GlowCard" register — a panel whose border and surface light up under
 * a pointer-tracked spotlight. Adapted to KEYONE's emerald/gold tokens (no purple)
 * and the existing `.surface` glass. The glow rides CSS custom properties so it
 * stays cheap (no per-frame React state on the hot path beyond x/y).
 */
export function GlowCard({ children, className, glow = "brand", radius = 360, ...props }: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const g = GLOW[glow];

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--gy", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      className={cn(
        "surface group relative overflow-hidden transition-transform duration-300 ease-premium",
        "hover:-translate-y-0.5",
        className,
      )}
      style={{ "--gr": `${radius}px` } as React.CSSProperties}
      {...props}
    >
      {/* spotlight wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(var(--gr) circle at var(--gx,50%) var(--gy,50%), ${g.spot}, transparent 65%)`,
        }}
      />
      {/* glowing border that follows the pointer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          opacity: active ? 1 : 0,
          padding: "1px",
          background: `radial-gradient(220px circle at var(--gx,50%) var(--gy,50%), ${g.ring}, transparent 60%)`,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
