import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteConfig } from "@/lib/admin";
import PublicNav from "@/components/ui/public-nav";
import { WhatsAppIcon } from "@/components/ui/marketing";
import { getLocale, t } from "@/lib/i18n";
import { Check, ArrowLeft, MessageCircle, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "الأسعار والباقات",
  description:
    "اختر الباقة المناسبة لحجم أعمالك. خطط مرنة بالدولار، بدون رسوم خفية.",
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
      ? locale === "ar"
        ? "سنوي"
        : "yearly"
      : locale === "ar"
        ? "شهري"
        : "monthly";
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
        <div className="ai-container max-w-5xl text-center">
          <p className="eyebrow mb-3">{m.pricingPage.eyebrow}</p>
          <h1 className="ai-heading mb-4 text-4xl sm:text-5xl">
            {m.pricingPage.heading}
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-300">
            {m.pricingPage.subheading}
          </p>
        </div>
      </section>

      {/* ───────── Plans ───────── */}
      <section className="ai-section !py-12">
        <div className="ai-container max-w-7xl grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan: any) => {
            const features: string[] = JSON.parse(plan.features || "[]");
            const popular = plan.popular;
            return (
              <div
                key={plan.slug}
                className={`relative rounded-2xl border p-6 transition ${
                  popular
                    ? "card-featured border-brand-500/45 shadow-[0_0_44px_rgba(34,197,94,0.14)]"
                    : "ai-card hover:border-brand-500/25"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 inset-x-0 flex justify-center">
                    <span className="bg-gradient-to-r from-brand-500 to-brand-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {plan.highlight}
                    </span>
                  </div>
                )}
                <div className="mb-1 text-sm text-slate-400">
                  {plan.nameEn || ""}
                </div>
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-sm text-slate-400 mb-5 min-h-[2.5rem]">
                  {plan.description}
                </p>

                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-4xl font-bold tabular-nums">
                    ${plan.priceUsd}
                  </span>
                  <span className="text-slate-400 text-sm">
                    {m.pricingPage.perMonth}
                  </span>
                </div>

                {plan.yearlyUsd && (
                  <div className="text-xs text-emerald-400 mb-5">
                    {locale === "ar"
                      ? `أو $${plan.yearlyUsd}/سنة — وفّر $${plan.priceUsd * 12 - plan.yearlyUsd}`
                      : `Or $${plan.yearlyUsd}/yr — save $${plan.priceUsd * 12 - plan.yearlyUsd}`}
                  </div>
                )}

                <ul className="space-y-3 mb-6 text-sm">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-slate-200">{f}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={waLink(plan.name, plan.priceUsd)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`ai-btn w-full py-3 text-sm transition ${
                    popular ? "ai-btn-primary" : "ai-btn-ghost"
                  }`}
                >
                  <WhatsAppIcon className="h-4 w-4" />{" "}
                  {m.pricingPage.subscribeCta}
                </a>

                {plan.yearlyUsd && (
                  <a
                    href={waLink(plan.name, plan.yearlyUsd, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-xs text-slate-400 hover:text-slate-200 mt-3"
                  >
                    {locale === "ar"
                      ? "أو اشترك سنوياً"
                      : "Or subscribe yearly"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ───────── How to subscribe ───────── */}
      <section className="ai-section !py-12">
        <div className="ai-card mx-auto max-w-3xl p-6 sm:p-8">
          <h3 className="font-bold text-xl mb-5 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />{" "}
            {m.pricingPage.howHeading}
          </h3>
          <ol className="space-y-4 text-slate-200">
            {m.pricingPage.steps.map((step, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center text-sm font-bold shrink-0">
                  {idx + 1}
                </span>
                <div>
                  <div className="font-medium">{step.title}</div>
                  <div className="text-sm text-slate-400">{step.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────── Contact ───────── */}
      <section className="px-4 pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-slate-400 mb-4">{m.pricingPage.contactText}</p>
          <a
            href={waNum ? `https://wa.me/${waNum}` : "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="ai-btn ai-btn-ghost px-5 py-3 text-sm"
          >
            <MessageCircle className="w-4 h-4" /> {m.pricingPage.contactCta}
            <ArrowLeft className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-brand-500/10 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {cfg.brandName}. {m.footer.copyright}
        <div className="mt-2 flex justify-center gap-4">
          <Link href="/terms" className="hover:text-slate-300">
            {m.footer.terms}
          </Link>
          <Link href="/privacy" className="hover:text-slate-300">
            {m.footer.privacy}
          </Link>
        </div>
      </footer>
    </main>
  );
}
