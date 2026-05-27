import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import { PublicFooter } from "@/components/ui/public-footer";
import { FadeIn, SectionReveal, StaggerItem, HoverCard } from "@/components/ui/section-reveal";
import {
  MessageSquare,
  BarChart3,
  Shield,
  Globe,
  Check,
  ArrowLeft,
  Bell,
  Database,
  Lock,
  Users,
  Phone,
  Sparkles,
  Clock,
  Zap,
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

const FEATURES_CONFIG: Array<{ icon: ComponentType<{ className?: string }>; accent: string }> = [
  { icon: MessageSquare, accent: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
  { icon: Bell, accent: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
  { icon: Database, accent: "border-sky-500/20 bg-sky-500/10 text-sky-400" },
  { icon: BarChart3, accent: "border-purple-500/20 bg-purple-500/10 text-purple-400" },
  { icon: Globe, accent: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400" },
  { icon: Shield, accent: "border-rose-500/20 bg-rose-500/10 text-rose-400" },
];

const randomIndex = (i: number) => i % FEATURES_CONFIG.length;

export default async function LandingPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale = getLocale(searchParams.lang);
  const m = t(locale);

  const [plans, cfg] = await Promise.all([getPlans(), getSiteConfig()]);
  const brandName = cfg.brandName || "KEYONE";
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
  const waHref = waNum
    ? "https://wa.me/" + waNum + "?text=" + encodeURIComponent(
        locale === "ar" ? "أريد طلب حساب جديد في " + brandName : "I'd like to subscribe to " + brandName,
      )
    : "";

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav brandName={brandName} supportWhatsapp={cfg.supportWhatsapp} locale={locale} />

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden pt-28 pb-20 sm:pb-28 md:min-h-[90vh] md:pt-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(34,197,94,0.08),transparent_60%),radial-gradient(ellipse_at_80%_50%,rgba(34,197,94,0.04),transparent_50%),radial-gradient(ellipse_at_20%_80%,rgba(34,197,94,0.03),transparent_50%)]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="max-w-[640px]">
              <FadeIn delay={0.1}>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-slate-400">
                  <Sparkles className="h-3 w-3 text-brand-400" />
                  {m.hero.eyebrow}
                </div>
              </FadeIn>

              <FadeIn delay={0.2}>
                <h1 className="text-[2.25rem] font-black leading-[1.2] tracking-[-0.04em] text-white sm:text-[3.5rem] md:text-[4rem] lg:text-[4.25rem]">
                  <span>{m.hero.h1Line1}</span>
                  <br />
                  <span>{m.hero.h1Line2}</span>
                  <br />
                  <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-600 bg-clip-text text-transparent">
                    {m.hero.h1Line3}
                  </span>
                </h1>
              </FadeIn>

              <FadeIn delay={0.3}>
                <p className="mt-6 text-base leading-relaxed text-slate-400 sm:text-lg">
                  <span className="font-semibold text-white">{brandName}</span>{" "}
                  {m.hero.subtext}
                </p>
              </FadeIn>

              <FadeIn delay={0.35}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {waNum ? (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-brand-500 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400 active:scale-[0.97]"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      {m.hero.ctaPrimary}
                    </a>
                  ) : (
                    <Link
                      href="/pricing"
                      className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-brand-500 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400 active:scale-[0.97]"
                    >
                      {m.hero.ctaPrimary}
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  )}
                  <Link
                    href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-6 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                  >
                    {m.hero.ctaSecondary}
                  </Link>
                </div>
              </FadeIn>

              <FadeIn delay={0.4}>
                <div className="mt-10 flex items-center gap-8 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-slate-600" />
                    {m.hero.trustItems[0]}
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-slate-600" />
                    {m.hero.trustItems[1]}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-slate-600" />
                    {m.hero.trustItems[2]}
                  </div>
                </div>
              </FadeIn>
            </div>

            <FadeIn delay={0.25} className="hidden lg:block">
              <div className="relative aspect-[4/5] w-full">
                <Image
                  src="/robot.png"
                  alt="KEYONE AI"
                  fill
                  priority
                  sizes="(max-width: 1024px) 0px, 50vw"
                  className="object-contain object-bottom"
                />
              </div>
            </FadeIn>
          </div>
        </div>

        {/* Mobile robot */}
        <FadeIn delay={0.3}>
          <div className="relative mx-5 mt-8 aspect-[16/10] overflow-hidden rounded-2xl border border-white/[0.06] lg:hidden">
            <Image
              src="/robot.png"
              alt="KEYONE AI"
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#020806] to-transparent" />
          </div>
        </FadeIn>
      </section>

      {/* ───────── Stats ───────── */}
      <section className="border-y border-white/[0.06] bg-white/[0.015] px-5 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {m.stats.map((s: { num: string; unit?: string; label: string }) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold tabular-nums text-white">
                  {s.num}
                  {s.unit && <span className="mr-1 text-sm font-normal text-slate-500">{s.unit}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="ai-section">
        <div className="ai-container">
          <SectionReveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand-400/70">
                {m.features.eyebrow}
              </span>
              <h2 className="text-3xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
                {m.features.heading}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
                {m.features.subheading}
              </p>
            </div>
          </SectionReveal>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {m.features.items.map((item: { title: string; desc: string }, idx: number) => {
              const cfg = FEATURES_CONFIG[randomIndex(idx)];
              const Icon = cfg.icon;
              return (
                <StaggerItem key={item.title} index={idx}>
                  <HoverCard className="ai-card p-6">
                    <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border ${cfg.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-white">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-400">{item.desc}</p>
                  </HoverCard>
                </StaggerItem>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how" className="border-y border-white/[0.06] bg-white/[0.015] ai-section">
        <div className="ai-container max-w-4xl">
          <SectionReveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand-400/70">
                {locale === "ar" ? "الخطوات" : "Process"}
              </span>
              <h2 className="text-3xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
                {m.howItWorks.heading}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
                {m.howItWorks.subheading}
              </p>
            </div>
          </SectionReveal>

          <div className="space-y-0">
            {m.howItWorks.steps.map((step: { num: string; title: string; desc: string }, idx: number) => (
              <SectionReveal key={step.num} index={idx}>
                <div className="flex gap-6 py-8 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-white/[0.06]">
                  <div className="font-en flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-sm font-bold text-brand-400">
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
      </section>

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="ai-section">
        <div className="ai-container">
          <SectionReveal>
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand-400/70">
                {locale === "ar" ? "الباقات" : "Plans"}
              </span>
              <h2 className="text-3xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
                {m.pricing.heading}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
                {m.pricing.subheading}
              </p>
            </div>
          </SectionReveal>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan: any, idx: number) => {
              const features: string[] = JSON.parse(plan.features || "[]").slice(0, 4);
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
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <p className="mt-1 min-h-[2rem] text-xs text-slate-500">{plan.description}</p>
                    <div className="my-4">
                      <span className="text-3xl font-bold tabular-nums text-white">${plan.priceUsd}</span>
                      <span className="mr-1 text-sm text-slate-500">{m.pricing.perMonth}</span>
                    </div>
                    <ul className="mb-5 space-y-2 text-sm text-slate-400">
                      {features.map((f: string) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </HoverCard>
                </StaggerItem>
              );
            })}
          </div>

          <SectionReveal>
            <div className="mt-8 text-center">
              <Link
                href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                {m.pricing.viewAll} <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="border-y border-white/[0.06] bg-white/[0.015] ai-section">
        <div className="ai-container max-w-3xl">
          <SectionReveal>
            <h2 className="mb-12 text-center text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
              {m.faq.heading}
            </h2>
          </SectionReveal>
          <div className="space-y-3">
            {m.faq.items.map((item: { q: string; a: string }, idx: number) => (
              <SectionReveal key={item.q} index={idx}>
                <details className="group ai-card overflow-hidden rounded-2xl">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium text-white">
                    {item.q}
                    <span className="ml-2 text-lg text-slate-500 transition group-open:rotate-45">+</span>
                  </summary>
                  <div className="px-5 pb-4 text-sm leading-relaxed text-slate-400">
                    {item.a}
                  </div>
                </details>
              </SectionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="ai-section !py-24">
        <div className="ai-container max-w-2xl text-center">
          <SectionReveal>
            <h2 className="text-3xl font-bold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
              {m.cta.heading}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">
              {m.cta.subheading}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {waNum ? (
                <a
                  href={`https://wa.me/${waNum}?text=${encodeURIComponent(
                    locale === "ar" ? "أريد طلب اشتراك في " + brandName : "I'd like to subscribe to " + brandName,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-brand-500 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400 active:scale-[0.97]"
                >
                  <Phone className="h-4 w-4" /> {m.cta.primary}
                </a>
              ) : (
                <Link
                  href="/pricing"
                  className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-brand-500 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-400 active:scale-[0.97]"
                >
                  {m.cta.primary} <ArrowLeft className="h-4 w-4" />
                </Link>
              )}
              <Link
                href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-6 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                {m.cta.secondary}
              </Link>
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
