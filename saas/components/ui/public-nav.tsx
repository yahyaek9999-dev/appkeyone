"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

export default function PublicNav({
  brandName,
  supportWhatsapp,
  current = "home",
  className,
  locale = "ar",
}: PublicNavProps) {
  const [open, setOpen] = useState(false);
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
    <header className={cn("fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6", className)}>
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl border border-white/[0.06] bg-[#020806]/80 px-4 backdrop-blur-xl sm:h-14 sm:px-5">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-white">
          <BrandMark className="h-9 w-9 rounded-xl" iconClassName="h-[18px] w-[18px]" />
          <span className="text-base sm:text-lg">{brandName}</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-200",
                current === "pricing" && item.href === "/pricing" && "text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <LangSwitch current={locale} />
          <Link href="/login" className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:border-white/20 hover:text-white">
            {locale === "ar" ? "تسجيل دخول" : "Log in"}
          </Link>
          <a {...requestProps} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-400">
            <span className="flex items-center gap-1.5">
              <WhatsAppIcon className="h-3.5 w-3.5" />
              {locale === "ar" ? "اطلب حسابك" : "Get started"}
            </span>
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] text-white transition hover:bg-white/[0.06] md:hidden"
          aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
        >
          <Menu className="h-5 w-5" />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(80vw,320px)] flex-col bg-[#020806] border-l border-white/[0.06] shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3 font-bold text-white">
                <BrandMark className="h-9 w-9 rounded-xl" iconClassName="h-[18px] w-[18px]" />
                <span className="text-base">{brandName}</span>
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-4">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="space-y-2 border-t border-white/[0.06] px-4 py-4">
              <div className="flex justify-center pb-1">
                <LangSwitch current={locale} />
              </div>
              <a {...requestProps} onClick={() => setOpen(false)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-400">
                <WhatsAppIcon className="h-4 w-4" />
                {locale === "ar" ? "اطلب حسابك" : "Get started"}
              </a>
              <Link href="/login" onClick={() => setOpen(false)} className="flex w-full items-center justify-center rounded-xl border border-white/[0.08] py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]">
                {locale === "ar" ? "تسجيل دخول" : "Log in"}
              </Link>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </header>
  );
}
