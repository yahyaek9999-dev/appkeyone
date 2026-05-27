import Link from "next/link";
import { Phone } from "lucide-react";
import { BrandMark } from "@/components/ui/marketing";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

type FooterLocale = {
  product: string;
  features: string;
  pricing: string;
  faq: string;
  company: string;
  terms: string;
  privacy: string;
  contact: string;
  whatsapp: string;
  login: string;
  copyright: string;
};

type FooterConfig = {
  brandName: string;
  brandTagline?: string | null;
  supportWhatsapp?: string | null;
  supportEmail?: string | null;
};

export function PublicFooter({
  locale = "ar",
  m,
  cfg,
  className,
}: {
  locale?: Locale;
  m: FooterLocale;
  cfg: FooterConfig;
  className?: string;
}) {
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");

  return (
    <footer className={cn("border-t border-white/[0.06] px-5 py-16", className)}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="mb-3 flex items-center gap-2 font-bold text-white">
            <BrandMark className="h-9 w-9 rounded-xl" iconClassName="h-[18px] w-[18px]" />
            <span className="text-base">{cfg.brandName}</span>
          </div>
          {cfg.brandTagline && (
            <p className="text-xs leading-relaxed text-slate-500">
              {cfg.brandTagline}
            </p>
          )}
        </div>
        <div>
          <div className="mb-4 text-sm font-semibold text-slate-200">
            {m.product}
          </div>
          <ul className="space-y-2.5 text-sm text-slate-500">
            <li>
              <a href="/#features" className="transition hover:text-slate-200">
                {m.features}
              </a>
            </li>
            <li>
              <Link href="/pricing" className="transition hover:text-slate-200">
                {m.pricing}
              </Link>
            </li>
            <li>
              <a href="/#faq" className="transition hover:text-slate-200">
                {m.faq}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="mb-4 text-sm font-semibold text-slate-200">
            {m.company}
          </div>
          <ul className="space-y-2.5 text-sm text-slate-500">
            <li>
              <Link href="/terms" className="transition hover:text-slate-200">
                {m.terms}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="transition hover:text-slate-200">
                {m.privacy}
              </Link>
            </li>
            {cfg.supportEmail && (
              <li>
                <a href={`mailto:${cfg.supportEmail}`} className="transition hover:text-slate-200">
                  {cfg.supportEmail}
                </a>
              </li>
            )}
          </ul>
        </div>
        <div>
          <div className="mb-4 text-sm font-semibold text-slate-200">
            {m.contact}
          </div>
          <ul className="space-y-2.5 text-sm text-slate-500">
            {waNum && (
              <li>
                <a
                  href={`https://wa.me/${waNum}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition hover:text-slate-200"
                >
                  <Phone className="h-3 w-3" /> {m.whatsapp}
                </a>
              </li>
            )}
            <li>
              <Link href="/login" className="transition hover:text-slate-200">
                {m.login}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-6xl border-t border-white/[0.06] pt-6 text-center text-xs text-slate-600">
        &copy; {new Date().getFullYear()} {cfg.brandName}. {m.copyright}
      </div>
    </footer>
  );
}
