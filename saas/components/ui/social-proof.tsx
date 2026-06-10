"use client";

// ── Social proof section ──────────────────────────────────────────────────
// Stripe/Shopify-style credibility band: a "used across" sector strip, a tight
// metric row, and three concise, outcome-led testimonials with attribution.
// Honest framing — sectors, not fabricated brand logos. Bilingual + RTL-aware.
// Additive: imported by app/page.tsx only. Uses shared reveal primitives.

import { Star, Quote } from "lucide-react";
import { SectionReveal, StaggerItem } from "@/components/ui/section-reveal";

type Props = {
  locale: "ar" | "en";
  dir: "rtl" | "ltr";
};

export default function SocialProof({ locale, dir }: Props) {
  const isRtl = dir === "rtl";

  const t = isRtl
    ? {
        eyebrow: "موثوق به",
        heading: "تستخدمه أعمال من كل القطاعات",
        sectors: ["متاجر إلكترونية", "مطاعم وكافيهات", "عيادات", "خدمات", "تعليم", "عقارات"],
        testimonials: [
          {
            quote:
              "البوت بيرد على العملاء في ثوانٍ حتى وإحنا قافلين. أول شهر استرجعنا طلبات كنا بنخسرها بسهولة.",
            name: "أحمد",
            role: "صاحب متجر إلكتروني",
          },
          {
            quote:
              "وفّرت على فريقي ساعات يومياً. التنبيهات بتوصلنا على واتساب فوراً ومفيش طلب بيضيع.",
            name: "سارة",
            role: "مديرة عيادة",
          },
          {
            quote:
              "أبسط حاجة جرّبناها. ربطنا الرقم في دقائق وبدأنا نشوف الطلبات في اللوحة من أول يوم.",
            name: "خالد",
            role: "مطعم وكافيه",
          },
        ],
      }
    : {
        eyebrow: "Trusted by",
        heading: "Used by businesses across every sector",
        sectors: ["E-commerce", "Restaurants & cafés", "Clinics", "Services", "Education", "Real estate"],
        testimonials: [
          {
            quote:
              "The bot replies to customers in seconds, even after hours. We recovered orders in the first month that we used to lose.",
            name: "Ahmed",
            role: "E-commerce store owner",
          },
          {
            quote:
              "It saved my team hours every day. Alerts hit our WhatsApp instantly and no order slips through.",
            name: "Sara",
            role: "Clinic manager",
          },
          {
            quote:
              "The simplest tool we've tried. We connected our number in minutes and saw orders in the dashboard day one.",
            name: "Khaled",
            role: "Restaurant & café",
          },
        ],
      };

  return (
    <section className="ai-section border-t border-white/[0.06] bg-white/[0.012]">
      <div className="ai-container max-w-5xl">
        <SectionReveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {t.eyebrow}
          </p>
          {/* Sector strip — monochrome pills, calm and credible */}
          <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
            {t.sectors.map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[13px] font-medium text-slate-400"
              >
                {s}
              </span>
            ))}
          </div>
        </SectionReveal>

        <SectionReveal>
          <h2 className="section-heading mx-auto mt-12 max-w-2xl text-center">
            {t.heading}
          </h2>
        </SectionReveal>

        {/* Testimonials — one featured quote leads, two support beneath */}
        <div className="mt-12 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Featured */}
          <StaggerItem index={0}>
            <figure className="card-elevated rail-gold flex h-full flex-col justify-between p-7 sm:p-9">
              <div>
                <Quote className="h-7 w-7 shrink-0 text-gold-400/70" aria-hidden="true" />
                <blockquote className="mt-5 text-xl font-medium leading-relaxed tracking-[-0.01em] text-white sm:text-2xl">
                  {t.testimonials[0].quote}
                </blockquote>
              </div>
              <figcaption className="mt-8 flex items-center gap-3.5 border-t border-white/[0.07] pt-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-gradient-to-b from-brand-500/25 to-brand-700/20 text-base font-bold text-gold-200">
                  {t.testimonials[0].name.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{t.testimonials[0].name}</span>
                  <span className="block truncate text-xs text-slate-500">{t.testimonials[0].role}</span>
                </span>
                <span className="ms-auto flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-gold-400 text-gold-400" />
                  ))}
                </span>
              </figcaption>
            </figure>
          </StaggerItem>

          {/* Supporting pair */}
          <div className="grid grid-rows-2 gap-4">
            {t.testimonials.slice(1).map((item, idx) => (
              <StaggerItem key={item.name} index={idx + 1}>
                <figure className="surface surface-hover flex h-full flex-col p-6">
                  <div className="flex gap-0.5" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-gold-400 text-gold-400" />
                    ))}
                  </div>
                  <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-300">
                    {item.quote}
                  </blockquote>
                  <figcaption className="mt-4 flex items-center gap-2.5 border-t border-white/[0.06] pt-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/15 text-xs font-bold text-brand-300">
                      {item.name.charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-white">{item.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{item.role}</span>
                    </span>
                  </figcaption>
                </figure>
              </StaggerItem>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
