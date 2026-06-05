import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";
import { AmbientBackdrop } from "@/components/ui/marketing";
import { PublicFooter } from "@/components/ui/public-footer";
import { getLocale, t } from "@/lib/i18n";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { SectionReveal } from "@/components/ui/section-reveal";
import PricingCards, { type PricingPlan } from "@/components/ui/pricing-cards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "الأسعار والباقات",
  description: "اختر الباقة المناسبة لحجم أعمالك. خطط مرنة بالدولار، بدون رسوم خفية.",
};

async function getData() {
  const [plans, cfg] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    getSiteConfig(),
  ]);
  return { plans, cfg };
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale = getLocale(searchParams.lang);
  const m = t(locale);

  const { plans, cfg } = await getData();
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");

  function waLink(planName: string, priceUsd: number, yearly = false) {
    const cycleText = yearly
      ? locale === "ar" ? "سنوي" : "yearly"
      : locale === "ar" ? "شهري" : "monthly";
    const text = encodeURIComponent(
      locale === "ar"
        ? `مرحباً ${cfg.brandName} 👋\nأريد الاشتراك في باقة *${planName}* (${cycleText}) — $${priceUsd}\nأرجو إرشادي بطريقة الدفع وتفعيل الاشتراك.`
        : `Hello ${cfg.brandName} 👋\nI'd like to subscribe to the *${planName}* plan (${cycleText}) — $${priceUsd}\nPlease guide me on payment and activation.`,
    );
    return waNum ? `https://wa.me/${waNum}?text=${text}` : "#";
  }

  // Map DB plans → presentational shape; WA-link logic stays here (server).
  const fullPlans: PricingPlan[] = plans.map((p: any) => ({
    slug: p.slug,
    name: p.name,
    nameEn: p.nameEn || "",
    description: p.description,
    priceUsd: p.priceUsd,
    yearlyUsd: p.yearlyUsd,
    highlight: p.highlight,
    popular: Boolean(p.popular),
    features: JSON.parse(p.features || "[]"),
    href: waLink(p.name, p.priceUsd),
    yearlyHref: p.yearlyUsd ? waLink(p.name, p.yearlyUsd, true) : undefined,
    yearlyNote: p.yearlyUsd
      ? locale === "ar"
        ? `أو $${p.yearlyUsd}/سنة — وفّر $${p.priceUsd * 12 - p.yearlyUsd}`
        : `Or $${p.yearlyUsd}/yr — save $${p.priceUsd * 12 - p.yearlyUsd}`
      : undefined,
  }));

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav
        brandName={cfg.brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        current="pricing"
        locale={locale}
      />

      {/* ───────── Header ───────── */}
      <section className="relative overflow-hidden px-5 pb-12 pt-36 sm:pt-44">
        <AmbientBackdrop />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <SectionReveal>
            <span className="eyebrow mb-4 inline-block">{m.pricingPage.eyebrow}</span>
            <h1 className="display-heading text-4xl sm:text-5xl">{m.pricingPage.heading}</h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              {m.pricingPage.subheading}
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Plans ───────── */}
      <section className="px-5 py-12">
        <div className="ai-container max-w-7xl">
          <PricingCards
            plans={fullPlans}
            variant="full"
            locale={locale}
            labels={{
              perMonth: m.pricingPage.perMonth,
              subscribeCta: m.pricingPage.subscribeCta,
              yearlyLabel: locale === "ar" ? "أو اشترك سنوياً" : "Or subscribe yearly",
            }}
          />
        </div>
      </section>

      {/* ───────── How to subscribe ───────── */}
      <section className="px-5 py-12">
        <div className="ai-container max-w-3xl">
          <SectionReveal>
            <div className="surface noise p-6 sm:p-8">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-white">
                <ShieldCheck className="h-5 w-5 text-brand-400" />
                {m.pricingPage.howHeading}
              </h3>
              <ol className="space-y-5 text-sm">
                {m.pricingPage.steps.map((step: { title: string; desc: string }, idx: number) => (
                  <li key={idx} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/10 text-xs font-bold text-brand-300">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium text-white">{step.title}</div>
                      <div className="mt-0.5 text-slate-400">{step.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Contact ───────── */}
      <section className="px-5 pb-24">
        <SectionReveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 text-sm text-slate-400">{m.pricingPage.contactText}</p>
            <a
              href={waNum ? `https://wa.me/${waNum}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline h-11"
            >
              <MessageCircle className="h-4 w-4" />
              {m.pricingPage.contactCta}
            </a>
          </div>
        </SectionReveal>
      </section>

      {/* ───────── Footer ───────── */}
      <PublicFooter
        locale={locale}
        m={{
          product: m.footer.product,
          features: m.footer.features,
          pricing: m.footer.pricing,
          projects: m.footer.projects,
          faq: m.footer.faq,
          company: m.footer.company,
          terms: m.footer.terms,
          privacy: m.footer.privacy,
          contact: m.footer.contact,
          whatsapp: m.footer.whatsapp,
          login: m.footer.login,
          copyright: m.footer.copyright,
        }}
        cfg={{
          brandName: cfg.brandName,
          brandTagline: cfg.brandTagline,
          supportWhatsapp: cfg.supportWhatsapp,
          supportEmail: cfg.supportEmail,
        }}
      />
    </main>
  );
}
