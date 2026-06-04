import Link from "next/link";
import { prisma } from "@/lib/db";
import PublicNav from "@/components/ui/public-nav";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import { PublicFooter } from "@/components/ui/public-footer";
import TrustSection from "@/components/ui/trust-section";
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

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav brandName={brandName} supportWhatsapp={cfg.supportWhatsapp} locale={locale} />

      {/* ───────── Video hero ───────── */}
      <HeroSection
        brandName={brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        locale={locale}
        videoSrc="/vedio.mp4"
        ctaPrimary={m.hero.ctaPrimary}
        ctaSecondary={m.hero.ctaSecondary}
      />

      {/* ───────── Stats that lead ───────── */}
      <section className="border-y border-white/[0.06] bg-white/[0.012] px-5 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-white/[0.06]">
            {m.stats.map((s: { num: string; unit?: string; label: string }) => (
              <div key={s.label} className="px-4 text-center">
                <div className="text-3xl font-semibold tabular-nums text-white sm:text-[2rem]">
                  {s.num}
                  {s.unit && <span className="ms-1 text-sm font-normal text-slate-500">{s.unit}</span>}
                </div>
                <div className="mt-1.5 text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Outcomes — not marketing, not before/after ───────── */}
      <section className="border-t border-white/[0.06] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              {isRtl ? "نتائج حقيقية" : "Real outcomes"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {isRtl ? "الشركات التي تستخدم KEYONE تشاهد فرقاً في أول شهر" : "Businesses using KEYONE see measurable results in the first month"}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { value: isRtl ? "15 دقيقة" : "15 min/day", label: isRtl ? "إدارة العمليات اليومية" : "daily operations management", accent: false },
              { value: isRtl ? "5 ثوانٍ" : "5 seconds", label: isRtl ? "متوسط وقت الرد على العملاء" : "average customer reply time", accent: true },
              { value: isRtl ? "~3×" : "~3×", label: isRtl ? "زيادة في تحويل المبيعات" : "increase in sales conversion", accent: false },
            ].map((item, i) => (
              <div key={i} className="surface p-6 text-center">
                <div className={`text-3xl font-semibold tabular-nums sm:text-4xl ${item.accent ? "text-brand-300" : "text-white"}`}>
                  {item.value}
                </div>
                <div className="mt-1.5 text-sm text-slate-500">{item.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 surface p-5 sm:p-6">
            <p className="text-sm leading-relaxed text-slate-300">
              {isRtl
                ? `"قبل ${brandName}، كنا بنضيع ساعات يومياً على الردود اليدوية. دلوقتي كل حاجة بتشتغل تلقائياً — الردود، تتبع الطلبات، والتقارير. الفرق في الشهر الأول كان واضح."`
                : `"Before ${brandName}, we were losing hours on manual replies every day. Now everything runs automatically — replies, order tracking, and reports. The difference was clear in the first month."`
              }
            </p>
            <div className="mt-3 text-xs text-slate-500">
              {isRtl ? "— صاحب متجر إلكتروني، مستخدم منذ 6 أشهر" : "— E-commerce store owner, user for 6 months"}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section id="features" className="px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              {m.features.heading}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {m.features.subheading}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {m.features.items.map((item: { title: string; desc: string }, idx: number) => {
              const Icon = FEATURE_META[idx % FEATURE_META.length].icon;
              return (
                <div key={item.title} className="surface h-full p-5">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    <Icon className="h-4 w-4 text-slate-400" />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold text-white">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{item.desc}</p>
                </div>
              );
            })}
          </div>
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
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              {m.howItWorks.heading}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {m.howItWorks.subheading}
            </p>
          </div>

          <div className="space-y-3">
            {m.howItWorks.steps.map((step: { num: string; title: string; desc: string }) => (
              <div key={step.num} className="surface flex gap-4 p-5 sm:p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/[0.05] text-xs font-semibold text-brand-300">
                  {step.num}
                </div>
                <div className="min-w-0">
                  <h3 className="mb-1 text-sm font-semibold text-white">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Trust ───────── */}
      <TrustSection m={m.trust} dir={m.dir} />

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="border-t border-white/[0.06] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">{m.pricing.heading}</h2>
            <p className="mt-2 text-sm text-slate-500">{m.pricing.subheading}</p>
          </div>

          <PricingCards
            plans={previewPlans}
            variant="preview"
            locale={locale}
            labels={{ perMonth: m.pricing.perMonth }}
          />

          <div className="mt-8 text-center">
            <Link
              href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
              className="btn-outline h-11"
            >
              {m.pricing.viewAll} <Arrow className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="border-y border-white/[0.06] bg-white/[0.012] px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-10 text-center text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">{m.faq.heading}</h2>
          <FaqAccordion items={m.faq.items} />
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="surface px-8 py-14 text-center sm:px-12">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">{m.cta.heading}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">{m.cta.subheading}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
