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
  current?: "home" | "pricing" | "auth" | "legal";
  className?: string;
  locale?: Locale;
};

const LINKS = (locale: Locale) => [
  { href: "/#features", label: locale === "ar" ? "المميزات" : "Features" },
  { href: "/#how", label: locale === "ar" ? "طريقة العمل" : "How it works" },
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

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6 sm:pt-4", className)}>
      <motion.nav
        initial={false}
        animate={{
          backgroundColor: scrolled ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0)",
          borderColor: scrolled ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0)",
          boxShadow: scrolled
            ? "0 1px 0 0 rgba(255,255,255,0.04), 0 8px 32px -8px rgba(0,0,0,0.6)"
            : "none",
        }}
        transition={{ duration: 0.35, ease }}
        className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl border px-4 backdrop-blur-2xl sm:px-6"
      >
        {/* Logo */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-3"
        >
          <div className="relative h-9 w-[64px] overflow-hidden">
            <Image
              src="/logo.png"
              alt={brandName}
              fill
              quality={100}
              className="object-contain object-left drop-shadow-[0_0_8px_rgba(104,114,212,0.25)] transition-opacity duration-300 group-hover:opacity-90"
              priority
            />
          </div>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-0.5 md:flex">
          {links.map((item) => {
            const active = current === "pricing" && item.href === "/pricing";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "text-white"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-4 -bottom-0.5 h-px bg-gradient-to-r from-transparent via-brand-400/60 to-transparent" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2.5 lg:flex">
          <LangSwitch current={locale} />

          <Link
            href="/login"
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 transition-colors duration-200 hover:text-slate-100"
          >
            {locale === "ar" ? "تسجيل دخول" : "Log in"}
          </Link>

          <motion.a
            {...requestProps}
            whileHover={{ y: -1, boxShadow: "0 4px 20px rgba(104,114,212,0.3)" }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-brand-400"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            {locale === "ar" ? "اطلب حسابك" : "Get started"}
          </motion.a>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
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
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
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
              "fixed inset-y-0 z-50 flex w-[min(80vw,320px)] flex-col bg-black md:hidden",
              locale === "ar"
                ? "left-0 border-r border-white/[0.07]"
                : "right-0 border-l border-white/[0.07]",
            )}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="relative h-8 w-[56px]"
              >
                <Image
                  src="/logo.png"
                  alt={brandName}
                  fill
                  quality={100}
                  className="object-contain object-left"
                />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 transition hover:text-white"
                aria-label={locale === "ar" ? "إغلاق" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer links */}
            <nav className="flex-1 space-y-0.5 px-3 py-4">
              {links.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: locale === "ar" ? -12 : 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.04, duration: 0.35, ease }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center rounded-xl px-4 py-3 text-[15px] font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            {/* Drawer footer */}
            <div className="space-y-2 border-t border-white/[0.07] px-4 py-5">
              <div className="flex justify-center pb-1">
                <LangSwitch current={locale} />
              </div>
              <a
                {...requestProps}
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-400"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {locale === "ar" ? "اطلب حسابك" : "Get started"}
              </a>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-xl border border-white/[0.08] py-3 text-sm font-medium text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
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
