"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

type Props = {
  children: React.ReactNode;
  brandName?: string;
};

function currentPageLabel(pathname: string): string | null {
  let best: { href: string; label: string } | null = null;
  for (const n of NAV_ITEMS) {
    if (pathname === n.href || pathname.startsWith(n.href + "/")) {
      if (!best || n.href.length > best.href.length) best = n;
    }
  }
  return best?.label ?? null;
}

export default function MobileNav({ children, brandName = "KEYONE" }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const pageLabel = currentPageLabel(pathname);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <header className="mobile-header md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white touch-target"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-semibold text-white">{brandName}</span>
          {pageLabel && (
            <>
              <span className="text-slate-600">/</span>
              <span className="truncate text-sm text-slate-400">{pageLabel}</span>
            </>
          )}
        </div>
      </header>

      {/* Backdrop — always mounted, visibility controlled by opacity + pointer-events */}
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden",
          "transition-opacity duration-150",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setOpen(false)}
      />

      {/* Slide-in panel — always mounted, slide driven by translateX */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-white/[0.06] bg-canvas-deep shadow-float md:hidden",
          "transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-modal="true"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <span className="text-sm font-semibold text-white">القائمة</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </aside>
    </>
  );
}
