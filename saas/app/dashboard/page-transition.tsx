"use client";
import { usePathname } from "next/navigation";

// Always renders the same <div> wrapper on both server and client — no
// conditional structure that would cause a hydration mismatch. The
// prefers-reduced-motion preference is handled entirely via CSS.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} style={{ animation: "page-enter 0.4s cubic-bezier(0.21,0.47,0.32,0.98) both" }}>
      <style>{`@keyframes page-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.page-transition-root{animation:none}}`}</style>
      <div className="page-transition-root">{children}</div>
    </div>
  );
}
