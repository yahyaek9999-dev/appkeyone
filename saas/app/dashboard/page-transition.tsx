"use client";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";

/**
 * Global dashboard page transition — CSS keyframe, no framer-motion motion.div.
 * Replacing motion.div eliminates framer-motion's internal useEffect cleanup
 * returning non-function values (TypeError: n is not a function) that React
 * 18.3-canary logs as recoverable errors on every navigation.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prefersReduced = useReducedMotion();

  if (prefersReduced) return <>{children}</>;

  return (
    <div key={pathname} style={{ animation: "page-enter 0.4s cubic-bezier(0.21,0.47,0.32,0.98) both" }}>
      <style>{`@keyframes page-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {children}
    </div>
  );
}
