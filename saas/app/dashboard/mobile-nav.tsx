"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

type Props = {
  pageTitle?: string;
  children: React.ReactNode; // the <nav> markup
};

/**
 * Mobile-only nav drawer.
 *
 * - On `< md`: renders a sticky top bar (hamburger + page title) and a slide-in
 *   drawer when the hamburger is tapped. Tapping the backdrop closes it.
 * - On `md+`: returns null; the desktop sidebar in dashboard/layout.tsx is shown
 *   instead (we hide this component with `md:hidden`).
 *
 * Auto-closes on route change so users don't see a stale open drawer after
 * navigating from a link inside it.
 */
export default function MobileNav({ pageTitle, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open (prevents background scroll on iOS).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Sticky mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-slate-950/95 backdrop-blur border-b border-white/5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          className="p-2 -m-2 rounded-lg hover:bg-white/5 active:bg-white/10 text-slate-200"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="font-bold text-base truncate flex-1">
          {pageTitle || "ذكاء"}
        </div>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`md:hidden fixed inset-y-0 right-0 z-50 w-72 max-w-[85%] bg-slate-950 border-l border-white/10 shadow-2xl transition-transform duration-200 ease-out flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <span className="font-bold text-lg">القائمة</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
            className="p-2 -m-2 rounded-lg hover:bg-white/5 active:bg-white/10 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}
