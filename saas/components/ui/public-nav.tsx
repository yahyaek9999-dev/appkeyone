"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import LangSwitch from "@/components/ui/lang-switch";

type PublicNavProps = {
  brandName: string;
  supportWhatsapp?: string | null;
  current?: "home" | "pricing" | "projects" | "auth" | "legal";
  className?: string;
  locale?: Locale;
  variant?: "fixed" | "inline";
};

const LINKS = (locale: Locale) => [
  { href: "/features", label: locale === "ar" ? "المميزات" : "Features" },
  { href: "/#intelligence", label: locale === "ar" ? "طريقة العمل" : "How it works" },
  { href: "/projects", label: locale === "ar" ? "دراسات الحالة" : "Case studies" },
  { href: "/pricing", label: locale === "ar" ? "الأسعار" : "Pricing" },
  { href: "/#faq", label: locale === "ar" ? "الأسئلة" : "FAQ" },
];

export default function PublicNav({
  brandName,
  supportWhatsapp: _supportWhatsapp,
  current = "home",
  className,
  locale = "ar",
  variant = "fixed",
}: PublicNavProps) {
  const [open, setOpen] = useState(false);
  const links = LINKS(locale);
  const signupHref = `/signup${locale === "en" ? "?lang=en" : ""}`;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "flex items-center justify-between py-3.5 sm:py-5",
          variant === "fixed" &&
            "fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-canvas/85 px-4 backdrop-blur-xl sm:px-8",
          className,
        )}
      >
        {/* Logo — start of RTL flex (appears on right) */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label={`${brandName} — الرئيسية`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/wkeyone-logo.png"
            alt={brandName}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full border border-white/[0.12] object-cover shadow-[0_0_28px_rgba(12,122,108,0.2)]"
          />
          <span className="text-[0.78rem] font-semibold tracking-[0.38em] text-white/85 sm:text-[0.85rem]">
            KEYONE
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 text-sm text-slate-400 lg:flex">
          {links.map((item) => {
            const active =
              (current === "pricing" && item.href === "/pricing") ||
              (current === "projects" && item.href === "/projects");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("transition-colors hover:text-white", active ? "text-white" : "text-slate-400")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 lg:flex">
          <LangSwitch current={locale} />
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full px-4 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            {locale === "ar" ? "تسجيل الدخول" : "Log in"}
          </Link>
          <Link
            href={signupHref}
            className="inline-flex h-9 items-center rounded-full bg-white px-5 text-sm font-medium text-canvas transition-colors hover:bg-white/90"
          >
            {locale === "ar" ? "إنشاء حساب" : "Sign up"}
          </Link>
        </div>

        {/* Mobile end — compact login + hamburger */}
        <div className="flex items-center gap-1 lg:hidden">
          <Link
            href="/login"
            className="flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            {locale === "ar" ? "دخول" : "Log in"}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white"
            aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
          >
            <Menu className="h-[22px] w-[22px]" />
          </button>
        </div>
      </header>

      {/* Mobile drawer + backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="drawer"
            initial={{ x: locale === "ar" ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: locale === "ar" ? "100%" : "-100%" }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={cn(
              "fixed inset-y-0 z-[51] flex w-[min(88vw,340px)] flex-col bg-canvas-deep lg:hidden",
              locale === "ar" ? "right-0 border-l border-white/[0.08]" : "left-0 border-r border-white/[0.08]",
            )}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/wkeyone-logo.png"
                  alt={brandName}
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] rounded-full border border-white/[0.10] object-cover"
                />
                <span className="text-[11px] font-semibold tracking-[0.32em] text-white/80">KEYONE</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label={locale === "ar" ? "إغلاق" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer links */}
            <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3">
              {links.map((item) => {
                const active =
                  (current === "pricing" && item.href === "/pricing") ||
                  (current === "projects" && item.href === "/projects");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors",
                      active ? "bg-white/[0.05] text-white" : "text-slate-300 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer footer */}
            <div className="space-y-2 border-t border-white/[0.07] px-4 py-5">
              <div className="flex justify-center pb-2">
                <LangSwitch current={locale} />
              </div>
              <Link
                href={signupHref}
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-full bg-white py-3.5 text-[15px] font-semibold text-canvas transition-colors hover:bg-white/90"
              >
                {locale === "ar" ? "إنشاء حساب مجاني" : "Get started free"}
              </Link>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-full border border-white/[0.10] py-3.5 text-[14px] font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                {locale === "ar" ? "تسجيل الدخول" : "Log in"}
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
