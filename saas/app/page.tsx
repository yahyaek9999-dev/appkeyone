import Link from "next/link";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import { PublicFooter } from "@/components/ui/public-footer";
import TrustSection from "@/components/ui/trust-section";
import SocialProof from "@/components/ui/social-proof";
import IntegrationsWhatsApp from "@/components/ui/integrations-whatsapp";
import FaqAccordion from "@/components/ui/faq-accordion";
import PricingCards, { type PricingPlan } from "@/components/ui/pricing-cards";
import RoiSection from "@/components/ui/roi-section";
import HeroSection from "@/components/hero/hero-section";
import {
  ArrowLeft, ArrowRight, BarChart3, Bell,
  Phone, Zap, ShoppingCart, RefreshCw, Shield,
} from "lucide-react";
import type { ComponentType } from "react";
import { BentoFeatures } from "@/components/ui/bento-features";
import { FadeInView, StaggerReveal, StaggerItem } from "@/components/ui/stagger-reveal";
import { BorderBeam } from "@/components/ui/border-beam";
import AnimatedStatsSection from "@/components/ui/animated-stats-section";

export const dynamic = "force-dynamic";

async function getPlans() {
  try {
    return await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    return [];
  }
}

const FEATURE_META: Array<{
  icon: ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { icon: Zap, accent: "text-brand-300" },
  { icon: ShoppingCart, accent: "text-gold-300" },
  { icon: RefreshCw, accent: "text-brand-300" },
  { icon: BarChart3, accent: "text-gold-300" },
  { icon: Bell, accent: "text-brand-300" },
  { icon: Shield, accent: "text-gold-300" },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale = getLocale(searchParams.lang);
  const m = t(locale);
  const isRtl = m.dir === "rtl";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const [plans, cfg] = await Promise.all([getPlans(), getSiteConfig()]);
  const brandName = cfg.brandName || "WKEYONE";
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
  const waHref = waNum
    ? "https://wa.me/" +
      waNum +
      "?text=" +
      encodeURIComponent(
        locale === "ar"
          ? "أريد طلب حساب جديد في " + brandName
          : "I'd like to subscribe to " + brandName,
      )
    : "";

  const previewPlans: PricingPlan[] = plans.map((p: any) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceUsd: p.priceUsd,
    highlight: p.highlight,
    popular: Boolean(p.popular),
    features: JSON.parse(p.features || "[]"),
  }));

  const featureItems = m.features.items.map(
    (item: { title: string; desc: string }, idx: number) => {
      const meta = FEATURE_META[idx % FEATURE_META.length];
      const Icon = meta.icon;
      return {
        title: item.title,
        desc: item.desc,
        // Pre-render the icon element here (Server Component) so only a
        // serializable React node crosses into the client grid — never the
        // component function itself.
        icon: <Icon className={`h-5 w-5 ${meta.accent}`} />,
      };
    }
  );

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav brandName={brandName} supportWhatsapp={cfg.supportWhatsapp} locale={locale} />

      {/* ───────── Video hero ───────── */}
      <HeroSection
        brandName={brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        locale={locale}
        videoSrc="/vedio.mp4"
        mobileVideoSrc="/mobile.mp4"
        ctaPrimary={m.hero.ctaPrimary}
        ctaSecondary={m.hero.ctaSecondary}
      />

      {/* ───────── Stats strip ───────── */}
      <AnimatedStatsSection stats={m.stats} />

      {/* ───────── Outcomes — asymmetric: featured metric + supporting pair ── */}
      <section className="border-t border-white/[0.06] px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <FadeInView className="mb-12 max-w-2xl">
            <h2 className="section-heading">
              {isRtl ? (
                <>نتائج <span className="gold-text">حقيقية</span> من أول شهر</>
              ) : (
                <>Real <span className="gold-text">outcomes</span>, from month one</>
              )}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
              {isRtl ? "الشركات التي تستخدم KEYONE تشاهد فرقاً قابلاً للقياس في أول 30 يوماً." : "Businesses on KEYONE see a measurable difference in the first 30 days."}
            </p>
          </FadeInView>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            {/* Featured outcome — the hero number + integrated testimonial */}
            <FadeInView className="card-elevated rail-gold flex flex-col justify-between p-7 sm:p-9">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-400/90">
                  {isRtl ? "متوسط وقت الرد" : "Average reply time"}
                </div>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="metric-xl gold-text text-6xl sm:text-7xl">5</span>
                  <span className="text-2xl font-medium text-slate-300 sm:text-3xl">
                    {isRtl ? "ثوانٍ" : "seconds"}
                  </span>
                </div>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
                  {isRtl ? "ردٌّ فوري يحافظ على اهتمام العميل ويضاعف احتمالية الشراء، حتى خارج ساعات العمل." : "An instant reply keeps the customer engaged and multiplies the odds of a sale, even after hours."}
                </p>
              </div>
              <blockquote className="mt-8 border-t border-white/[0.07] pt-6 text-[15px] leading-relaxed text-slate-300">
                {isRtl
                  ? `"قبل ${brandName} كنا بنضيع ساعات على الردود اليدوية. دلوقتي كل حاجة بتشتغل تلقائياً والفرق في الشهر الأول كان واضح."`
                  : `"Before ${brandName} we lost hours on manual replies. Now everything runs automatically, and the difference was clear in the first month."`}
                <footer className="mt-3 text-xs not-italic text-slate-500">
                  {isRtl ? "صاحب متجر إلكتروني، مستخدم منذ 6 أشهر" : "E-commerce store owner, 6 months on KEYONE"}
                </footer>
              </blockquote>
            </FadeInView>

            {/* Supporting pair — stacked, divided premium surface */}
            <div className="grid grid-rows-2 gap-4">
              {[
                { value: isRtl ? "~3×" : "~3×", label: isRtl ? "زيادة في تحويل المبيعات" : "increase in sales conversion" },
                { value: isRtl ? "15 دقيقة" : "15 min", label: isRtl ? "لإدارة عملياتك اليومية" : "to run your daily operations" },
              ].map((item, i) => (
                <FadeInView key={i} delay={0.1 + i * 0.08} className="surface surface-hover flex flex-col justify-center p-7">
                  <span className="metric-xl text-5xl text-white sm:text-6xl">{item.value}</span>
                  <span className="mt-2 text-sm text-slate-400">{item.label}</span>
                </FadeInView>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Features — bento grid (21st.dev features-8) ───────── */}
      <section id="features" className="px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <FadeInView className="mx-auto mb-14 max-w-2xl text-center">
            <div className="eyebrow mb-4">{m.features.eyebrow}</div>
            <h2 className="section-heading">
              {m.features.heading}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
              {m.features.subheading}
            </p>
          </FadeInView>

          <BentoFeatures items={featureItems} />
        </div>
      </section>

      {/* ───────── Integrations (WhatsApp) ───────── */}
      <IntegrationsWhatsApp m={m.integrations} dir={m.dir} />

      {/* ───────── ROI / outcome estimator ───────── */}
      <RoiSection
        locale={locale}
        dir={m.dir}
        ctaHref={waHref || `/pricing${locale === "en" ? "?lang=en" : ""}`}
        ctaLabel={locale === "ar" ? "ابدأ وحوّل رسائلك لمبيعات" : "Turn messages into sales"}
      />

      {/* ───────── How it works — connected vertical journey ───────── */}
      <section id="how" className="border-t border-white/[0.06] px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <FadeInView className="mb-14 max-w-2xl">
            <h2 className="section-heading">{m.howItWorks.heading}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
              {m.howItWorks.subheading}
            </p>
          </FadeInView>

          <div className="relative">
            {/* Gradient spine — emerald → gold, runs through the node centers */}
            <div
              aria-hidden
              className="absolute bottom-6 top-6 w-px bg-gradient-to-b from-brand-400/50 via-gold-500/40 to-transparent ltr:left-[1.4375rem] rtl:right-[1.4375rem]"
            />
            <StaggerReveal className="space-y-5" stagger={0.14}>
              {m.howItWorks.steps.map((step: { num: string; title: string; desc: string }) => (
                <StaggerItem key={step.num}>
                  <div className="relative flex gap-5">
                    <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-canvas text-sm font-semibold text-gold-300 shadow-[0_0_0_4px_rgba(10,10,12,1)]">
                      {step.num}
                    </div>
                    <div className="card-hover flex-1 p-5 sm:p-6">
                      <h3 className="mb-1.5 text-base font-semibold text-white">{step.title}</h3>
                      <p className="text-sm leading-relaxed text-slate-400">{step.desc}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerReveal>
          </div>
        </div>
      </section>

      {/* ───────── Trust ───────── */}
      <TrustSection m={m.trust} dir={m.dir} />

      {/* ───────── Social proof ───────── */}
      <SocialProof locale={locale} dir={m.dir} />

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="border-t border-white/[0.06] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <FadeInView className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="section-heading">{m.pricing.heading}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{m.pricing.subheading}</p>
          </FadeInView>

          <PricingCards
            plans={previewPlans}
            variant="preview"
            locale={locale}
            labels={{ perMonth: m.pricing.perMonth }}
          />

          <FadeInView delay={0.2} className="mt-8 text-center">
            <Link
              href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
              className="btn-outline h-11"
            >
              {m.pricing.viewAll} <Arrow className="h-4 w-4" />
            </Link>
          </FadeInView>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="border-y border-white/[0.06] bg-white/[0.012] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <FadeInView>
            <h2 className="mb-12 text-center section-heading">{m.faq.heading}</h2>
          </FadeInView>
          <FaqAccordion items={m.faq.items} />
        </div>
      </section>

      {/* ───────── CTA — cinematic closer panel ───────── */}
      <section className="px-5 py-24 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <FadeInView>
            <div className="panel-cta noise relative overflow-hidden px-8 py-16 text-center sm:px-12 sm:py-20">
              <BorderBeam colorFrom="rgba(12,122,108,0.9)" colorTo="rgba(201,162,75,0.5)" size={220} duration={7} />
              <h2 className="display-heading relative mx-auto max-w-2xl text-4xl sm:text-5xl">{m.cta.heading}</h2>
              <p className="relative mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">{m.cta.subheading}</p>
              <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {waNum ? (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn-premium h-12 px-7 text-sm">
                    <Phone className="h-4 w-4" /> {m.cta.primary}
                  </a>
                ) : (
                  <Link href="/pricing" className="btn-premium h-12 px-7 text-sm">
                    {m.cta.primary} <Arrow className="h-4 w-4" />
                  </Link>
                )}
                <Link href={`/pricing${locale === "en" ? "?lang=en" : ""}`} className="btn-outline h-12 px-6 text-sm">
                  {m.cta.secondary}
                </Link>
              </div>
            </div>
          </FadeInView>
        </div>
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
          brandName,
          brandTagline: cfg.brandTagline,
          supportWhatsapp: cfg.supportWhatsapp,
          supportEmail: cfg.supportEmail,
        }}
      />
    </main>
  );
}
