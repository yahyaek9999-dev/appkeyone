"use client";

// ── ROI / Outcome section ─────────────────────────────────────────────────
// Outcome-focused, money-first block (Stripe/HubSpot style). A lightweight
// interactive estimator turns "how many messages/day" into a concrete monthly
// upside, plus an hours-saved figure. Pure client math — no network, no glow.
// Bilingual (ar/en) + RTL-aware. Additive: imported by app/page.tsx only.

import { useMemo, useState } from "react";
import { TrendingUp, Clock, Wallet } from "lucide-react";

type Props = {
  locale: "ar" | "en";
  dir: "rtl" | "ltr";
  /** Optional CTA target (e.g. wa.me link). Falls back to /pricing. */
  ctaHref?: string;
  ctaLabel: string;
};

// Conservative, defensible assumptions — kept transparent in the footnote.
const REPLY_MINUTES = 3; // avg minutes saved per handled message
const RECOVERED_RATE = 0.18; // share of inquiries recovered by instant reply + follow-up
const AVG_ORDER_EGP = 450; // representative average order value (EGP)

function fmt(n: number, locale: "ar" | "en") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export default function RoiSection({ locale, dir, ctaHref, ctaLabel }: Props) {
  const isRtl = dir === "rtl";
  const [perDay, setPerDay] = useState(60);

  const { monthlyUpside, hoursSaved, recovered } = useMemo(() => {
    const monthlyMsgs = perDay * 30;
    const recoveredOrders = monthlyMsgs * RECOVERED_RATE;
    return {
      monthlyUpside: recoveredOrders * AVG_ORDER_EGP,
      hoursSaved: (monthlyMsgs * REPLY_MINUTES) / 60,
      recovered: recoveredOrders,
    };
  }, [perDay]);

  const t = isRtl
    ? {
        eyebrow: "العائد على الاستثمار",
        heading: "احسب المبيعات التي تفوتك اليوم",
        sub: "حرّك المؤشر حسب عدد رسائل عملائك يومياً — وشوف الفرق الذي يصنعه الرد الفوري والمتابعة التلقائية.",
        sliderLabel: "رسائل العملاء يومياً",
        upside: "مبيعات إضافية محتملة شهرياً",
        hours: "ساعة عمل تُوفَّر شهرياً",
        recovered: "طلب مُستردّ شهرياً",
        egp: "ج",
        hoursUnit: "ساعة",
        orderUnit: "طلب",
        note: "تقدير توضيحي بافتراضات محافظة: استرداد 18% من الاستفسارات، توفير 3 دقائق لكل رسالة، متوسط طلب 450 ج. النتائج الفعلية تختلف حسب نشاطك.",
      }
    : {
        eyebrow: "Return on investment",
        heading: "See the sales you're missing today",
        sub: "Drag the slider to your daily message volume — and see the difference instant replies and automatic follow-ups make.",
        sliderLabel: "Customer messages per day",
        upside: "Potential extra sales / month",
        hours: "Work hours saved / month",
        recovered: "Orders recovered / month",
        egp: "EGP",
        hoursUnit: "hrs",
        orderUnit: "orders",
        note: "Illustrative estimate with conservative assumptions: 18% of inquiries recovered, 3 minutes saved per message, average order 450 EGP. Actual results vary by business.",
      };

  return (
    <section className="ai-section border-t border-white/[0.06]">
      <div className="ai-container max-w-5xl">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <span className="eyebrow mb-4 inline-block">{t.eyebrow}</span>
          <h2 className="display-heading text-3xl sm:text-4xl">{t.heading}</h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
            {t.sub}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
          {/* Control */}
          <div className="surface flex flex-col justify-center p-6 sm:p-8">
            <label htmlFor="roi-range" className="block text-sm font-medium text-slate-300">
              {t.sliderLabel}
            </label>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-white sm:text-5xl">
                {fmt(perDay, locale)}
              </span>
            </div>
            <input
              id="roi-range"
              type="range"
              min={10}
              max={300}
              step={10}
              value={perDay}
              onChange={(e) => setPerDay(Number(e.target.value))}
              dir={isRtl ? "rtl" : "ltr"}
              className="roi-range mt-6 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-brand-500"
              aria-label={t.sliderLabel}
            />
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>{fmt(10, locale)}</span>
              <span>{fmt(300, locale)}+</span>
            </div>
          </div>

          {/* Outcomes */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:gap-4">
            <div className="surface flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10">
                <Wallet className="h-5 w-5 text-brand-300" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                  {fmt(monthlyUpside, locale)}
                  <span className="ms-1.5 text-sm font-normal text-slate-500">{t.egp}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{t.upside}</div>
              </div>
            </div>

            <div className="surface flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                <Clock className="h-5 w-5 text-sky-300" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                  {fmt(hoursSaved, locale)}
                  <span className="ms-1.5 text-sm font-normal text-slate-500">{t.hoursUnit}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{t.hours}</div>
              </div>
            </div>

            <div className="surface flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                <TrendingUp className="h-5 w-5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold tabular-nums text-white sm:text-3xl">
                  {fmt(recovered, locale)}
                  <span className="ms-1.5 text-sm font-normal text-slate-500">{t.orderUnit}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{t.recovered}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <a
            href={ctaHref || "/pricing"}
            target={ctaHref?.startsWith("http") ? "_blank" : undefined}
            rel={ctaHref?.startsWith("http") ? "noopener noreferrer" : undefined}
            className="btn-premium h-12 w-full sm:w-auto sm:px-8"
          >
            {ctaLabel}
          </a>
          <p className="mx-auto max-w-xl text-center text-xs leading-relaxed text-slate-600">
            {t.note}
          </p>
        </div>
      </div>
    </section>
  );
}
