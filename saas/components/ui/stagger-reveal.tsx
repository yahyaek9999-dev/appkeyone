"use client";
import { createContext, useContext, useRef, useState, useEffect } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

interface StaggerRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  direction?: "up" | "down" | "left" | "right";
  once?: boolean;
}

const CSS_OFFSETS: Record<string, string> = {
  up: "translateY(24px)",
  down: "translateY(-24px)",
  left: "translateX(24px)",
  right: "translateX(-24px)",
};

interface StaggerCtx {
  inView: boolean;
  stagger: number;
  baseDelay: number;
  nextIndex: () => number;
}

const StaggerContext = createContext<StaggerCtx | null>(null);

export function StaggerReveal({
  children,
  className,
  delay = 0,
  stagger = 0.08,
  once = true,
}: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const prefersReduced = useReducedMotion();
  const counterRef = useRef(0);

  // Reset per render so children receive monotonically increasing indices
  // on each render pass. Ref mutation in render body is safe — no re-render triggered.
  counterRef.current = 0;

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsInView(false);
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, prefersReduced]);

  if (prefersReduced) return <div className={className}>{children}</div>;

  return (
    <StaggerContext.Provider
      value={{ inView: isInView, stagger, baseDelay: delay, nextIndex: () => counterRef.current++ }}
    >
      <div ref={ref} className={className}>
        {children}
      </div>
    </StaggerContext.Provider>
  );
}

export function StaggerItem({
  children,
  className,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  direction?: "up" | "down" | "left" | "right";
}) {
  const ctx = useContext(StaggerContext);
  const prefersReduced = useReducedMotion();
  const myIndex = useRef<number | null>(null);

  // Claim index once at first render; never again (stable across re-renders).
  if (myIndex.current === null && ctx) {
    myIndex.current = ctx.nextIndex();
  }

  if (prefersReduced || !ctx) return <div className={className}>{children}</div>;

  const delay = ctx.baseDelay + (myIndex.current ?? 0) * ctx.stagger;

  return (
    <div
      className={className}
      style={{
        opacity: ctx.inView ? 1 : 0,
        transform: ctx.inView ? "none" : CSS_OFFSETS[direction],
        transition: `opacity 0.55s ${delay}s cubic-bezier(0.21,0.47,0.32,0.98), transform 0.55s ${delay}s cubic-bezier(0.21,0.47,0.32,0.98)`,
      }}
    >
      {children}
    </div>
  );
}

export function FadeInView({
  children,
  className,
  delay = 0,
  direction = "up",
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setIsInView(false);
          }
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, prefersReduced]);

  if (prefersReduced) return <div className={cn(className)}>{children}</div>;

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translate(0,0)" : CSS_OFFSETS[direction],
        transition: `opacity 0.6s ${delay}s cubic-bezier(0.21,0.47,0.32,0.98), transform 0.6s ${delay}s cubic-bezier(0.21,0.47,0.32,0.98)`,
      }}
    >
      {children}
    </div>
  );
}
