"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { Menu, X } from "lucide-react";
import { BrandMark, WhatsAppIcon } from "@/components/ui/marketing";
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
    setScrolled(v > 16);
  });

  // Lock body scroll while the mobile drawer is open.
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
          backgroundColor: scrolled ? "rgba(2,8,6,0.72)" : "rgba(2,8,6,0)",
          borderColor: scrolled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
        }}
        transition={{ duration: 0.4, ease }}
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border px-3 backdrop-blur-xl sm:px-5",
          scrolled ? "shadow-nav" : "shadow-none",
        )}
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5 font-bold tracking-tight text-white"
        >
          <BrandMark className="h-9 w-9 rounded-xl transition-transform duration-300 ease-out group-hover:scale-105" iconClassName="h-[18px] w-[18px]" />
          <span className="text-base sm:text-lg">{brandName}</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map((item) => {
            const active = current === "pricing" && item.href === "/pricing";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "text-white" : "text-slate-400 hover:text-white",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "absolute inset-x-3 -bottom-0.5 h-px origin-center scale-x-0 bg-gradient-to-r from-transparent via-brand-400/70 to-transparent transition-transform duration-300 ease-out group-hover:scale-x-100",
                    active && "scale-x-100",
                  )}
                />
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <LangSwitch current={locale} />
          <Link
            href="/login"
            className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            {locale === "ar" ? "تسجيل دخول" : "Log in"}
          </Link>
          <motion.a
            {...requestProps}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
          >
            <span className="flex items-center gap-1.5">
              <WhatsAppIcon className="h-3.5 w-3.5" />
              {locale === "ar" ? "اطلب حسابك" : "Get started"}
            </span>
          </motion.a>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] text-white transition hover:bg-white/[0.06] md:hidden"
          aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
        >
          <Menu className="h-5 w-5" />
        </button>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: locale === "ar" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: locale === "ar" ? "-100%" : "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className={cn(
              "fixed inset-y-0 z-50 flex w-[min(82vw,340px)] flex-col bg-canvas-raised shadow-float md:hidden",
              locale === "ar" ? "left-0 border-r border-white/[0.06]" : "right-0 border-l border-white/[0.06]",
            )}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 font-bold text-white"
              >
                <BrandMark className="h-9 w-9 rounded-xl" iconClassName="h-[18px] w-[18px]" />
                <span className="text-base">{brandName}</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label={locale === "ar" ? "إغلاق" : "Close"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-5">
              {links.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: locale === "ar" ? -16 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 + i * 0.05, duration: 0.4, ease }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center rounded-xl px-3 py-3 text-[15px] font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="space-y-2 border-t border-white/[0.06] px-4 py-4">
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
                className="flex w-full items-center justify-center rounded-xl border border-white/[0.08] py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
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
