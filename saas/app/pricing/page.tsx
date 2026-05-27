import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { PublicFooter } from "@/components/ui/public-footer";
import { getLocale, t } from "@/lib/i18n";
import { Check, MessageCircle, ShieldCheck } from "lucide-react";
import { SectionReveal, StaggerItem, HoverCard } from "@/components/ui/section-reveal";

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

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav
        brandName={cfg.brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        current="pricing"
        locale={locale}
      />

      {/* ───────── Header ───────── */}
      <section className="ai-section pt-36 pb-12">
        <div className="ai-container max-w-4xl text-center">
          <SectionReveal>
            <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand-400/70">
              {m.pricingPage.eyebrow}
            </span>
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-5xl">
              {m.pricingPage.heading}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              {m.pricingPage.subheading}
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Plans ───────── */}
      <section className="ai-section !py-12">
        <div className="ai-container max-w-7xl grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan: any, idx: number) => {
            const features: string[] = JSON.parse(plan.features || "[]");
            const popular = Boolean(plan.popular);
            return (
              <StaggerItem key={plan.slug} index={idx}>
                <HoverCard
                  className={`relative rounded-2xl border p-6 ${
                    popular
                      ? "border-brand-500/30 bg-gradient-to-b from-brand-500/[0.06] to-transparent"
                      : "border-white/[0.06] bg-white/[0.025]"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-2.5 inset-x-0 flex justify-center">
                      <span className="rounded-full bg-brand-500 px-3 py-0.5 text-[11px] font-semibold text-white">
                        {plan.highlight}
                      </span>
                    </div>
                  )}
                  <div className="mb-1 text-xs text-slate-500">{plan.nameEn || ""}</div>
                  <h3 className="mb-1 text-xl font-bold text-white">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mb-5 min-h-[2.5rem]">{plan.description}</p>

                  <div className="flex items-baseline gap-1 mb-5">
                    <span className="text-4xl font-bold tabular-nums text-white">${plan.priceUsd}</span>
                    <span className="text-slate-500 text-sm">{m.pricingPage.perMonth}</span>
                  </div>

                  {plan.yearlyUsd && (
                    <div className="text-xs text-emerald-400/80 mb-5">
                      {locale === "ar"
                        ? `أو $${plan.yearlyUsd}/سنة — وفّر $${plan.priceUsd * 12 - plan.yearlyUsd}`
                        : `Or $${plan.yearlyUsd}/yr — save $${plan.priceUsd * 12 - plan.yearlyUsd}`}
                    </div>
                  )}

                  <ul className="space-y-3 mb-6 text-sm">
                    {features.map((f: string) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        <span className="text-slate-400">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={waLink(plan.name, plan.priceUsd)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.97] ${
                      popular
                        ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20 hover:bg-brand-400"
                        : "border border-white/[0.08] text-slate-300 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {m.pricingPage.subscribeCta}
                  </a>

                  {plan.yearlyUsd && (
                    <a
                      href={waLink(plan.name, plan.yearlyUsd, true)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-xs text-slate-500 hover:text-slate-300 mt-3 transition"
                    >
                      {locale === "ar" ? "أو اشترك سنوياً" : "Or subscribe yearly"}
                    </a>
                  )}
                </HoverCard>
              </StaggerItem>
            );
          })}
        </div>
      </section>

      {/* ───────── How to subscribe ───────── */}
      <SectionReveal>
        <section className="ai-section !py-12">
          <div className="ai-container max-w-3xl">
            <div className="ai-card p-6 sm:p-8">
              <h3 className="flex items-center gap-2 text-lg font-bold text-white mb-5">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                {m.pricingPage.howHeading}
              </h3>
              <ol className="space-y-4 text-sm">
                {m.pricingPage.steps.map((step: { title: string; desc: string }, idx: number) => (
                  <li key={idx} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-300">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-medium text-white">{step.title}</div>
                      <div className="text-slate-400 mt-0.5">{step.desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </SectionReveal>

      {/* ───────── Contact ───────── */}
      <section className="px-5 pb-24">
        <SectionReveal>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-slate-400 mb-5 text-sm">{m.pricingPage.contactText}</p>
            <a
              href={waNum ? `https://wa.me/${waNum}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
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
