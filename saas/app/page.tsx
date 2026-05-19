import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { BrandMark, WhatsAppIcon } from "@/components/ui/marketing";
import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import {
  MessageSquare,
  BarChart3,
  Shield,
  Globe,
  Check,
  ArrowLeft,
  Bell,
  Database,
  Users,
  Phone,
  Lock,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getPlans() {
  try {
    return await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    return [];
  }
}

/* ─── Icon maps ─── */
const FEATURE_ICONS: Array<{
  icon: any;
  color: "brand" | "amber" | "emerald" | "purple" | "cyan" | "rose";
}> = [
  { icon: MessageSquare, color: "brand" },
  { icon: Bell, color: "amber" },
  { icon: Database, color: "emerald" },
  { icon: BarChart3, color: "purple" },
  { icon: Globe, color: "cyan" },
  { icon: Shield, color: "rose" },
];

const HERO_TRUST_ICONS = [Lock, Shield, Users];

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
    ? "https://wa.me/" +
      waNum +
      "?text=" +
      encodeURIComponent(
        locale === "ar"
          ? "أريد طلب حساب جديد في " + brandName
          : "I'd like to subscribe to " + brandName,
      )
    : "";

  return (
    <main className="ai-page overflow-x-hidden" dir={m.dir}>
      {/* ───────── Nav ───────── */}
      <PublicNav
        brandName={brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        locale={locale}
      />

      {/* ───────── Hero ───────── */}
      <section className="relative isolate overflow-hidden bg-[#020806] pt-[130px] text-white lg:min-h-screen lg:pt-28">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_82%_28%,rgba(34,197,94,0.28),transparent_31%),radial-gradient(circle_at_16%_74%,rgba(34,197,94,0.12),transparent_34%),linear-gradient(180deg,#020806_0%,#020806_100%)]" />
        <div
          className="absolute inset-0 z-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(34,197,94,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.55) 1px, transparent 1px)",
            backgroundSize: "92px 92px",
            maskImage:
              "radial-gradient(ellipse 78% 62% at 73% 48%, black 18%, transparent 74%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 78% 62% at 73% 48%, black 18%, transparent 74%)",
          }}
        />
        <div className="absolute left-[8%] top-[18%] z-0 hidden h-40 w-40 rounded-full bg-brand-500/10 blur-3xl lg:block" />

        {/* Robot image — desktop only, absolutely positioned on the right */}
        <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden w-[57vw] max-w-[860px] lg:block">
          <div className="absolute inset-y-0 -right-10 left-0">
            <Image
              src="/robot.png"
              alt="روبوت KEYONE للذكاء الاصطناعي"
              fill
              priority
              sizes="57vw"
              className="object-cover object-[50%_12%] opacity-95"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#020806] via-[#020806]/30 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020806]/10 via-transparent to-[#020806]/30" />
          </div>
        </div>

        {/* Outer wrapper: dir=ltr keeps the text block on the visual left */}
        <div
          dir="ltr"
          className="relative z-10 mx-auto max-w-[1440px] px-6 sm:px-10 lg:px-16"
        >
          <div className="flex flex-col lg:min-h-[calc(100vh-7rem)] lg:justify-center">
            {/* Inner text block follows locale direction */}
            <div
              dir={m.dir}
              className="mx-auto w-full max-w-[720px] text-center lg:mx-0 lg:max-w-[690px] lg:pb-12 lg:text-start"
            >
              <div className="inline-flex items-center justify-center gap-3 rounded-full border border-brand-500/60 bg-[#06100d]/80 px-6 py-3 text-base font-black text-white shadow-[0_0_36px_rgba(34,197,94,0.12)] sm:text-lg">
                <span>{m.hero.eyebrow}</span>
                <span className="h-3.5 w-3.5 rounded-full bg-brand-500 shadow-[0_0_18px_rgba(34,197,94,0.9)]" />
              </div>

              <h1 className="mt-8 text-[2.65rem] font-black leading-[1.34] tracking-[-0.045em] text-white drop-shadow-[0_3px_0_rgba(255,255,255,0.08)] sm:text-[3.8rem] lg:text-[4.25rem] xl:text-[4.65rem]">
                <span>{m.hero.h1Line1}</span>
                <br />
                <span>{m.hero.h1Line2}</span>
                <br />
                <span className="bg-gradient-to-l from-brand-300 via-brand-400 to-brand-600 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(34,197,94,0.24)]">
                  {m.hero.h1Line3}
                </span>
              </h1>

              <p className="mx-auto mt-8 max-w-[640px] text-lg font-medium leading-9 text-white/90 sm:text-[1.45rem] sm:leading-[2.5rem] lg:mx-0 lg:text-[1.35rem] lg:leading-10">
                <span className="font-black text-brand-400">{brandName}</span>{" "}
                {m.hero.subtext}
              </p>

              <div className="mt-10 flex flex-col items-center gap-4 lg:flex-row lg:justify-start">
                {waNum ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-14 w-full max-w-[540px] items-center justify-center gap-4 rounded-xl bg-gradient-to-l from-brand-400 to-brand-600 px-7 text-xl font-black text-white shadow-[0_0_34px_rgba(34,197,94,0.36)] transition hover:scale-[1.01] hover:shadow-[0_0_44px_rgba(34,197,94,0.48)] lg:h-12 lg:w-auto lg:min-w-[368px]"
                  >
                    <WhatsAppIcon className="h-9 w-9" />
                    <span>{m.hero.ctaPrimary}</span>
                  </a>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex h-14 w-full max-w-[540px] items-center justify-center gap-4 rounded-xl bg-gradient-to-l from-brand-400 to-brand-600 px-7 text-xl font-black text-white shadow-[0_0_34px_rgba(34,197,94,0.36)] transition hover:scale-[1.01] hover:shadow-[0_0_44px_rgba(34,197,94,0.48)] lg:h-12 lg:w-auto lg:min-w-[368px]"
                  >
                    {m.hero.ctaPrimary}
                    <ArrowLeft className="h-6 w-6" />
                  </Link>
                )}
                <Link
                  href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                  className="inline-flex h-14 w-full max-w-[540px] items-center justify-center rounded-xl border border-white/30 bg-black/20 px-7 text-xl font-black text-white shadow-[inset_0_0_0_1px_rgba(34,197,94,0.15)] transition hover:border-brand-400/80 hover:bg-brand-500/10 lg:h-12 lg:w-auto lg:min-w-[238px]"
                >
                  {m.hero.ctaSecondary}
                </Link>
              </div>

              {/* Trust items */}
              <div className="mx-auto mt-11 grid w-full max-w-[660px] grid-cols-3 text-white/90 lg:mx-0">
                {m.hero.trustItems.map((label, index) => {
                  const Icon = HERO_TRUST_ICONS[index];
                  return (
                    <div
                      key={label}
                      className={
                        "flex min-h-[88px] flex-col items-center justify-center gap-2 px-2 text-center " +
                        (index > 0 ? "border-s border-brand-500/30" : "")
                      }
                    >
                      <Icon className="h-8 w-8 text-brand-400" />
                      <span className="text-sm font-bold leading-6 sm:text-base">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Robot image — mobile only */}
            <div className="relative -mx-6 mt-4 h-[650px] overflow-hidden sm:-mx-10 lg:hidden">
              <Image
                src="/robot.png"
                alt="روبوت KEYONE للذكاء الاصطناعي"
                fill
                priority
                sizes="100vw"
                className="object-cover object-[50%_0%]"
              />
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#020806] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#020806] to-transparent" />
              <div className="absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-[#020806] to-transparent" />
              <div className="absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[#020806] to-transparent" />

              <div
                dir={m.dir}
                className="absolute bottom-8 left-9 right-9 rounded-3xl border border-brand-500/30 bg-[#0b2119]/90 p-5 shadow-2xl shadow-brand-500/25 backdrop-blur-xl"
              >
                <div className="flex items-center justify-start gap-4">
                  <BrandMark
                    className="h-14 w-14 rounded-2xl"
                    iconClassName="h-8 w-8"
                  />
                  <div className="text-start">
                    <div className="text-2xl font-black text-white">
                      {m.hero.mobileCardTitle}
                    </div>
                    <div className="mt-1 flex items-center justify-start gap-2 text-base font-semibold text-white/80">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-400 shadow-[0_0_14px_rgba(34,197,94,0.9)]" />
                      <span>{m.hero.mobileCardStatus}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Stats ───────── */}
      <section className="border-y border-white/[0.06] bg-white/[0.016] px-4 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {m.stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-4xl font-bold tabular-nums text-white">
                  {s.num}
                  {s.unit && (
                    <span className="ml-1 text-lg font-normal text-slate-400">
                      {s.unit}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="ai-section">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <p className="eyebrow mb-3">{m.features.eyebrow}</p>
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {m.features.heading}
            </h2>
            <p className="mx-auto max-w-2xl text-slate-400">
              {m.features.subheading}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {m.features.items.map((item, idx) => (
              <FeatureCard
                key={item.title}
                icon={FEATURE_ICONS[idx].icon}
                color={FEATURE_ICONS[idx].color}
                title={item.title}
                desc={item.desc}
                className={idx === 0 ? "lg:col-span-2" : ""}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section
        id="how"
        className="border-y border-white/[0.06] bg-white/[0.016] ai-section"
      >
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {m.howItWorks.heading}
            </h2>
            <p className="text-slate-400">{m.howItWorks.subheading}</p>
          </div>

          <div className="space-y-0">
            {m.howItWorks.steps.map((step) => (
              <div
                key={step.num}
                className="flex gap-8 py-8 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-white/[0.06]"
              >
                <div className="font-en shrink-0 text-4xl font-bold tabular-nums text-brand-500/30">
                  {step.num}
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-7 text-slate-400">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="ai-section">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {m.pricing.heading}
            </h2>
            <p className="text-slate-400">{m.pricing.subheading}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan: any) => {
              const features: string[] = JSON.parse(
                plan.features || "[]",
              ).slice(0, 4);
              const popular = plan.popular;
              return (
                <div
                  key={plan.slug}
                  className={`relative rounded-2xl border p-6 transition ${
                    popular
                      ? "card-featured border-brand-500/40"
                      : "border-white/[0.08] bg-white/[0.038]"
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-3 inset-x-0 flex justify-center">
                      <span className="bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-medium px-3 py-0.5 rounded-full">
                        {plan.highlight}
                      </span>
                    </div>
                  )}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 min-h-[2rem] text-xs text-slate-400">
                    {plan.description}
                  </p>
                  <div className="my-4">
                    <span className="text-3xl font-bold tabular-nums">
                      ${plan.priceUsd}
                    </span>
                    <span className="text-sm text-slate-400">
                      {m.pricing.perMonth}
                    </span>
                  </div>
                  <ul className="mb-5 space-y-2 text-sm text-slate-200">
                    {features.map((f: string) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Link
              href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
              className="ai-btn ai-btn-primary px-6 py-3"
            >
              {m.pricing.viewAll} <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section
        id="faq"
        className="border-y border-white/[0.06] bg-white/[0.016] ai-section"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {m.faq.heading}
          </h2>
          <div className="space-y-3">
            {m.faq.items.map((item) => (
              <details
                key={item.q}
                className="group ai-card overflow-hidden rounded-2xl"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
                  <span className="font-medium">{item.q}</span>
                  <span className="text-brand-400 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-slate-300">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="ai-section !py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {m.cta.heading}
          </h2>
          <p className="mb-8 text-base text-slate-400">{m.cta.subheading}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {waNum ? (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent(
                  locale === "ar"
                    ? "أريد طلب اشتراك في " + brandName
                    : "I'd like to subscribe to " + brandName,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ai-btn ai-btn-primary px-6 py-3"
              >
                <Phone className="h-4 w-4" /> {m.cta.primary}
              </a>
            ) : (
              <Link
                href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                className="ai-btn ai-btn-primary px-6 py-3"
              >
                {m.cta.primary} <ArrowLeft className="h-4 w-4" />
              </Link>
            )}
            <Link
              href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
              className="ai-btn ai-btn-ghost px-6 py-3 text-sm"
            >
              {m.cta.secondary}
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-white/5 px-4 py-10">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 text-sm sm:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2 font-bold">
              <BrandMark />
              <span>{brandName}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {cfg.brandTagline}
            </p>
          </div>
          <div>
            <div className="mb-3 font-medium text-slate-300">
              {m.footer.product}
            </div>
            <ul className="space-y-2 text-slate-400">
              <li>
                <a href="#features" className="hover:text-white">
                  {m.footer.features}
                </a>
              </li>
              <li>
                <Link
                  href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                  className="hover:text-white"
                >
                  {m.footer.pricing}
                </Link>
              </li>
              <li>
                <a href="#faq" className="hover:text-white">
                  {m.footer.faq}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-medium text-slate-300">
              {m.footer.company}
            </div>
            <ul className="space-y-2 text-slate-400">
              <li>
                <Link href="/terms" className="hover:text-white">
                  {m.footer.terms}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white">
                  {m.footer.privacy}
                </Link>
              </li>
              {cfg.supportEmail && (
                <li>
                  <a
                    href={`mailto:${cfg.supportEmail}`}
                    className="hover:text-white"
                  >
                    {cfg.supportEmail}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <div className="mb-3 font-medium text-slate-300">
              {m.footer.contact}
            </div>
            <ul className="space-y-2 text-slate-400">
              {waNum && (
                <li>
                  <a
                    href={`https://wa.me/${waNum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    <Phone className="h-3 w-3" /> {m.footer.whatsapp}
                  </a>
                </li>
              )}
              <li>
                <Link href="/login" className="hover:text-white">
                  {m.footer.login}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl border-t border-white/5 pt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {brandName}. {m.footer.copyright}
        </div>
      </footer>
    </main>
  );
}

/* ─────────── Helper components ─────────── */

function FeatureCard({
  icon: Icon,
  title,
  desc,
  color,
  className,
}: {
  icon: any;
  title: string;
  desc: string;
  color: "brand" | "amber" | "emerald" | "purple" | "cyan" | "rose";
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    brand:
      "from-brand-500/20 to-brand-500/5 text-brand-400 border-brand-500/20",
    amber:
      "from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/20",
    emerald:
      "from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20",
    purple:
      "from-purple-500/20 to-purple-500/5 text-purple-400 border-purple-500/20",
    cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-400 border-cyan-500/20",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-400 border-rose-500/20",
  };
  return (
    <div
      className={`group ai-card p-6 transition hover:border-brand-500/30 hover:bg-white/[0.07]${
        className ? " " + className : ""
      }`}
    >
      <div
        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl border bg-gradient-to-br ${colorMap[color]}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-2 font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-slate-300">{desc}</p>
    </div>
  );
}
