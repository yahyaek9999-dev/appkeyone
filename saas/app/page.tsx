import Link from "next/link";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { WhatsAppIcon, AmbientBackdrop } from "@/components/ui/marketing";
import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import { PublicFooter } from "@/components/ui/public-footer";
import {
  FadeIn,
  SectionReveal,
  StaggerItem,
  HoverCard,
} from "@/components/ui/section-reveal";
import TrustSection from "@/components/ui/trust-section";
import IntegrationsWhatsApp from "@/components/ui/integrations-whatsapp";
import FaqAccordion from "@/components/ui/faq-accordion";
import PricingCards, { type PricingPlan } from "@/components/ui/pricing-cards";
import {
  MessageSquare,
  BarChart3,
  Shield,
  TrendingUp,
  ArrowLeft,
  ArrowRight,
  Bell,
  Database,
  CheckCircle2,
  Users,
  Phone,
  Zap,
  ShoppingCart,
  RefreshCw,
  Lock,
} from "lucide-react";
import type { ComponentType } from "react";

export const dynamic = "force-dynamic";

async function getPlans() {
  try {
    return await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    return [];
  }
}

// Feature icon + accent per index (kept stable, not random — looks intentional).
const FEATURE_META: Array<{
  icon: ComponentType<{ className?: string }>;
  accent: string;
}> = [
  { icon: Zap, accent: "text-amber-300" },
  { icon: ShoppingCart, accent: "text-brand-300" },
  { icon: RefreshCw, accent: "text-sky-300" },
  { icon: BarChart3, accent: "text-violet-300" },
  { icon: Bell, accent: "text-cyan-300" },
  { icon: Shield, accent: "text-rose-300" },
];

// Intentional bento spans for the 6 features (3-col grid → balanced asymmetry).
const FEATURE_SPAN = [
  "lg:col-span-2",
  "lg:col-span-1",
  "lg:col-span-1",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-1",
];

// ── WhatsApp Product Mockup ──────────────────────────────────────────────────
// Shows a live-feeling WhatsApp conversation to communicate core value instantly.
// No external images — pure HTML/CSS so it's always sharp and loads instantly.
function WhatsAppProductMockup({ dir, compact }: { dir?: string; compact?: boolean }) {
  const isRtl = dir === "rtl";
  return (
    <div className={`relative ${compact ? "mx-auto max-w-sm" : ""}`}>
      {/* Outer phone-style card */}
      <div className="relative rounded-2xl border border-white/[0.09] bg-[#0d1117] shadow-2xl overflow-hidden">
        {/* WhatsApp header */}
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

        {/* Chat bubbles */}
        <div className="space-y-3 px-4 py-4 text-sm" dir={isRtl ? "rtl" : "ltr"}>
          {/* Customer message */}
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2.5 text-slate-200 leading-relaxed">
              <p>عايز أعرف الأسعار واللي عندكم من منتجات</p>
              <p className="text-[10px] text-slate-500 mt-1">09:14</p>
            </div>
          </div>

          {/* AI response */}
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

          {/* Customer reply */}
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2.5 text-slate-200 leading-relaxed">
              <p>عايز الاحترافية ✅</p>
              <p className="text-[10px] text-slate-500 mt-1">09:15</p>
            </div>
          </div>

          {/* Order detected badge */}
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2">
            <ShoppingCart className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-medium text-amber-300">طلب جديد مكتشف — باقة احترافية</span>
          </div>
        </div>

        {/* Bottom action */}
        <div className="border-t border-white/[0.06] bg-[#111a14] px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-slate-500 text-xs">
            <span className="flex-1">KEYONE يكمل المتابعة تلقائياً…</span>
            <Zap className="h-3.5 w-3.5 text-brand-400" />
          </div>
        </div>
      </div>

      {/* Floating metrics card */}
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

      {/* Floating response time badge */}
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

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav brandName={brandName} supportWhatsapp={cfg.supportWhatsapp} locale={locale} />

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden pb-20 pt-32 sm:pb-28 md:min-h-[92vh] md:pt-40">
        <AmbientBackdrop />

        <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div className="max-w-[660px]">
              <FadeIn delay={0.05}>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/8 px-3.5 py-1.5 text-xs font-medium text-brand-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                  {m.hero.eyebrow}
                </div>
              </FadeIn>

              <FadeIn delay={0.12}>
                <h1 className="display-heading text-[2.5rem] sm:text-[3.5rem] md:text-[4rem]">
                  <span className="block">{m.hero.h1Line1}</span>
                  <span className="block">{m.hero.h1Line2}</span>
                  <span className="block bg-gradient-to-l from-brand-200 via-brand-400 to-brand-500 bg-clip-text text-transparent">
                    {m.hero.h1Line3}
                  </span>
                </h1>
              </FadeIn>

              <FadeIn delay={0.2}>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
                  <span className="font-semibold text-white">{brandName}</span> {m.hero.subtext}
                </p>
              </FadeIn>

              <FadeIn delay={0.28}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  {waNum ? (
                    <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn-premium h-12">
                      <WhatsAppIcon className="h-4 w-4" />
                      {m.hero.ctaPrimary}
                    </a>
                  ) : (
                    <Link href="/pricing" className="btn-premium h-12">
                      {m.hero.ctaPrimary}
                      <Arrow className="h-4 w-4" />
                    </Link>
                  )}
                  <Link
                    href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                    className="btn-outline h-12"
                  >
                    {m.hero.ctaSecondary}
                  </Link>
                </div>
              </FadeIn>

              <FadeIn delay={0.36}>
                <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-slate-500">
                  {[Lock, Shield, Users].map((Icon, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-slate-600" />
                      {m.hero.trustItems[i]}
                    </div>
                  ))}
                </div>
              </FadeIn>
            </div>

            <FadeIn delay={0.18} className="hidden lg:block">
              <WhatsAppProductMockup dir={m.dir} />
            </FadeIn>
          </div>
        </div>

        {/* Mobile product mockup */}
        <FadeIn delay={0.25}>
          <div className="mx-5 mt-10 lg:hidden">
            <WhatsAppProductMockup dir={m.dir} compact />
          </div>
        </FadeIn>
      </section>

      {/* ───────── Stats ───────── */}
      <section className="border-y border-white/[0.06] bg-white/[0.012] px-5 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-white/[0.06]">
            {m.stats.map((s: { num: string; unit?: string; label: string }) => (
              <FadeIn key={s.label} className="px-4 text-center">
                <div className="text-3xl font-bold tabular-nums text-white sm:text-[2rem]">
                  {s.num}
                  {s.unit && <span className="ms-1 text-sm font-normal text-slate-500">{s.unit}</span>}
                </div>
                <div className="mt-1.5 text-xs text-slate-500">{s.label}</div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Results / Case Study ───────── */}
      <section className="ai-section border-t border-white/[0.06]">
        <div className="ai-container max-w-5xl">
          <SectionReveal>
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <span className="eyebrow mb-4 inline-block">
                {isRtl ? "قصص نجاح حقيقية" : "Real Results"}
              </span>
              <h2 className="display-heading text-3xl sm:text-4xl">
                {isRtl ? "قبل وبعد KEYONE" : "Before & After KEYONE"}
              </h2>
            </div>
          </SectionReveal>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Before */}
            <SectionReveal index={0}>
              <div className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.03] p-6 h-full">
                <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5">
                  <span className="text-xs font-semibold text-rose-400">
                    {isRtl ? "قبل KEYONE" : "Before KEYONE"}
                  </span>
                </div>
                <ul className="space-y-4">
                  {(isRtl ? [
                    ["يوميًا 4-6 ساعات", "ردود يدوية على واتساب", "rose"],
                    ["30-50%", "من الاستفسارات لا تُجاب في الوقت المناسب", "rose"],
                    ["رسائل ضائعة", "طلبات تُفوَّت في ساجات الإغلاق أو الانشغال", "rose"],
                    ["لا بيانات", "تتبع يدوي أو شبه معدوم للمبيعات", "rose"],
                  ] : [
                    ["4-6 hrs/day", "Manual WhatsApp replies", "rose"],
                    ["30-50%", "of inquiries missed or delayed", "rose"],
                    ["Lost sales", "Orders missed when unavailable", "rose"],
                    ["No data", "Manual or no sales tracking", "rose"],
                  ]).map(([val, label]) => (
                    <li key={String(label)} className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded-full border border-rose-500/30 bg-rose-500/10 flex items-center justify-center shrink-0">
                        <span className="text-rose-400 text-[10px] font-bold">✕</span>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-rose-300">{val}</span>
                        <span className="text-sm text-slate-400 ms-2">{label}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionReveal>

            {/* After */}
            <SectionReveal index={1}>
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-6 h-full">
                <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-brand-500/25 bg-brand-500/12 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                  <span className="text-xs font-semibold text-brand-300">
                    {isRtl ? "مع KEYONE" : "With KEYONE"}
                  </span>
                </div>
                <ul className="space-y-4">
                  {(isRtl ? [
                    ["15 دقيقة/يوم", "مراجعة التقارير — الباقي تلقائي", "brand"],
                    ["100%", "كل عميل يتلقى رداً خلال 5 ثوانٍ", "brand"],
                    ["3× تحويلات", "المتابعة التلقائية تُغلق المبيعات المعلقة", "brand"],
                    ["لوحة إيرادات", "طلبات ومبيعات وعملاء في الوقت الفعلي", "brand"],
                  ] : [
                    ["15 min/day", "Review reports — rest is automated", "brand"],
                    ["100%", "every customer answered in 5 seconds", "brand"],
                    ["3× conversions", "Smart follow-ups close pending sales", "brand"],
                    ["Revenue dashboard", "Orders, sales, customers in real-time", "brand"],
                  ]).map(([val, label]) => (
                    <li key={String(label)} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-400 shrink-0" />
                      <div>
                        <span className="text-sm font-bold text-brand-300">{val}</span>
                        <span className="text-sm text-slate-400 ms-2">{label}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionReveal>
          </div>

          {/* Testimonial */}
          <SectionReveal index={2}>
            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center text-brand-300 font-bold text-lg">م</div>
                <div className="min-w-0 flex-1">
                  <p className="text-base text-slate-300 leading-relaxed">
                    {isRtl
                      ? '"قبل KEYONE كنا نضيع ساعات يومياً على واتساب. دلوقتي البوت بيرد على كل حاجة وإحنا شايفين الطلبات في اللوحة تلقائياً. المبيعات زادت بشكل واضح في أول شهر."'
                      : '"Before KEYONE we spent hours daily on WhatsApp. Now the bot handles everything and we see orders in the dashboard automatically. Sales improved noticeably in the first month."'
                    }
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {isRtl ? "محمد — متجر إلكتروني" : "Mohammad — E-commerce store"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {isRtl ? "مستخدم KEYONE منذ 8 أشهر" : "KEYONE user for 8 months"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── Features (bento) ───────── */}
      <section id="features" className="ai-section">
        <div className="ai-container">
          <SectionReveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="eyebrow mb-4 inline-block">{m.features.eyebrow}</span>
              <h2 className="display-heading text-3xl sm:text-4xl">{m.features.heading}</h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
                {m.features.subheading}
              </p>
            </div>
          </SectionReveal>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {m.features.items.map((item: { title: string; desc: string }, idx: number) => {
              const meta = FEATURE_META[idx % FEATURE_META.length];
              const Icon = meta.icon;
              const wide = FEATURE_SPAN[idx] === "lg:col-span-2";
              return (
                <StaggerItem key={item.title} index={idx} className={FEATURE_SPAN[idx]}>
                  <HoverCard className="surface surface-hover noise h-full p-6">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                      <Icon className={`h-5 w-5 ${meta.accent}`} />
                    </div>
                    <h3 className={`mb-2 font-semibold text-white ${wide ? "text-lg" : "text-base"}`}>
                      {item.title}
                    </h3>
                    <p className="max-w-md text-sm leading-relaxed text-slate-400">{item.desc}</p>
                  </HoverCard>
                </StaggerItem>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── Integrations (WhatsApp) ───────── */}
      <IntegrationsWhatsApp m={m.integrations} dir={m.dir} />

      {/* ───────── How it works ───────── */}
      <section id="how" className="ai-section">
        <div className="ai-container max-w-3xl">
          <SectionReveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="eyebrow mb-4 inline-block">{locale === "ar" ? "الخطوات" : "Process"}</span>
              <h2 className="display-heading text-3xl sm:text-4xl">{m.howItWorks.heading}</h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
                {m.howItWorks.subheading}
              </p>
            </div>
          </SectionReveal>

          <div className="relative">
            {/* connector line */}
            <div className="absolute bottom-6 top-6 hidden w-px bg-gradient-to-b from-brand-500/30 via-white/10 to-transparent sm:block start-5" aria-hidden="true" />
            <div className="space-y-3">
              {m.howItWorks.steps.map((step: { num: string; title: string; desc: string }, idx: number) => (
                <SectionReveal key={step.num} index={idx}>
                  <div className="surface surface-hover relative flex gap-5 p-5 sm:p-6">
                    <div className="font-en relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-500/25 bg-[#040b08] text-sm font-bold text-brand-300">
                      {step.num}
                    </div>
                    <div className="min-w-0">
                      <h3 className="mb-1.5 text-base font-semibold text-white">{step.title}</h3>
                      <p className="text-sm leading-relaxed text-slate-400">{step.desc}</p>
                    </div>
                  </div>
                </SectionReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Trust ───────── */}
      <TrustSection m={m.trust} dir={m.dir} />

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="ai-section border-t border-white/[0.06]">
        <div className="ai-container">
          <SectionReveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="eyebrow mb-4 inline-block">{locale === "ar" ? "الباقات" : "Plans"}</span>
              <h2 className="display-heading text-3xl sm:text-4xl">{m.pricing.heading}</h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
                {m.pricing.subheading}
              </p>
            </div>
          </SectionReveal>

          <PricingCards
            plans={previewPlans}
            variant="preview"
            locale={locale}
            labels={{ perMonth: m.pricing.perMonth }}
          />

          <SectionReveal>
            <div className="mt-9 text-center">
              <Link
                href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                className="btn-outline h-11"
              >
                {m.pricing.viewAll} <Arrow className="h-4 w-4" />
              </Link>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="ai-section border-y border-white/[0.06] bg-white/[0.012]">
        <div className="ai-container max-w-3xl">
          <SectionReveal>
            <h2 className="display-heading mb-12 text-center text-3xl sm:text-4xl">{m.faq.heading}</h2>
          </SectionReveal>
          <SectionReveal index={1}>
            <FaqAccordion items={m.faq.items} />
          </SectionReveal>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="ai-section !py-28">
        <div className="ai-container max-w-3xl">
          <SectionReveal>
            <div className="surface noise relative overflow-hidden rounded-3xl px-6 py-14 text-center shadow-float sm:px-12">
              <div className="absolute inset-x-0 -top-1/2 h-full bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(34,197,94,0.12),transparent_70%)]" aria-hidden="true" />
              <div className="relative">
                <h2 className="display-heading text-3xl sm:text-4xl">{m.cta.heading}</h2>
                <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">
                  {m.cta.subheading}
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  {waNum ? (
                    <a
                      href={`https://wa.me/${waNum}?text=${encodeURIComponent(
                        locale === "ar"
                          ? "أريد طلب اشتراك في " + brandName
                          : "I'd like to subscribe to " + brandName,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-premium h-12"
                    >
                      <Phone className="h-4 w-4" /> {m.cta.primary}
                    </a>
                  ) : (
                    <Link href="/pricing" className="btn-premium h-12">
                      {m.cta.primary} <Arrow className="h-4 w-4" />
                    </Link>
                  )}
                  <Link
                    href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                    className="btn-outline h-12"
                  >
                    {m.cta.secondary}
                  </Link>
                </div>
              </div>
            </div>
          </SectionReveal>
        </div>
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
          brandName,
          brandTagline: cfg.brandTagline,
          supportWhatsapp: cfg.supportWhatsapp,
          supportEmail: cfg.supportEmail,
        }}
      />
    </main>
  );
}
