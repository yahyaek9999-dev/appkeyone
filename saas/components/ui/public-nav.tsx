"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { Menu, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import LangSwitch from "@/components/ui/lang-switch";

type PublicNavProps = {
  brandName: string;
  supportWhatsapp?: string | null;
  current?: "home" | "pricing" | "projects" | "auth" | "legal";
  className?: string;
  locale?: Locale;
};

const LINKS = (locale: Locale) => [
  { href: "/#features", label: locale === "ar" ? "المميزات" : "Features" },
  { href: "/#how", label: locale === "ar" ? "طريقة العمل" : "How it works" },
  { href: "/projects", label: locale === "ar" ? "مشاريعنا" : "Case studies" },
  { href: "/pricing", label: locale === "ar" ? "الأسعار" : "Pricing" },
  { href: "/#faq", label: locale === "ar" ? "الأسئلة" : "FAQ" },
];

const ease = [0.16, 1, 0.3, 1] as const;

export default function PublicNav({
  brandName,
  supportWhatsapp,
  current = "home",
  className,
  locale = "ar",
}: PublicNavProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => {
    setScrolled(v > 24);
  });

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const waNum = (supportWhatsapp || "").replace(/[^\d]/g, "");
  const requestHref = waNum
    ? `https://wa.me/${waNum}?text=${encodeURIComponent(
        locale === "ar"
          ? `أريد طلب حساب جديد في ${brandName}`
          : `I'd like to subscribe to ${brandName}`,
      )}`
    : `/pricing${locale === "en" ? "?lang=en" : ""}`;

  const links = LINKS(locale);
  const requestProps = waNum
    ? { href: requestHref, target: "_blank", rel: "noopener noreferrer" }
    : { href: requestHref };

  // The sliding highlight marks the current page and glides to the hovered link
  // (Linear-style). Falls back to the active page when the pointer leaves.
  const activeHref =
    current === "pricing" ? "/pricing" : current === "projects" ? "/projects" : null;
  const highlight = hovered ?? activeHref;

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 px-4 pt-3.5 sm:px-6 sm:pt-5", className)}>
      <motion.nav
        initial={false}
        animate={{
          backgroundColor: scrolled ? "rgba(10,10,12,0.85)" : "rgba(10,10,12,0.34)",
          borderColor: scrolled ? "rgba(201,162,75,0.20)" : "rgba(255,255,255,0.10)",
          boxShadow: scrolled
            ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 44px -10px rgba(0,0,0,0.75)"
            : "inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 34px -14px rgba(0,0,0,0.55)",
        }}
        transition={{ duration: 0.4, ease }}
        className="mx-auto flex h-[66px] max-w-6xl items-center justify-between gap-3 rounded-2xl border px-3 backdrop-blur-2xl backdrop-saturate-150 sm:px-4"
      >
        {/* Logo */}
        <Link
          href="/"
          className="group flex shrink-0 items-center rounded-xl ps-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          aria-label={brandName}
        >
          <div className="relative h-11 w-24 overflow-hidden">
            <Image
              src="/logo.png"
              alt={brandName}
              fill
              quality={100}
              className="object-contain object-left drop-shadow-[0_0_12px_rgba(201,162,75,0.28)] transition-all duration-300 group-hover:drop-shadow-[0_0_16px_rgba(201,162,75,0.4)]"
              priority
            />
          </div>
        </Link>

        {/* Desktop nav links — centered group with a shared sliding pill */}
        <div
          className="hidden flex-1 items-center justify-center gap-0.5 lg:flex"
          onMouseLeave={() => setHovered(null)}
        >
          {links.map((item) => {
            const lit = highlight === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHovered(item.href)}
                className={cn(
                  "relative rounded-lg px-3.5 py-2 text-[13.5px] font-medium tracking-tight transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                  lit ? "text-white" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {lit && (
                  <motion.span
                    layoutId="nav-pill"
                    aria-hidden
                    className="absolute inset-0 -z-10 rounded-lg bg-white/[0.08] ring-1 ring-inset ring-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Desktop actions */}
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <LangSwitch current={locale} />

          <Link
            href="/login"
            className="rounded-lg px-3.5 py-2 text-[13.5px] font-medium text-slate-300 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {locale === "ar" ? "تسجيل دخول" : "Log in"}
          </Link>

          <motion.a
            {...requestProps}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-700 px-5 text-sm font-semibold text-white shadow-[0_2px_14px_-2px_rgba(12,122,108,0.55)] ring-1 ring-inset ring-white/15 transition-all hover:from-brand-400 hover:to-brand-600 hover:shadow-[0_6px_22px_-4px_rgba(12,122,108,0.7)] hover:ring-gold-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <WhatsAppIcon className="h-4 w-4" />
            {locale === "ar" ? "اطلب حسابك" : "Get started"}
          </motion.a>
        </div>

        {/* Mobile menu button — bordered glass surface */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-slate-200 transition-colors hover:border-gold-500/30 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas lg:hidden"
          aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
        >
          <Menu className="h-5 w-5" />
        </button>
      </motion.nav>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: locale === "ar" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: locale === "ar" ? "-100%" : "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className={cn(
              "fixed inset-y-0 z-50 flex w-[min(84vw,340px)] flex-col bg-canvas/95 shadow-[0_0_60px_-12px_rgba(0,0,0,0.8)] backdrop-blur-2xl backdrop-saturate-150 lg:hidden",
              locale === "ar"
                ? "left-0 border-r border-white/[0.08]"
                : "right-0 border-l border-white/[0.08]",
            )}
          >
            {/* Gold hairline along the open edge */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0 w-px bg-gradient-to-b from-gold-500/40 via-gold-500/10 to-transparent",
                locale === "ar" ? "right-0" : "left-0",
              )}
            />
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="relative h-10 w-[76px]"
                aria-label={brandName}
              >
                <Image
                  src="/logo.png"
                  alt={brandName}
                  fill
                  quality={100}
                  className="object-contain object-left drop-shadow-[0_0_10px_rgba(201,162,75,0.25)]"
                />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch-target inline-flex items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] text-slate-300 transition hover:border-gold-500/30 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50"
                aria-label={locale === "ar" ? "إغلاق" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer links */}
            <nav className="flex-1 space-y-1 px-3 py-5">
              {links.map((item, i) => {
                const active =
                  (current === "pricing" && item.href === "/pricing") ||
                  (current === "projects" && item.href === "/projects");
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: locale === "ar" ? -12 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.04, duration: 0.35, ease }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center rounded-xl px-4 py-3 text-[15px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50",
                        active
                          ? "bg-white/[0.06] text-white ring-1 ring-inset ring-gold-500/15"
                          : "text-slate-300 hover:bg-white/[0.05] hover:text-white",
                      )}
                    >
                      {item.label}
                    </Link>
                  </motion.div>
                );
              })}
            </nav>

            {/* Drawer footer */}
            <div className="space-y-2.5 border-t border-white/[0.07] px-4 py-5">
              <div className="flex justify-center pb-1">
                <LangSwitch current={locale} />
              </div>
              <a
                {...requestProps}
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-700 py-3.5 text-sm font-semibold text-white shadow-[0_2px_14px_-2px_rgba(12,122,108,0.55)] ring-1 ring-inset ring-white/15 transition-all hover:from-brand-400 hover:to-brand-600 hover:ring-gold-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {locale === "ar" ? "اطلب حسابك" : "Get started"}
              </a>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-xl border border-white/[0.10] py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50"
              >
                {locale === "ar" ? "تسجيل دخول" : "Log in"}
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </header>
  );
}
