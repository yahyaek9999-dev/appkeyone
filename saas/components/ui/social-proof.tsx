"use client";

// ── "Built for your business" band ────────────────────────────────────────
// HONEST framing only (no fabricated testimonials or usage claims): the sectors
// KEYONE is designed for + three concrete product capabilities. Replaces the
// earlier fake-testimonial block to comply with the reality rule. Bilingual + RTL.

import { Clock, ShoppingCart, QrCode } from "lucide-react";
import { SectionReveal, StaggerItem } from "@/components/ui/section-reveal";

type Props = {
  locale: "ar" | "en";
  dir: "rtl" | "ltr";
};

export default function SocialProof({ locale, dir }: Props) {
  const isRtl = dir === "rtl";

  const t = isRtl
    ? {
        eyebrow: "مصمّم لأعمالك",
        heading: "يناسب كل قطاعات الأعمال",
        sectors: ["متاجر إلكترونية", "مطاعم وكافيهات", "عيادات", "خدمات", "تعليم", "عقارات"],
        caps: [
          { icon: Clock, title: "ردّ فوري ٢٤/٧", body: "يرد على عملائك خلال ثوانٍ في أي وقت — حتى خارج ساعات العمل." },
          { icon: ShoppingCart, title: "لا طلب يضيع", body: "يكتشف نية الشراء، يسجّل الطلب، ويبلّغك فورًا على واتساب." },
          { icon: QrCode, title: "إعداد في دقائق", body: "اربط رقمك بمسح كود QR وابدأ — بدون أي كود أو تعقيد." },
        ],
      }
    : {
        eyebrow: "Built for your business",
        heading: "Fits every kind of business",
        sectors: ["E-commerce", "Restaurants & cafés", "Clinics", "Services", "Education", "Real estate"],
        caps: [
          { icon: Clock, title: "Instant 24/7 replies", body: "Answers your customers in seconds, any time — even after hours." },
          { icon: ShoppingCart, title: "No order slips through", body: "Detects buying intent, logs the order, and alerts you on WhatsApp instantly." },
          { icon: QrCode, title: "Set up in minutes", body: "Connect your number with a QR scan and go — no code, no complexity." },
        ],
      };

  return (
    <section className="ai-section border-t border-white/[0.06] bg-white/[0.012]">
      <div className="ai-container max-w-5xl">
        <SectionReveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t.eyebrow}</p>
          <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
            {t.sectors.map((s) => (
              <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[13px] font-medium text-slate-400">{s}</span>
            ))}
          </div>
        </SectionReveal>

        <SectionReveal>
          <h2 className="display-heading mx-auto mt-12 max-w-2xl text-center text-3xl sm:text-4xl">{t.heading}</h2>
        </SectionReveal>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {t.caps.map((c, idx) => {
            const Icon = c.icon;
            return (
              <StaggerItem key={c.title} index={idx}>
                <div className="surface flex h-full flex-col p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/25 bg-brand-500/15 text-brand-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-white">{c.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">{c.body}</p>
                </div>
              </StaggerItem>
            );
          })}
        </div>
      </div>
    </section>
  );
}
