import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { getSiteConfig } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { PublicFooter } from "@/components/ui/public-footer";
import FaqAccordion from "@/components/ui/faq-accordion";
import PricingCards, { type PricingPlan } from "@/components/ui/pricing-cards";
import HeroMockup from "@/components/hero/hero-mockup";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  ChartNoAxesCombined,
  MessageSquareMore,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function getPlans() {
  try {
    return await prisma.plan.findMany({
      where: { status: { not: "archived" } },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    return [];
  }
}

async function getSiteConfigSafe() {
  try {
    return await getSiteConfig();
  } catch {
    return { brandName: "KEYONE", brandTagline: null, supportWhatsapp: null, supportEmail: null };
  }
}

// ── Landing-page-specific copy (en/ar) ───────────────────────────────────────
const LP = {
  ar: {
    heroTitle: "أعمالك تستحق محادثات أذكى.",
    heroSub:
      "بِع على واتساب باحترافية. ردود ذكية، إدارة عملاء، طلبات، وتحليلات — كلها موحّدة في نظام تشغيل عملاء واحد وذكي.",
    getStarted: "ابدأ الآن",
    explore: "استكشف المنصة",
    metrics: [
      { value: "24/7", label: "عمليات عملاء لا تتوقف" },
      { value: "< 3ث", label: "متوسط زمن استجابة البوت" },
      { value: "99.9%", label: "وقت تشغيل مضمون" },
    ],
    modules: [
      { key: "customer", label: "إدارة العملاء", desc: "سجل موحّد لكل عميل — المحادثات، الطلبات، والتفاعلات في مكان واحد." },
      { key: "automation", label: "الأتمتة", desc: "قواعد ذكية تعمل بشكل تلقائي — ردود، توجيه، وإشعارات دون تدخل يدوي." },
      { key: "knowledge", label: "المعرفة", desc: "قاعدة معرفية تتطوّر مع عملك — المنتجات، الأسعار، والسياسات دائماً محدّثة." },
      { key: "analytics", label: "التحليلات", desc: "رؤية تشغيلية حقيقية — زمن الرد، معدل التحويل، والأداء بشكل يومي." },
      { key: "security", label: "الأمان", desc: "حماية بمستوى الشركات — صلاحيات، سجلات تدقيق، وتشفير في كل طبقة." },
    ],
    platformEyebrow: "المنصة",
    platformTitle: "نظام ذكي واحد. لكل عمليات العملاء.",
    platformBody:
      "يجمع الرسائل الواردة، المعرفة، الأتمتة، التحليلات، وإدارة العملاء في طبقة تشغيل واحدة — دون الحاجة إلى ربط أدوات متفرقة.",
    story: [
      {
        eyebrow: "المشكلة",
        title: "الأعمال تفقد عملاءها قبل أن تدرك ذلك.",
        body: "الردود المفقودة، البطء في الرد، فرق منفصلة، وفرص ضائعة — كلها تكاليف خفيّة في كل محادثة.",
        img: "/problem-flow.png",
      },
      {
        eyebrow: "منصة ذكية واحدة",
        title: "كل ما يحتاجه فريقك في مكان واحد.",
        body: "طبقة تشغيل واحدة تجمع بريدك الوارد، المعرفة، الأتمتة، التحليلات، إدارة العملاء، والأمان.",
        img: "/one-platform.png",
      },
      {
        eyebrow: "فهم بالذكاء الاصطناعي",
        title: "الذكاء الاصطناعي يفهم قبل أن يرد.",
        body: "كشف النية، معرفة عملك، اتخاذ القرار، والمراجعة البشرية — كلها تعمل معًا قبل أي إجراء.",
        img: "/ai-understands.png",
      },
      {
        eyebrow: "تنسيق الفريق",
        title: "فريق واحد. تنسيق مثالي.",
        body: "توجيه كل محادثة تلقائيًا إلى الشخص المناسب في المبيعات، الدعم، الفوترة، الإدارة، والفنيين.",
        img: "/team-coordination.png",
      },
      {
        eyebrow: "ثقة في الطلبات",
        title: "طلبات تُنشأ بثقة.",
        body: "يتم تقييم كل محادثة وتوجيهها نحو النتيجة الصحيحة بدل التخمين والمتابعة اليدوية.",
        img: "/orders-confidence.png",
      },
      {
        eyebrow: "نظام المعرفة",
        title: "معرفة تتطوّر مع نموّ أعمالك.",
        body: "الخدمات والمنتجات والأسعار والسياسات والوثائق والأسئلة الشائعة في مكان واحد يزداد ذكاءً مع الوقت.",
        img: "/knowledge-evolves.png",
      },
      {
        eyebrow: "ذكاء القرار",
        title: "قرارات مدعومة بالبيانات.",
        body: "كل محادثة تتراكم لتمنحك رؤية تشغيلية حقيقية عن زمن الرد، الأداء، النمو، والإنتاجية.",
        img: "/decisions-data.png",
      },
      {
        eyebrow: "الأمان",
        title: "مبني على الأمان أولًا.",
        body: "حماية بمستوى الشركات: صلاحيات، سجلات تدقيق، تشفير، عزل، مراقبة، ونسخ احتياطي.",
        img: "/security-first.png",
      },
      {
        eyebrow: "الموثوقية",
        title: "مبني ليكون موثوقًا.",
        body: "بنية مرنة تربط الرسائل والمعالجة والبيانات والإشعارات والمراقبة والعمّال في نواة واحدة يمكن الاعتماد عليها.",
        img: "/reliability.png",
      },
    ],
    finalTitle: "منصة واحدة. فريق واحد. كل محادثة.",
    finalSub:
      "تجمع KEYONE بين التواصل مع العملاء، ذكاء القرار، وتنسيق الفرق في نظام إنتاجي واحد.",
    pricingHeading: "خطط تنمو معك",
    pricingSubheading: "اشترك في دقائق عبر واتساب. ترقية أو إلغاء في أي وقت.",
    pricingViewAll: "مقارنة كل الخطط",
    pricingPerMonth: "/شهر",
    faqHeading: "الأسئلة الشائعة",
  },
  en: {
    heroTitle: "Your business deserves smarter conversations.",
    heroSub:
      "Sell on WhatsApp, professionally. AI replies, CRM, orders, and analytics — unified into one intelligent customer operating system.",
    getStarted: "Get started",
    explore: "Explore the platform",
    metrics: [
      { value: "24/7", label: "Always-on customer operations" },
      { value: "< 3s", label: "Average bot response time" },
      { value: "99.9%", label: "Guaranteed uptime" },
    ],
    modules: [
      { key: "customer", label: "Customer management", desc: "One unified record per customer — conversations, orders, and interactions in one place." },
      { key: "automation", label: "Automation", desc: "Smart rules that run automatically — replies, routing, and notifications without manual work." },
      { key: "knowledge", label: "Knowledge", desc: "A knowledge base that grows with your business — products, pricing, and policies always current." },
      { key: "analytics", label: "Analytics", desc: "Real operational visibility — response time, conversion rate, and daily performance at a glance." },
      { key: "security", label: "Security", desc: "Enterprise-grade protection — role permissions, audit logs, and encryption at every layer." },
    ],
    platformEyebrow: "Platform",
    platformTitle: "One intelligent system. All customer operations.",
    platformBody:
      "Unifies your shared inbox, knowledge, automation, analytics, and CRM into one operating layer — no gluing tools together.",
    story: [
      {
        eyebrow: "The problem",
        title: "Businesses lose customers before they even realize it.",
        body: "Missed replies, slow responses, disconnected teams, and lost opportunities create hidden cost in every conversation.",
        img: "/problem-flow.png",
      },
      {
        eyebrow: "One intelligent platform",
        title: "Everything your team needs in one place.",
        body: "A single operating layer unifies shared inbox, knowledge, automation, analytics, customer management, and security.",
        img: "/one-platform.png",
      },
      {
        eyebrow: "AI understanding",
        title: "AI understands before it responds.",
        body: "Intent detection, business knowledge, decisioning, and human approval work together before any action is taken.",
        img: "/ai-understands.png",
      },
      {
        eyebrow: "Team coordination",
        title: "One team. Perfect coordination.",
        body: "Route each conversation to the right person automatically across sales, support, billing, management, and technical teams.",
        img: "/team-coordination.png",
      },
      {
        eyebrow: "Order confidence",
        title: "Orders created with confidence.",
        body: "Conversations are evaluated, scored, and guided toward the right outcome instead of guesswork or manual follow-up.",
        img: "/orders-confidence.png",
      },
      {
        eyebrow: "Knowledge system",
        title: "Knowledge that evolves with your business.",
        body: "Centralized services, products, pricing, policies, documentation, and FAQs create a smarter system over time.",
        img: "/knowledge-evolves.png",
      },
      {
        eyebrow: "Decision intelligence",
        title: "Decisions backed by data.",
        body: "Every conversation compounds into real operational visibility across response time, performance, growth, and productivity.",
        img: "/decisions-data.png",
      },
      {
        eyebrow: "Security",
        title: "Built with security first.",
        body: "Enterprise-grade protection with role permissions, audit logs, encryption, isolation, monitoring, and backups.",
        img: "/security-first.png",
      },
      {
        eyebrow: "Reliability",
        title: "Built for reliability.",
        body: "A resilient architecture connects messaging, processing, data, notifications, monitoring, and workers into one dependable core.",
        img: "/reliability.png",
      },
    ],
    finalTitle: "One platform. One team. Every conversation.",
    finalSub:
      "KEYONE brings customer communication, decision intelligence, and team coordination into one production-ready system.",
    pricingHeading: "Plans that scale with you",
    pricingSubheading: "Subscribe in minutes via WhatsApp. Upgrade or cancel anytime.",
    pricingViewAll: "Compare all plans",
    pricingPerMonth: "/mo",
    faqHeading: "Frequently asked questions",
  },
} as const;

const MODULE_ICONS: ComponentType<{ className?: string }>[] = [
  MessageSquareMore,
  Workflow,
  BrainCircuit,
  ChartNoAxesCombined,
  ShieldCheck,
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale = getLocale(searchParams.lang);
  const lp = LP[locale];
  const m = t(locale);
  const isRtl = locale === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const [plans, cfg] = await Promise.all([getPlans(), getSiteConfigSafe()]);
  const brandName = cfg.brandName || "KEYONE";
  const signupHref = `/signup${locale === "en" ? "?lang=en" : ""}`;

  const previewPlans: PricingPlan[] = plans.map((p: any) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceUsd: p.priceUsd,
    highlight: p.highlight,
    popular: Boolean(p.popular),
    features: JSON.parse(p.features || "[]"),
  }));

  return (
    <main className="bg-canvas text-slate-200" dir={isRtl ? "rtl" : "ltr"}>
      {/* ══════════════════ HERO ══════════════════ */}
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="lp-hero-ambient" aria-hidden="true" />
        <div className="lp-hero-stage-lines" aria-hidden="true" />

        {/* Nav sits inside the hero section — same visual field */}
        <div className="relative z-10 mx-auto max-w-[1600px] px-6 pt-6 sm:px-8 lg:px-12">
          <PublicNav
            brandName={brandName}
            supportWhatsapp={cfg.supportWhatsapp}
            locale={locale}
            variant="inline"
          />
        </div>

        <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col px-6 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12 lg:pt-16">
          {/* Headline + CTAs */}
          <div className="mx-auto w-full max-w-[1240px] text-center">
            <h1 className="mx-auto max-w-[14ch] text-balance text-[2.8rem] font-semibold leading-[1.02] tracking-tight text-white sm:text-[4rem] md:text-[5rem] lg:text-[5.6rem]">
              {lp.heroTitle}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-8 text-slate-400 sm:text-lg">
              {lp.heroSub}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={signupHref}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-6 text-sm font-medium text-white shadow-[0_0_28px_rgba(12,122,108,0.28)] transition-colors hover:bg-brand-400"
              >
                {lp.getStarted}
                <Arrow className="h-4 w-4" />
              </Link>
              <a
                href="#platform"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.04] px-6 text-sm text-white backdrop-blur-md transition-colors hover:bg-white/[0.08]"
              >
                {lp.explore}
              </a>
            </div>
          </div>

          {/* Hero mockup */}
          <div className="relative z-10 mt-16 w-full lg:mt-20">
            <HeroMockup locale={locale} />
          </div>

          {/* Metrics strip */}
          <div className="relative z-10 mx-auto w-full max-w-[1120px]">
            <dl className="mt-14 grid w-full gap-4 border-t border-white/[0.08] pt-6 sm:grid-cols-3 sm:gap-8">
              {lp.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-start"
                >
                  <dt className="text-xs uppercase tracking-[0.26em] text-slate-400/75">
                    {metric.label}
                  </dt>
                  <dd className="text-3xl font-semibold tracking-normal text-white sm:text-[2.1rem]">
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ══════════════════ PLATFORM MODULES ══════════════════ */}
      <section
        id="platform"
        className="relative overflow-hidden border-b border-white/[0.06] py-20 sm:py-24 lg:py-28"
      >
        <div className="lp-crescent lp-crescent-left" aria-hidden="true" />
        <div className="lp-crescent lp-crescent-right" aria-hidden="true" />

        <div className="mx-auto max-w-[1480px] px-6 sm:px-8 lg:px-12">
          <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="lp-section-eyebrow">{lp.platformEyebrow}</p>
              <h2 className="mt-4 max-w-[14ch] text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                {lp.platformTitle}
              </h2>
            </div>
            <p className="max-w-xl text-lg leading-8 text-slate-400">{lp.platformBody}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {lp.modules.map((mod, i) => {
              const Icon = MODULE_ICONS[i % MODULE_ICONS.length];
              return (
                <article key={mod.key} className="lp-module-card min-h-[210px] p-6">
                  <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.10] bg-brand-500/[0.08]">
                    <Icon className="h-6 w-6 text-brand-400" />
                  </div>
                  <h3 className="max-w-[10ch] text-2xl font-medium leading-tight text-white">
                    {mod.label}
                  </h3>
                  {"desc" in mod && mod.desc && (
                    <p className="mt-3 text-sm leading-6 text-slate-400">{mod.desc}</p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════ STORY SECTIONS ══════════════════ */}
      <div id="intelligence">
        {lp.story.map((section, index) => {
          const reversed = index % 2 === 1;
          return (
            <section
              key={index}
              className="relative overflow-hidden border-b border-white/[0.06] py-16 sm:py-20 lg:py-24"
            >
              <div
                className={
                  reversed
                    ? "lp-crescent lp-crescent-left"
                    : "lp-crescent lp-crescent-right"
                }
                aria-hidden="true"
              />
              <div className="mx-auto max-w-[1520px] px-6 sm:px-8 lg:px-12">
                <div
                  className={`grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 ${
                    reversed
                      ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1"
                      : ""
                  }`}
                >
                  <div className="max-w-xl">
                    <p className="lp-section-eyebrow">{section.eyebrow}</p>
                    <h2 className="mt-4 text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-[4.2rem] lg:leading-[1.02]">
                      {section.title}
                    </h2>
                    <p className="mt-6 text-lg leading-8 text-slate-400 sm:text-xl">
                      {section.body}
                    </p>
                  </div>

                  <div className="lp-image-panel">
                    <Image
                      src={section.img}
                      alt=""
                      width={900}
                      height={560}
                      className="h-auto w-full rounded-[26px] border border-white/[0.08] object-cover shadow-[0_18px_90px_rgba(0,0,0,0.48)]"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ══════════════════ PRICING ══════════════════ */}
      <section
        id="pricing"
        className="relative border-b border-white/[0.06] px-5 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
              {lp.pricingHeading}
            </h2>
            <p className="mt-3 text-base text-slate-400">{lp.pricingSubheading}</p>
          </div>

          <PricingCards
            plans={previewPlans}
            variant="preview"
            locale={locale}
            labels={{ perMonth: lp.pricingPerMonth }}
          />

          <div className="mt-8 text-center">
            <Link
              href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
              className="btn-outline h-11"
            >
              {lp.pricingViewAll} <Arrow className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════ FAQ ══════════════════ */}
      <section
        id="faq"
        className="border-b border-white/[0.06] bg-white/[0.012] px-5 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-10 text-center text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
            {lp.faqHeading}
          </h2>
          <FaqAccordion items={m.faq.items} />
        </div>
      </section>

      {/* ══════════════════ FINAL CTA ══════════════════ */}
      <section className="relative overflow-hidden py-24 sm:py-28">
        <div className="lp-hero-ambient opacity-70" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-[1200px] px-6 text-center sm:px-8 lg:px-12">
          <Image
            src="/wkeyone-logo.png"
            alt={brandName}
            width={80}
            height={80}
            className="mx-auto h-20 w-20 rounded-full border border-white/[0.12] object-cover shadow-[0_0_48px_rgba(12,122,108,0.24)]"
            loading="lazy"
          />
          <h2 className="mx-auto mt-10 max-w-[11ch] text-balance text-4xl font-semibold leading-tight text-white sm:text-6xl lg:text-[5.4rem] lg:leading-[0.98]">
            {lp.finalTitle}
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-400 sm:text-xl">
            {lp.finalSub}
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              href={signupHref}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-brand-500 px-7 text-sm font-medium text-white shadow-[0_0_28px_rgba(12,122,108,0.28)] transition-colors hover:bg-brand-400"
            >
              {lp.getStarted}
              <Arrow className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════ FOOTER ══════════════════ */}
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
