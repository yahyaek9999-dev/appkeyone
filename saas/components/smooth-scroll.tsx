"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

/**
 * Lenis smooth-scroll provider.
 * Wraps the app with smooth scrolling, handles anchor-link interception,
 * and cleans up on unmount.
 */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Respect users who prefer reduced motion — skip momentum smooth-scroll
    // entirely (vestibular safety / WCAG 2.3.3). Native scrolling still works.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    lenisRef.current = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Intercept anchor link clicks for smooth scroll.
    function handleClick(e: MouseEvent) {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='/#']");
      if (!link) return;
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -80, duration: 1.4 });
    }
    document.addEventListener("click", handleClick);

    return () => {
      lenis.destroy();
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return <>{children}</>;
}
