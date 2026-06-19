import Link from "next/link";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { WhatsAppIcon } from "@/components/ui/marketing";
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
  ArrowLeft, ArrowRight, BarChart3, Bell, Database, CheckCircle2, Users,
  Phone, Zap, ShoppingCart, RefreshCw, Lock, Shield, TrendingUp,
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

function WhatsAppProductMockup({ dir, compact }: { dir?: string; compact?: boolean }) {
  const isRtl = dir === "rtl";
  return (
    <div className={`relative ${compact ? "mx-auto max-w-sm" : ""}`}>
      <div className="relative rounded-2xl border border-white/[0.09] bg-[#0d1117] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#111a14] px-4 py-3">
          <div className="h-9 w-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <span className="text-brand-300 text-xs font-bold">ع</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">عميل جديد</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
              <span className="text-[11px] text-brand-300">يرد خلال 5 ثوانٍ</span>
            </div>
          </div>
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-white/10" />
            <div className="h-2 w-2 rounded-full bg-white/10" />
            <div className="h-2 w-2 rounded-full bg-white/10" />
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm" dir={isRtl ? "rtl" : "ltr"}>
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2.5 text-slate-200 leading-relaxed">
              <p>عايز أعرف الأسعار واللي عندكم من منتجات</p>
              <p className="text-[10px] text-slate-500 mt-1">09:14</p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600/25 border border-brand-500/20 px-3.5 py-2.5 text-slate-100 leading-relaxed">
              <p>أهلاً بيك! 👋 عندنا 3 باقات:</p>
              <p className="mt-1">• الأساسية: 199 ج/شهر</p>
              <p>• الاحترافية: 399 ج/شهر ⭐</p>
              <p>• المؤسسية: تواصل للسعر</p>
              <p className="mt-1 text-brand-300 text-xs">أي باقة تناسبك؟</p>
              <p className="text-[10px] text-slate-500 mt-1">09:14 ✓✓</p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2.5 text-slate-200 leading-relaxed">
              <p>عايز الاحترافية ✅</p>
              <p className="text-[10px] text-slate-500 mt-1">09:15</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2">
            <ShoppingCart className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-medium text-amber-300">طلب جديد مكتشف — باقة احترافية</span>
          </div>
        </div>

        <div className="border-t border-white/[0.06] bg-[#111a14] px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-slate-500 text-xs">
            <span className="flex-1">KEYONE يكمل المتابعة تلقائياً…</span>
            <Zap className="h-3.5 w-3.5 text-brand-400" />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 -start-4 rounded-xl border border-white/[0.09] bg-[#0d1117]/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-brand-400 shrink-0" />
          <span className="text-[11px] font-semibold text-white">اليوم</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-base font-bold text-brand-300">24</div>
            <div className="text-[9px] text-slate-500">محادثة نشطة</div>
          </div>
          <div>
            <div className="text-base font-bold text-white">12</div>
            <div className="text-[9px] text-slate-500">طلب جديد</div>
          </div>
        </div>
      </div>

      <div className="absolute -top-3 -end-3 rounded-lg border border-white/[0.09] bg-[#0d1117]/95 px-2.5 py-1.5 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-amber-400" />
          <span className="text-[11px] font-bold text-white">5 ثوانٍ</span>
        </div>
        <div className="text-[9px] text-slate-500">متوسط الرد</div>
      </div>
    </div>
  );
}

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
  const brandName = cfg.brandName || "KEYONE";
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

      {/* ───────── Features — bento grid (21st.dev features-8) ───────── */}
      <section id="features" className="px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <FadeInView className="mx-auto mb-12 max-w-2xl text-center">
            <div className="eyebrow mb-3">{m.features.eyebrow}</div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              {m.features.heading}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
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

      {/* ───────── How it works ───────── */}
      <section id="how" className="px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <FadeInView className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              {m.howItWorks.heading}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {m.howItWorks.subheading}
            </p>
          </FadeInView>

          <StaggerReveal className="space-y-3" stagger={0.12}>
            {m.howItWorks.steps.map((step: { num: string; title: string; desc: string }) => (
              <StaggerItem key={step.num}>
                <div className="surface flex gap-4 p-5 sm:p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/[0.05] text-xs font-semibold text-brand-300">
                    {step.num}
                  </div>
                  <div className="min-w-0">
                    <h3 className="mb-1 text-sm font-semibold text-white">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-400">{step.desc}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerReveal>
        </div>
      </section>

      {/* ───────── Trust ───────── */}
      <TrustSection m={m.trust} dir={m.dir} />

      {/* ───────── Social proof ───────── */}
      <SocialProof locale={locale} dir={m.dir} />

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="border-t border-white/[0.06] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <FadeInView className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">{m.pricing.heading}</h2>
            <p className="mt-2 text-sm text-slate-500">{m.pricing.subheading}</p>
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
            <h2 className="mb-10 text-center text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">{m.faq.heading}</h2>
          </FadeInView>
          <FaqAccordion items={m.faq.items} />
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-3xl">
          <FadeInView>
            <div className="surface relative overflow-hidden px-8 py-14 text-center sm:px-12">
              <BorderBeam colorFrom="rgba(12,122,108,0.9)" colorTo="rgba(201,162,75,0.35)" size={180} duration={6} />
              <h2 className="display-heading relative text-3xl sm:text-4xl">{m.cta.heading}</h2>
              <p className="relative mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-400">{m.cta.subheading}</p>
              <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {waNum ? (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn-premium h-11 px-5 text-sm">
                    <Phone className="h-4 w-4" /> {m.cta.primary}
                  </a>
                ) : (
                  <Link href="/pricing" className="btn-premium h-11 px-5 text-sm">
                    {m.cta.primary} <Arrow className="h-4 w-4" />
                  </Link>
                )}
                <Link href={`/pricing${locale === "en" ? "?lang=en" : ""}`} className="btn-outline h-11 text-sm">
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
