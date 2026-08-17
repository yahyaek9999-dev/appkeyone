import { prisma } from "@/lib/db";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";
import { AmbientBackdrop } from "@/components/ui/marketing";
import { PublicFooter } from "@/components/ui/public-footer";
import { getLocale, t } from "@/lib/i18n";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { SectionReveal } from "@/components/ui/section-reveal";
import PricingExperience, {
  type PricingTierVM,
  type PricingLabels,
} from "@/components/pricing/PricingExperience";
import FeatureMatrix from "@/components/pricing/FeatureMatrix";
import IndustryMatcher from "@/components/pricing/IndustryMatcher";
import {
  PUBLIC_TIERS,
  CAPABILITIES,
  yearlySavings,
  type TierDef,
} from "@/lib/pricing/catalog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "الأسعار والباقات",
  description:
    "اختر الباقة المناسبة لحجم أعمالك. 4 باقات مرنة بالدولار، فوترة شهرية أو سنوية، بدون رسوم خفية.",
};

async function getData() {
  const [plans, cfg] = await Promise.all([
    prisma.plan.findMany().catch(() => [] as any[]),
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
  const lang = locale === "ar" ? "ar" : "en";
  const m = t(locale);

  const { plans, cfg } = await getData();
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
  // DB price overrides (admin-editable) keyed by slug.
  const dbBySlug = new Map(plans.map((p: any) => [p.slug, p]));

  // Self-serve purchase. The CTA takes the customer into signup → /dashboard/billing,
  // where they see the REAL receiving account, pay, upload the receipt, and track it —
  // instead of the old "WhatsApp the founder to ask for a payment account" handoff.
  function signupLink(slug: string, yearly = false) {
    const cycle = yearly ? "yearly" : "monthly";
    const lang = locale === "en" ? "&lang=en" : "";
    return `/signup?plan=${encodeURIComponent(slug)}&cycle=${cycle}${lang}`;
  }

  function contactLink(planName: string) {
    const text = encodeURIComponent(
      locale === "ar"
        ? `مرحباً ${cfg.brandName} 👋\nمهتم بباقة *${planName}* للمؤسسات — أرجو التواصل لمناقشة احتياجي وعرض سعر مخصّص.`
        : `Hello ${cfg.brandName} 👋\nI'm interested in the *${planName}* enterprise plan — please reach out to discuss a custom quote.`,
    );
    return waNum ? `https://wa.me/${waNum}?text=${text}` : "#";
  }

  // Localized short feature bullets per tier: headline limits + capabilities
  // newly unlocked at this tier (the "what's new here" delta).
  // Uses tier.capIndex (0-3) to match CAPABILITIES.minTierIndex, and looks up
  // the previous PUBLIC tier (not the legacy k_business/k_scale) for the
  // "Everything in X" summary line.
  function bullets(tier: TierDef): string[] {
    const publicIdx = PUBLIC_TIERS.indexOf(tier);
    const out: string[] = [];
    out.push(
      tier.limits.messages === 0
        ? locale === "ar" ? "رسائل غير محدودة" : "Unlimited messages"
        : locale === "ar"
          ? `${tier.limits.messages.toLocaleString("en-US")} رسالة/شهر`
          : `${tier.limits.messages.toLocaleString("en-US")} msgs/mo`,
    );
    out.push(
      tier.limits.whatsapp === 0
        ? locale === "ar" ? "أرقام واتساب غير محدودة" : "Unlimited WhatsApp numbers"
        : locale === "ar"
          ? `${tier.limits.whatsapp} رقم واتساب`
          : `${tier.limits.whatsapp} WhatsApp number${tier.limits.whatsapp > 1 ? "s" : ""}`,
    );
    if (publicIdx >= 1) {
      out.push(
        tier.limits.team === 0
          ? locale === "ar" ? "أعضاء فريق غير محدودين" : "Unlimited team seats"
          : locale === "ar"
            ? `${tier.limits.team} أعضاء فريق`
            : `${tier.limits.team} team seats`,
      );
    }
    const delta = CAPABILITIES.filter(
      (c) => c.minTierIndex === tier.capIndex && c.category !== "core",
    ).slice(0, 4);
    for (const c of delta) {
      out.push(c.label[lang] + (c.comingSoon ? (locale === "ar" ? " (قريباً)" : " (soon)") : ""));
    }
    if (publicIdx === 0) {
      out.push(locale === "ar" ? "صندوق وارد وردود تلقائية" : "Inbox & auto-replies");
    }
    if (publicIdx > 0) {
      const prev = PUBLIC_TIERS[publicIdx - 1];
      out.unshift(
        locale === "ar"
          ? `كل مزايا ${prev.name.ar.replace("KEYONE ", "")}`
          : `Everything in ${prev.name.en.replace("KEYONE ", "")}`,
      );
    }
    return out;
  }

  const tiers: PricingTierVM[] = PUBLIC_TIERS
    // Hide plans an owner archived in /admin/plans. Default "active" → no change
    // until explicitly archived. Existing subscribers are unaffected (entitlement
    // resolves by planId, not by this list).
    .filter((tier) => ((dbBySlug.get(tier.slug) as any)?.status ?? "active") !== "archived")
    .map((tier) => {
    const db: any = dbBySlug.get(tier.slug);
    const priceMonthly = tier.contactSales
      ? null
      : (db?.priceUsd ?? tier.priceUsdMonthly);
    const priceYearly = tier.contactSales
      ? null
      : (db?.yearlyUsd ?? tier.priceUsdYearly);
    const savings =
      priceMonthly != null && priceYearly != null
        ? priceMonthly * 12 - priceYearly
        : yearlySavings(tier);
    return {
      slug: tier.slug,
      name: tier.name[lang],
      tagline: tier.tagline[lang],
      audience: tier.audience.map((a) => a[lang]),
      priceMonthly,
      priceYearly,
      contactSales: Boolean(tier.contactSales),
      popular: Boolean(tier.popular),
      recommended: Boolean(tier.recommended),
      features: bullets(tier),
      hrefMonthly: signupLink(tier.slug),
      hrefYearly: signupLink(tier.slug, true),
      contactHref: contactLink(tier.name.en),
      savings,
    };
  });

  const pricingLabels: PricingLabels = {
    monthly: locale === "ar" ? "شهري" : "Monthly",
    yearly: locale === "ar" ? "سنوي" : "Yearly",
    saveBadge: locale === "ar" ? "وفّر حتى 20%" : "Save up to 20%",
    perMonth: locale === "ar" ? "/شهر" : "/mo",
    perYear: locale === "ar" ? "/سنة" : "/yr",
    billedYearly: locale === "ar" ? "أو $%s/سنة" : "or $%s/yr",
    save: locale === "ar" ? "وفّر $%s سنوياً" : "Save $%s/yr",
    subscribeCta: locale === "ar" ? "اطلب الباقة" : "Get started",
    contactCta: locale === "ar" ? "تواصل مع المبيعات" : "Contact Sales",
    popularBadge: locale === "ar" ? "الأكثر طلباً" : "Most popular",
    perfectFor: locale === "ar" ? "مثالية لـ" : "Perfect for",
  };

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav
        brandName={cfg.brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        current="pricing"
        locale={locale}
      />

      {/* ───────── Header ───────── */}
      <section className="relative overflow-hidden px-5 pb-10 pt-36 sm:pt-44">
        <AmbientBackdrop />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <SectionReveal>
            <span className="eyebrow mb-4 inline-block">
              {locale === "ar" ? "أسعار شفافة" : "Transparent pricing"}
            </span>
            <h1 className="display-heading text-4xl sm:text-5xl">
              {locale === "ar" ? "باقة لكل مرحلة من نمو أعمالك" : "A plan for every stage of growth"}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              {locale === "ar"
                ? "4 باقات مرنة — ابدأ صغيراً وارتقِ وقت ما تكبر. فوترة شهرية أو سنوية، إلغاء في أي وقت."
                : "4 flexible plans — start small and scale as you grow. Monthly or yearly, cancel anytime."}
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Plans ───────── */}
      <section id="plans" className="scroll-mt-24 px-5 py-8">
        <div className="ai-container max-w-7xl">
          <PricingExperience tiers={tiers} labels={pricingLabels} locale={locale} />
        </div>
      </section>

      {/* ───────── Industry matcher ───────── */}
      <section className="px-5 py-16">
        <div className="ai-container max-w-5xl">
          <SectionReveal>
            <IndustryMatcher
              locale={locale}
              title={locale === "ar" ? "أي باقة تناسب مجالك؟" : "Which plan fits your industry?"}
              subtitle={
                locale === "ar"
                  ? "اختر مجالك ومرحلتك، ونرشّح لك الباقة الأنسب."
                  : "Pick your industry and stage — we'll recommend the right plan."
              }
              resultPrefix={locale === "ar" ? "نرشّح لك" : "We recommend"}
              levelLabels={
                locale === "ar"
                  ? ["ناشئ", "نامٍ", "رائد"]
                  : ["Startup", "Growth", "Elite"]
              }
            />
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Feature matrix ───────── */}
      <section className="px-5 py-16">
        <div className="ai-container max-w-6xl">
          <SectionReveal>
            <FeatureMatrix
              locale={locale}
              title={locale === "ar" ? "قارن كل المزايا" : "Compare every feature"}
              subtitle={
                locale === "ar"
                  ? "كل ما تحصل عليه في كل باقة — بوضوح تام."
                  : "Exactly what you get in each plan — crystal clear."
              }
              comingSoonLabel={locale === "ar" ? "قريباً" : "soon"}
            />
          </SectionReveal>
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
                {m.pricingPage.steps.map(
                  (step: { title: string; desc: string }, idx: number) => (
                    <li key={idx} className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/10 text-xs font-bold text-brand-300">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-medium text-white">{step.title}</div>
                        <div className="mt-0.5 text-slate-400">{step.desc}</div>
                      </div>
                    </li>
                  ),
                )}
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
