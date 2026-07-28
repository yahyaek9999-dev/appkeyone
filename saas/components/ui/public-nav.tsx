"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import LangSwitch from "@/components/ui/lang-switch";

type PublicNavProps = {
  brandName: string;
  supportWhatsapp?: string | null;
  current?: "home" | "pricing" | "projects" | "auth" | "legal";
  className?: string;
  locale?: Locale;
  /** "inline" = flows inside the hero (landing page); "fixed" = sticky top bar */
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
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-6 py-4 sm:py-5",
        variant === "fixed" && "fixed inset-x-0 top-0 z-50 bg-canvas/80 px-6 backdrop-blur-xl sm:px-8",
        className,
      )}
    >
      {/* Logo */}
      <Link
        href="/"
        className="flex shrink-0 items-center gap-3"
        aria-label={locale === "ar" ? `${brandName} — الرئيسية` : `${brandName} home`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/wkeyone-logo.png"
          alt={brandName}
          width={44}
          height={44}
          className="h-11 w-11 rounded-full border border-white/[0.12] object-cover shadow-[0_0_36px_rgba(12,122,108,0.22)] sm:h-12 sm:w-12"
        />
        <span className="text-[0.8rem] font-medium tracking-[0.42em] text-white/88 sm:text-[0.88rem]">
          KEYONE
        </span>
      </Link>

      {/* Desktop nav links */}
      <nav
        aria-label="Primary"
        className="hidden items-center gap-8 text-sm text-slate-400 lg:flex"
      >
        {links.map((item) => {
          const active =
            (current === "pricing" && item.href === "/pricing") ||
            (current === "projects" && item.href === "/projects");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "transition-colors hover:text-white",
                active ? "text-white" : "text-slate-400",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop actions */}
      <div className="hidden items-center gap-2 sm:gap-3 lg:flex">
        {/* Language switch */}
        <LangSwitch current={locale} />

        {/* Log in */}
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-full px-4 text-sm text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
        >
          {locale === "ar" ? "تسجيل الدخول" : "Log in"}
        </Link>

        {/* Sign up — solid pill */}
        <Link
          href={signupHref}
          className="inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-medium text-canvas transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
        >
          {locale === "ar" ? "إنشاء حساب" : "Sign up"}
        </Link>
      </div>

      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 lg:hidden"
        aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      {open && (
        <aside
          className={cn(
            "fixed inset-y-0 z-50 flex w-[min(80vw,320px)] flex-col bg-canvas lg:hidden",
            locale === "ar"
              ? "left-0 border-r border-white/[0.07]"
              : "right-0 border-l border-white/[0.07]",
          )}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/wkeyone-logo.png"
                alt={brandName}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full border border-white/[0.10] object-cover"
              />
              <span className="text-xs font-medium tracking-[0.38em] text-white/80">KEYONE</span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="touch-target inline-flex items-center justify-center rounded-lg p-1.5 text-slate-500 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              aria-label={locale === "ar" ? "إغلاق" : "Close"}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer links */}
          <nav className="flex-1 space-y-0.5 px-3 py-4">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center rounded-xl px-4 py-3 text-[15px] font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Drawer footer */}
          <div className="space-y-2 border-t border-white/[0.07] px-4 py-5">
            <div className="flex justify-center pb-1">
              <LangSwitch current={locale} />
            </div>
            <Link
              href={signupHref}
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-canvas transition hover:bg-white/90"
            >
              {locale === "ar" ? "إنشاء حساب" : "Sign up"}
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center rounded-full border border-white/[0.12] py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              {locale === "ar" ? "تسجيل الدخول" : "Log in"}
            </Link>
          </div>
        </aside>
      )}
    </header>
  );
}
