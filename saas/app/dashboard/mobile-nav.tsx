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
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-brand-500/10 bg-[#020806]/92 px-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          className="-m-2 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-100 hover:bg-white/10 active:bg-white/10"
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
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85%] flex-col border-l border-brand-500/20 bg-[#020806]/96 shadow-2xl shadow-black/60 backdrop-blur-xl transition-transform duration-200 ease-out md:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-brand-500/10 p-4">
          <span className="font-bold text-lg">القائمة</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق القائمة"
            className="-m-2 rounded-xl p-2 text-slate-300 hover:bg-white/10 active:bg-white/10"
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
