/**
 * /features — PUBLIC marketing capabilities page.
 * Phase 10: rebuilt as an image-led product-storytelling page.
 * Marketing-friendly only — exposes NO internal architecture or Brain internals.
 *
 * Editorial rhythm (Aveiro doctrine): one idea per section, in reading order —
 * problem → capability → product visual → concrete capability facts → outcome.
 * Typography/eyebrow use WKEYONE's own .display-heading / gold .eyebrow tokens.
 */
import Link from "next/link";
import Image from "next/image";
import PublicNav from "@/components/ui/public-nav";
import { PublicFooter } from "@/components/ui/public-footer";
import { AmbientBackdrop } from "@/components/ui/marketing";
import { SectionReveal } from "@/components/ui/section-reveal";
import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "المميزات والقدرات",
  description:
    "قنوات واتساب، فهم اللهجات العربية، طلبات وCRM، تحليلات، وتكاملات المتاجر — كل قدرات KEYONE في صفحة واحدة.",
};

async function getSiteConfigSafe() {
  try {
    return await getSiteConfig();
  } catch {
    return { brandName: "KEYONE", supportWhatsapp: null, supportEmail: null };
  }
}

/** Capability chapters. Each carries REAL product facts and one real product visual. */
const CHAPTERS = {
  ar: [
    {
      eyebrow: "القنوات",
      title: "اتصل بواتساب بالطريقة اللي تناسبك.",
      problem:
        "أغلب الأنظمة تفرض عليك طريقة ربط واحدة — فإما تنتظر موافقات طويلة، أو تفقد الرسمية.",
      body: "KEYONE يدعم المسارين: ربط سريع عبر QR للبدء في دقائق، أو Cloud API الرسمي من Meta للتشغيل على نطاق أوسع. نفس لوحة التحكم في الحالتين.",
      facts: ["واتساب عبر QR (Web)", "واتساب Cloud API (Meta)", "لوحة تحكم ويب", "متوافق مع الموبايل", "REST API للمطوّرين"],
      img: "/one-platform.png",
    },
    {
      eyebrow: "الفهم والذكاء",
      title: "يفهم عميلك باللهجة اللي بيكتب بيها.",
      problem:
        "العميل المصري ما بيكتبش عربية فصحى. والبوت اللي بيفهم الفصحى بس، بيضيّع الطلب.",
      body: "الفهم مبني على اللهجات العربية الحقيقية إلى جانب الفصحى والإنجليزية، وتقدر تختار مزوّد الذكاء الاصطناعي المناسب لك — أو تستخدم مفتاحك الخاص.",
      facts: ["العربية الفصحى", "المصرية والخليجية والشامية والمغاربية", "الإنجليزية", "OpenAI · Anthropic · Gemini", "OpenRouter · Groq", "مفتاحك الخاص (BYOK)"],
      img: "/ai-understands.png",
    },
    {
      eyebrow: "الطلبات والعملاء",
      title: "من محادثة إلى طلب مكتمل.",
      problem:
        "الطلبات بتتكتب في الورق أو الواتساب، وبتتوه بين المحادثات — ومحدش عارف مين العميل المهم.",
      body: "كل محادثة بتتحول إلى سجل عميل وطلب قابل للمتابعة، مع تقييم تلقائي للعملاء المحتملين حسب جدية الشراء.",
      facts: ["ردود ذكية تلقائية", "إدارة عملاء وتقييم العملاء المحتملين", "إنشاء ومتابعة الطلبات", "حملات ورسائل جماعية"],
      img: "/orders-confidence.png",
    },
    {
      eyebrow: "القرار والتحليلات",
      title: "أرقام تقول لك الخطوة الجاية.",
      problem: "بدون قياس، القرارات بتُبنى على الإحساس — لا على أداء فعلي.",
      body: "كل محادثة وطلب بيتراكموا في تقارير تشغيلية تكشف زمن الرد والتحويل والنمو، مع محفظة مسبقة الدفع تخليك شايف التكلفة بوضوح.",
      facts: ["تحليلات وتقارير", "قياس زمن الرد والتحويل", "محفظة مسبقة الدفع", "تتبّع استهلاك واضح"],
      img: "/decisions-data.png",
    },
    {
      eyebrow: "التكامل",
      title: "يشتغل مع المتجر اللي عندك.",
      problem: "نظام منفصل عن متجرك يعني إدخال بيانات مرتين — ومنتجات وأسعار غير متسقة.",
      body: "اربط متجرك الحالي فتتزامن المنتجات والأسعار، أو ابنِ تكاملك الخاص عبر الـAPI والـWebhooks.",
      facts: ["Shopify", "WooCommerce", "Webhooks مخصّصة", "REST API v1"],
      img: "/knowledge-evolves.png",
    },
  ],
  en: [
    {
      eyebrow: "Channels",
      title: "Connect WhatsApp the way that suits you.",
      problem:
        "Most systems force a single connection path — so you either wait on long approvals or give up official status.",
      body: "KEYONE supports both: a fast QR connection to start in minutes, or Meta's official Cloud API for larger-scale operation. Same dashboard either way.",
      facts: ["WhatsApp via QR (Web)", "WhatsApp Cloud API (Meta)", "Web dashboard", "Mobile-friendly", "Developer REST API"],
      img: "/one-platform.png",
    },
    {
      eyebrow: "Understanding",
      title: "Understands the dialect your customer actually writes in.",
      problem:
        "Real customers don't write formal Arabic. A bot that only parses MSA loses the order.",
      body: "Understanding is built on real Arabic dialects alongside MSA and English, and you choose the AI provider that fits — or bring your own key.",
      facts: ["Modern Standard Arabic", "Egyptian · Gulf · Levantine · Maghrebi", "English", "OpenAI · Anthropic · Gemini", "OpenRouter · Groq", "Bring your own key (BYOK)"],
      img: "/ai-understands.png",
    },
    {
      eyebrow: "Orders & customers",
      title: "From a conversation to a completed order.",
      problem:
        "Orders get written on paper or buried in chat threads — and nobody knows which customer matters.",
      body: "Every conversation becomes a customer record and a trackable order, with automatic lead scoring based on purchase intent.",
      facts: ["Smart auto-reply", "CRM with lead scoring", "Order creation and tracking", "Broadcast campaigns"],
      img: "/orders-confidence.png",
    },
    {
      eyebrow: "Decisions & analytics",
      title: "Numbers that tell you the next move.",
      problem: "Without measurement, decisions rest on instinct rather than real performance.",
      body: "Conversations and orders compound into operational reports covering response time, conversion, and growth — with a prepaid wallet that keeps cost visible.",
      facts: ["Analytics and reports", "Response-time and conversion tracking", "Prepaid wallet billing", "Clear consumption tracking"],
      img: "/decisions-data.png",
    },
    {
      eyebrow: "Integrations",
      title: "Works with the store you already run.",
      problem: "A system detached from your store means double data entry — and inconsistent products and prices.",
      body: "Connect your existing store so products and prices stay in sync, or build your own integration through the API and webhooks.",
      facts: ["Shopify", "WooCommerce", "Custom webhooks", "REST API v1"],
      img: "/knowledge-evolves.png",
    },
  ],
} as const;

const INDUSTRIES = {
  ar: ["الأثاث", "السيارات", "العيادات", "العقارات", "المطاعم", "التجارة الإلكترونية"],
  en: ["Furniture", "Cars", "Clinics", "Real estate", "Restaurants", "E-commerce"],
} as const;

const COPY = {
  ar: {
    eyebrow: "المميزات",
    h1: "كل ما تحتاجه للبيع على واتساب.",
    sub: "قنوات ربط مرنة، فهم للهجات العربية، طلبات وعملاء، تحليلات، وتكامل مع متجرك — في منصة واحدة.",
    cta: "ابدأ الآن",
    industriesEyebrow: "القطاعات",
    industriesTitle: "مُجرَّب في قطاعات مختلفة.",
    industriesSub: "نفس المنصة تتشكّل حسب طبيعة عملك ومنتجاتك وأسئلة عملائك.",
    problemLabel: "المشكلة",
    finalTitle: "شوف المنصة على أعمالك.",
    finalSub: "ابدأ حساب واربط رقمك، وجرّب الردود والطلبات بنفسك.",
  },
  en: {
    eyebrow: "Features",
    h1: "Everything you need to sell on WhatsApp.",
    sub: "Flexible connection channels, Arabic dialect understanding, orders and customers, analytics, and store integration — in one platform.",
    cta: "Get started",
    industriesEyebrow: "Industries",
    industriesTitle: "Proven across different sectors.",
    industriesSub: "The same platform adapts to your business, your products, and the questions your customers ask.",
    problemLabel: "The problem",
    finalTitle: "See the platform on your own business.",
    finalSub: "Create an account, connect your number, and try the replies and orders yourself.",
  },
} as const;

export default async function FeaturesPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale = getLocale(searchParams.lang);
  const isRtl = locale === "ar";
  const c = COPY[locale];
  const chapters = CHAPTERS[locale];
  const industries = INDUSTRIES[locale];
  const m = t(locale);
  const cfg = await getSiteConfigSafe();
  const brandName = cfg.brandName || "KEYONE";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const signupHref = `/signup${locale === "en" ? "?lang=en" : ""}`;

  return (
    <main className="bg-canvas text-slate-200" dir={isRtl ? "rtl" : "ltr"}>
      <PublicNav
        brandName={brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        locale={locale}
      />

      {/* ───────── Hero: eyebrow → headline → description → ONE cta ───────── */}
      <section className="relative overflow-hidden px-5 pb-16 pt-36 sm:pt-44">
        <AmbientBackdrop />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <SectionReveal>
            <span className="eyebrow mb-4 inline-block">{c.eyebrow}</span>
            <h1 className="display-heading text-4xl sm:text-5xl lg:text-6xl">{c.h1}</h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-slate-400 sm:text-base">
              {c.sub}
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href={signupHref}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-6 text-sm font-medium text-white shadow-[0_0_28px_rgba(12,122,108,0.28)] transition-colors hover:bg-brand-400"
              >
                {c.cta}
                <Arrow className="h-4 w-4" />
              </Link>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Capability chapters ───────── */}
      {chapters.map((ch, i) => {
        const reversed = i % 2 === 1;
        return (
          <section
            key={ch.eyebrow}
            className="border-t border-white/[0.06] px-5 py-16 sm:py-20"
          >
            <div className="mx-auto max-w-[1180px]">
              <SectionReveal>
                <div
                  className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
                    reversed
                      ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1"
                      : ""
                  }`}
                >
                  {/* Narrative */}
                  <div className="max-w-xl">
                    <span className="eyebrow mb-4 inline-block">{ch.eyebrow}</span>
                    <h2 className="display-heading text-[1.9rem] sm:text-4xl">
                      {ch.title}
                    </h2>

                    {/* Problem — set apart with a gold rule, not a coloured box */}
                    <p className="mt-6 border-s-2 border-gold-500/40 ps-4 text-[13px] leading-relaxed text-slate-500">
                      <span className="font-semibold text-gold-400/90">
                        {c.problemLabel}:
                      </span>{" "}
                      {ch.problem}
                    </p>

                    <p className="mt-5 text-[15px] leading-relaxed text-slate-300">
                      {ch.body}
                    </p>

                    <ul className="mt-6 flex flex-wrap gap-2">
                      {ch.facts.map((f) => (
                        <li
                          key={f}
                          className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-slate-400"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Product visual — the image carries the section (Aveiro image-led) */}
                  <div className="lp-image-panel">
                    <div className="overflow-hidden rounded-[20px] border border-white/[0.07] shadow-[0_18px_70px_rgba(0,0,0,0.42)]">
                      <Image
                        src={ch.img}
                        alt=""
                        width={900}
                        height={506}
                        className="aspect-[16/9] h-auto w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
              </SectionReveal>
            </div>
          </section>
        );
      })}

      {/* ───────── Industries ───────── */}
      <section className="border-t border-white/[0.06] bg-white/[0.012] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <SectionReveal>
            <span className="eyebrow mb-4 inline-block">{c.industriesEyebrow}</span>
            <h2 className="display-heading text-2xl sm:text-3xl">
              {c.industriesTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-400">
              {c.industriesSub}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {industries.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[13px] font-medium text-slate-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Final CTA — one action ───────── */}
      <section className="border-t border-white/[0.06] px-5 py-20">
        <div className="mx-auto max-w-3xl">
          <SectionReveal>
            <div className="surface px-8 py-14 text-center sm:px-12">
              <h2 className="display-heading text-2xl sm:text-3xl">{c.finalTitle}</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
                {c.finalSub}
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href={signupHref}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-6 text-sm font-medium text-white shadow-[0_0_28px_rgba(12,122,108,0.28)] transition-colors hover:bg-brand-400"
                >
                  {c.cta}
                  <Arrow className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

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
          supportWhatsapp: cfg.supportWhatsapp,
          supportEmail: cfg.supportEmail,
        }}
      />
    </main>
  );
}
