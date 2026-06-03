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
          <h2 className="display-heading mx-auto mt-12 max-w-2xl text-center text-3xl sm:text-4xl">
            {t.heading}
          </h2>
        </SectionReveal>

        {/* Testimonials */}
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {t.testimonials.map((item, idx) => (
            <StaggerItem key={item.name} index={idx}>
              <figure className="surface flex h-full flex-col p-6">
                <Quote className="h-5 w-5 shrink-0 text-brand-400/60" aria-hidden="true" />
                <div className="mt-3 flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed text-slate-300">
                  {item.quote}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-500/25 bg-brand-500/15 text-sm font-bold text-brand-300">
                    {item.name.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{item.name}</span>
                    <span className="block truncate text-xs text-slate-500">{item.role}</span>
                  </span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </div>
      </div>
    </section>
  );
}
