"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      {/* ── Mobile top header ────────────────────────────────────────── */}
      <header className="mobile-header md:hidden">
        {/* Hamburger — appears on RIGHT in RTL (first flex child) */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <Menu className="h-[22px] w-[22px]" />
        </button>

        {/* Brand identity — appears on LEFT in RTL (last flex child) */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
          <div className="min-w-0 text-end">
            <div className="text-[13px] font-semibold leading-tight text-white">{brandName}</div>
            {pageLabel && (
              <div className="truncate text-[11px] leading-tight text-slate-500">{pageLabel}</div>
            )}
          </div>
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/[0.12] shadow-[0_0_14px_rgba(12,122,108,0.25)]">
            <Image
              src="/wkeyone-logo.png"
              alt={brandName}
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </header>

      {/* ── Backdrop ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] md:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Drawer — slides from RIGHT (RTL start) ─────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(80vw,280px)] flex-col border-l border-white/[0.07] bg-canvas-deep shadow-[−20px_0_60px_rgba(0,0,0,0.5)] md:hidden"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق القائمة"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-semibold tracking-[0.28em] text-white/80">
                  {brandName}
                </span>
                <div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/[0.12] shadow-[0_0_12px_rgba(12,122,108,0.22)]">
                  <Image
                    src="/wkeyone-logo.png"
                    alt={brandName}
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Drawer content (nav links injected by parent) */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
