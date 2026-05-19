"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const requestProps = waNum
    ? { href: requestHref, target: "_blank", rel: "noopener noreferrer" }
    : { href: requestHref };

  return (
    <header
      className={cn("fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5", className)}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-[#020806]/78 px-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:h-[72px] sm:px-5">
        <Link
          href="/"
          className="flex items-center gap-3 font-black tracking-tight text-white"
        >
          <BrandMark
            className="h-11 w-11 rounded-2xl"
            iconClassName="h-6 w-6"
          />
          <span className="text-xl leading-none sm:text-2xl">{brandName}</span>
        </Link>

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label={
            locale === "ar" ? "روابط الموقع الرئيسية" : "Main navigation"
          }
        >
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white",
                current === "pricing" &&
                  item.href === "/pricing" &&
                  "bg-white/[0.06] text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LangSwitch current={locale} />
          <Link href="/login" className="ai-btn ai-btn-ghost h-11 px-4 text-sm">
            {locale === "ar" ? "تسجيل دخول" : "Log in"}
          </Link>
          <a
            {...requestProps}
            className="ai-btn ai-btn-primary h-11 px-5 text-sm"
          >
            <WhatsAppIcon className="h-4 w-4" />
            {locale === "ar" ? "اطلب حسابك" : "Get started"}
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08] md:hidden"
          aria-label={locale === "ar" ? "فتح القائمة" : "Open menu"}
          aria-expanded={open}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:hidden"
          aria-label={locale === "ar" ? "إغلاق القائمة" : "Close menu"}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(88vw,360px)] flex-col border-l border-brand-500/20 bg-[#020806]/96 shadow-2xl shadow-black/50 backdrop-blur-xl transition-transform duration-200 md:hidden",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 font-black text-white"
          >
            <BrandMark
              className="h-11 w-11 rounded-2xl"
              iconClassName="h-6 w-6"
            />
            <span className="text-xl">{brandName}</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label={locale === "ar" ? "إغلاق القائمة" : "Close menu"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          className="flex-1 space-y-2 overflow-y-auto p-5"
          aria-label={locale === "ar" ? "قائمة الموبايل" : "Mobile navigation"}
        >
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3.5 text-base font-bold text-slate-100 transition hover:border-brand-500/40 hover:bg-brand-500/10"
            >
              {item.label}
              <span className="h-2 w-2 rounded-full bg-brand-400 shadow-[0_0_14px_rgba(34,197,94,0.9)]" />
            </Link>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-5">
          <div className="flex justify-center pb-1">
            <LangSwitch current={locale} />
          </div>
          <a
            {...requestProps}
            onClick={() => setOpen(false)}
            className="ai-btn ai-btn-primary w-full py-3.5 text-base"
          >
            <WhatsAppIcon className="h-5 w-5" />
            {locale === "ar" ? "اطلب حسابك" : "Get started"}
          </a>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="ai-btn ai-btn-ghost w-full py-3.5 text-base"
          >
            {locale === "ar" ? "تسجيل دخول" : "Log in"}
          </Link>
        </div>
      </aside>
    </header>
  );
}
