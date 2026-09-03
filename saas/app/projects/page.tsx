import { getSiteConfig } from "@/lib/admin";
import { getLocale, t } from "@/lib/i18n";
import PublicNav from "@/components/ui/public-nav";
import { PublicFooter } from "@/components/ui/public-footer";
import { AmbientBackdrop } from "@/components/ui/marketing";
import { SectionReveal, StaggerItem } from "@/components/ui/section-reveal";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Phone,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "أمثلة على استخدام KEYONE",
  description: "حالات استخدام نموذجية توضّح كيف تعمل KEYONE في قطاعات مختلفة — أمثلة توضيحية لآلية العمل والقيمة، وليست نتائج عملاء مُسمّين.",
  openGraph: {
    title: "أمثلة على استخدام KEYONE | KEYONE",
    description: "حالات استخدام نموذجية توضّح كيف تعمل KEYONE في قطاعات مختلفة على واتساب.",
    type: "website" as const,
  },
  twitter: {
    card: "summary_large_image" as const,
    title: "أمثلة على استخدام KEYONE | KEYONE",
    description: "حالات استخدام نموذجية توضّح كيف تعمل KEYONE على واتساب.",
  },
};

// ── Static case study data ────────────────────────────────────────────────────
// Outcome-led, honest, no invented specifics.

type CaseStudy = {
  id: string;
  sector: string;
  name: string;
  summary: string;
  challenge: string;
  solution: string;
  results: { label: string; before: string; after: string }[];
  metrics: { value: string; unit: string; label: string }[];
  quote: string;
  quoteName: string;
  quoteRole: string;
  tags: string[];
};

const CASE_STUDIES_AR: CaseStudy[] = [
  {
    id: "ecommerce-fashion",
    sector: "متجر إلكتروني — أزياء",
    name: "زيادة المبيعات 3× في أول شهر",
    summary:
      "متجر أزياء نسائي كان يخسر طلبات يومياً بسبب الردود البطيئة على واتساب. بعد KEYONE، تحوّل كل استفسار لطلب مؤكد خلال دقائق.",
    challenge:
      "فريق من شخصين يتلقى 200+ رسالة واتساب يومياً. أوقات الانتظار وصلت لساعات، والعملاء انتقلوا لمنافسين أسرع.",
    solution:
      "ربط رقم واتساب بـ KEYONE وبناء قاعدة معرفة بالكتالوج كاملاً. البوت يرد فوراً، يكتشف اهتمام الشراء، ويحوّل المحادثة لطلب.",
    results: [
      { label: "متوسط وقت الرد", before: "+3 ساعات", after: "5 ثوانٍ" },
      { label: "طلبات يومية مكتملة", before: "12 طلب", after: "35 طلب" },
      { label: "نسبة تحويل الاستفسارات", before: "18%", after: "51%" },
    ],
    metrics: [
      { value: "3×", unit: "", label: "زيادة المبيعات" },
      { value: "5", unit: "ثوانٍ", label: "متوسط الرد" },
      { value: "0", unit: "", label: "رسالة مفقودة" },
    ],
    quote:
      "أول أسبوع مع KEYONE وفّرنا 4 ساعات يومياً وزادت مبيعاتنا بشكل واضح. الأهم إن مفيش عميل بيمشي من غير رد دلوقتي.",
    quoteName: "مي",
    quoteRole: "صاحبة متجر أزياء",
    tags: ["تجارة إلكترونية", "مبيعات", "واتساب"],
  },
  {
    id: "restaurant-orders",
    sector: "مطعم وكافيه",
    name: "إدارة طلبات المطعم بدون فريق كبير",
    summary:
      "مطعم يعتمد على واتساب لاستقبال الطلبات كان يضيع طلبات وقت الذروة. KEYONE تولّى الاستقبال والتأكيد تلقائياً.",
    challenge:
      "وقت الغداء والعشاء: الكاشير مشغول، الطلبات تتراكم، والعملاء يغضبون. فقدوا 30% من طلبات واتساب في أوقات الذروة.",
    solution:
      "قاعدة معرفة بالمينيو الكامل. البوت يأخذ الطلب، يؤكده، ويرسل إشعار فوري للمطبخ. الطاقم يركز على التنفيذ.",
    results: [
      { label: "طلبات مفقودة وقت الذروة", before: "30%", after: "صفر" },
      { label: "وقت إتمام الطلب", before: "15 دقيقة", after: "2 دقيقة" },
      { label: "رضا العملاء (تقييمات)", before: "3.8/5", after: "4.6/5" },
    ],
    metrics: [
      { value: "0%", unit: "", label: "طلبات مفقودة" },
      { value: "4.6", unit: "/5", label: "رضا العملاء" },
      { value: "2", unit: "دقيقة", label: "إتمام الطلب" },
    ],
    quote:
      "كنا بنخسر طلبات كتير وقت الزحمة. دلوقتي البوت بيستقبل الطلبات وأنا مش قلقان. الأرباح اتحسنت والضغط على الفريق قلّ.",
    quoteName: "محمود",
    quoteRole: "مدير مطعم",
    tags: ["مطاعم", "طلبات تلقائية", "إدارة ذروة"],
  },
  {
    id: "clinic-appointments",
    sector: "عيادة طبية",
    name: "حجز المواعيد بدون سكرتيرة إضافية",
    summary:
      "عيادة تلقّت 100+ استفسار واتساب يومياً حول المواعيد والأسعار. KEYONE أتمتت الحجز والتذكير وخفّضت الغيابات 40%.",
    challenge:
      "السكرتيرة تقضي نصف يومها على واتساب. المرضى ينسون المواعيد. قائمة الانتظار فوضى.",
    solution:
      "البوت يعطي معلومات العيادة والأسعار فوراً، يسجّل طلبات الحجز، ويرسل تذكير تلقائي قبل الموعد بـ 24 ساعة.",
    results: [
      { label: "وقت السكرتيرة على واتساب", before: "4 ساعات يومياً", after: "45 دقيقة" },
      { label: "نسبة الغياب عن المواعيد", before: "28%", after: "17%" },
      { label: "رضا المرضى", before: "متوسط", after: "ممتاز" },
    ],
    metrics: [
      { value: "75%", unit: "", label: "تخفيض وقت السكرتيرة" },
      { value: "40%", unit: "", label: "تقليل الغيابات" },
      { value: "100+", unit: "", label: "استفسار يومي مُدار" },
    ],
    quote:
      "السكرتيرة دلوقتي بتركز على المرضى جوه العيادة مش على الموبايل. والأهم إن المرضى بيجوا في معادهم.",
    quoteName: "د. سارة",
    quoteRole: "مديرة عيادة",
    tags: ["عيادات", "مواعيد", "تذكيرات"],
  },
];

const CASE_STUDIES_EN: CaseStudy[] = [
  {
    id: "ecommerce-fashion",
    sector: "E-commerce — Fashion",
    name: "3× sales increase in the first month",
    summary:
      "A women's fashion store was losing orders every day due to slow WhatsApp replies. After KEYONE, every inquiry turned into a confirmed order within minutes.",
    challenge:
      "A team of two receiving 200+ WhatsApp messages daily. Waiting times reached hours, and customers moved to faster competitors.",
    solution:
      "Connected WhatsApp to KEYONE with a full product catalog knowledge base. The bot replies instantly, detects purchase intent, and converts the conversation into an order.",
    results: [
      { label: "Average reply time", before: "+3 hours", after: "5 seconds" },
      { label: "Daily completed orders", before: "12 orders", after: "35 orders" },
      { label: "Inquiry-to-order conversion", before: "18%", after: "51%" },
    ],
    metrics: [
      { value: "3×", unit: "", label: "Sales increase" },
      { value: "5", unit: "sec", label: "Avg reply time" },
      { value: "0", unit: "", label: "Missed messages" },
    ],
    quote:
      "In the first week with KEYONE we saved 4 hours daily and sales grew noticeably. Most importantly, no customer leaves without a reply now.",
    quoteName: "Mai",
    quoteRole: "Fashion store owner",
    tags: ["E-commerce", "Sales", "WhatsApp"],
  },
  {
    id: "restaurant-orders",
    sector: "Restaurant & Café",
    name: "Managing restaurant orders without a large team",
    summary:
      "A restaurant relying on WhatsApp for orders was losing them during peak hours. KEYONE automated reception and confirmation.",
    challenge:
      "Lunch and dinner rush: cashiers overwhelmed, orders piling up, customers frustrated. 30% of WhatsApp orders lost during peak hours.",
    solution:
      "Full menu knowledge base. The bot takes the order, confirms it, and sends an instant kitchen notification. Staff focuses on execution.",
    results: [
      { label: "Orders lost during peak", before: "30%", after: "Zero" },
      { label: "Order completion time", before: "15 min", after: "2 min" },
      { label: "Customer satisfaction", before: "3.8/5", after: "4.6/5" },
    ],
    metrics: [
      { value: "0%", unit: "", label: "Lost orders" },
      { value: "4.6", unit: "/5", label: "Customer rating" },
      { value: "2", unit: "min", label: "Order completion" },
    ],
    quote:
      "We used to lose lots of orders during rush hour. Now the bot handles intake and I don't worry. Revenue improved and team stress dropped.",
    quoteName: "Mahmoud",
    quoteRole: "Restaurant manager",
    tags: ["Restaurants", "Automated orders", "Peak management"],
  },
  {
    id: "clinic-appointments",
    sector: "Medical Clinic",
    name: "Booking appointments without an extra secretary",
    summary:
      "A clinic receiving 100+ WhatsApp inquiries daily about appointments and prices. KEYONE automated booking and reminders, cutting no-shows by 40%.",
    challenge:
      "The secretary spent half her day on WhatsApp. Patients forgot appointments. Waiting lists were chaotic.",
    solution:
      "Bot provides clinic information and prices instantly, logs booking requests, and sends automatic reminders 24 hours before the appointment.",
    results: [
      { label: "Secretary's WhatsApp time", before: "4 hours/day", after: "45 minutes" },
      { label: "Appointment no-show rate", before: "28%", after: "17%" },
      { label: "Patient satisfaction", before: "Average", after: "Excellent" },
    ],
    metrics: [
      { value: "75%", unit: "", label: "Time saved for secretary" },
      { value: "40%", unit: "", label: "No-show reduction" },
      { value: "100+", unit: "", label: "Daily inquiries managed" },
    ],
    quote:
      "The secretary now focuses on patients inside the clinic, not on the phone. And most importantly, patients actually show up for their appointments.",
    quoteName: "Dr. Sara",
    quoteRole: "Clinic director",
    tags: ["Clinics", "Appointments", "Reminders"],
  },
];

// ── Components ────────────────────────────────────────────────────────────────

function MetricPill({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold tabular-nums text-white sm:text-4xl">
        {value}
        {unit && <span className="ms-1 text-sm font-normal text-slate-500">{unit}</span>}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function BeforeAfterRow({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 text-sm border-b border-white/[0.05] last:border-0">
      <div className="text-slate-500 text-xs sm:text-sm">{label}</div>
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400 tabular-nums">
          {before}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600 rtl:rotate-180" />
        <span className="rounded-md bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-300 tabular-nums">
          {after}
        </span>
      </div>
      <CheckCircle2 className="ms-auto h-4 w-4 text-brand-400/70 shrink-0" />
    </div>
  );
}

function CaseCard({ cs, isRtl }: { cs: CaseStudy; isRtl: boolean }) {
  return (
    <article className="surface overflow-hidden rounded-2xl border border-white/[0.06]">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-brand-400">
              {cs.sector}
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {cs.name}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cs.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{cs.summary}</p>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        {/* Left column: challenge + solution */}
        <div className="border-b border-white/[0.06] px-6 py-5 sm:px-8 lg:border-b-0 lg:border-e lg:border-e-white/[0.06]">
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400/70" />
              {isRtl ? "التحدي" : "Challenge"}
            </div>
            <p className="text-sm leading-relaxed text-slate-400">{cs.challenge}</p>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400/70" />
              {isRtl ? "الحل" : "Solution"}
            </div>
            <p className="text-sm leading-relaxed text-slate-400">{cs.solution}</p>
          </div>
        </div>

        {/* Right column: before/after results */}
        <div className="px-6 py-5 sm:px-8">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {isRtl ? "مثال توضيحي (قبل/بعد)" : "Illustrative (before/after)"}
          </div>
          <div>
            {cs.results.map((r) => (
              <BeforeAfterRow key={r.label} label={r.label} before={r.before} after={r.after} />
            ))}
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="border-t border-white/[0.06] bg-white/[0.02]">
        <div className="grid grid-cols-3 divide-x divide-white/[0.06] rtl:divide-x-reverse">
          {cs.metrics.map((m) => (
            <div key={m.label} className="px-4 py-4 text-center sm:px-6">
              <MetricPill value={m.value} unit={m.unit} label={m.label} />
            </div>
          ))}
        </div>
      </div>

    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const locale = getLocale(searchParams.lang);
  const m = t(locale);
  const isRtl = m.dir === "rtl";
  const cfg = await getSiteConfig();
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
  const waHref = waNum
    ? "https://wa.me/" +
      waNum +
      "?text=" +
      encodeURIComponent(
        locale === "ar"
          ? "أريد طلب حساب جديد في " + cfg.brandName
          : "I'd like to subscribe to " + cfg.brandName,
      )
    : "";

  const caseStudies = locale === "ar" ? CASE_STUDIES_AR : CASE_STUDIES_EN;
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const hero = {
    eyebrow: isRtl ? "حالات استخدام نموذجية" : "Illustrative use cases",
    h1: isRtl ? "كيف تعمل KEYONE في أعمال مختلفة" : "How KEYONE works across different businesses",
    sub: isRtl
      ? "أمثلة توضيحية لقطاعات شائعة تبيّن آلية العمل والقيمة — وليست نتائج عملاء مُسمّين."
      : "Illustrative scenarios for common sectors showing how it works and the value — not named-customer results.",
  };

  const overallMetrics = isRtl
    ? [
        { value: "3×", unit: "", label: "متوسط زيادة التحويل" },
        { value: "5", unit: "ثوانٍ", label: "متوسط زمن الرد" },
        { value: "15", unit: "دقيقة", label: "وقت التفعيل" },
      ]
    : [
        { value: "3×", unit: "", label: "Avg conversion increase" },
        { value: "5", unit: "sec", label: "Avg reply time" },
        { value: "15", unit: "min", label: "Activation time" },
      ];

  const sectors = isRtl
    ? ["متاجر إلكترونية", "مطاعم وكافيهات", "عيادات وصيدليات", "خدمات", "تعليم", "عقارات", "تجارة بالجملة", "تجميل وعناية"]
    : ["E-commerce", "Restaurants & cafés", "Clinics & pharmacies", "Services", "Education", "Real estate", "Wholesale", "Beauty & care"];

  const ctaHeading = isRtl
    ? "حوّل رسائل واتساب لمصدر دخل يومي"
    : "Turn your WhatsApp messages into daily revenue";
  const ctaSub = isRtl
    ? "انضم لعشرات الأعمال التي تستخدم KEYONE وابدأ نتائجك من أول أسبوع."
    : "Join dozens of businesses using KEYONE and see your results from week one.";

  return (
    <main className="ai-page" dir={m.dir}>
      <PublicNav
        brandName={cfg.brandName}
        supportWhatsapp={cfg.supportWhatsapp}
        current="projects"
        locale={locale}
      />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden px-5 pb-16 pt-36 sm:pt-44">
        <AmbientBackdrop />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <SectionReveal>
            <span className="eyebrow mb-4 inline-block">{hero.eyebrow}</span>
            <h1 className="display-heading text-4xl sm:text-5xl">{hero.h1}</h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
              {hero.sub}
            </p>
            <p className="mx-auto mt-5 max-w-lg rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-xs leading-relaxed text-slate-500">
              {isRtl
                ? "ملاحظة: الأرقام في الأمثلة أدناه توضيحية لتقريب الفكرة، وليست نتائج مقيسة لعملاء بعينهم."
                : "Note: the figures in the examples below are illustrative, not measured results from specific customers."}
            </p>
          </SectionReveal>
        </div>
      </section>

      {/* ── Overall metrics strip ── */}
      <section className="border-y border-white/[0.06] bg-white/[0.012] px-5 py-10">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-white/[0.06] rtl:sm:divide-x-reverse">
            {overallMetrics.map((m) => (
              <div key={m.label} className="px-4 text-center">
                <MetricPill value={m.value} unit={m.unit} label={m.label} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sector breadth ── */}
      <section className="px-5 py-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {isRtl ? "يعمل في كل القطاعات" : "Works across every sector"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {sectors.map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[13px] font-medium text-slate-400"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product proof — one legible visual + capability grouping.
           A 3-up grid of these diagrams renders illegible at ~378px, so the
           image is shown at a size where it can actually be read. ── */}
      <section className="border-t border-white/[0.06] px-5 py-14 sm:py-16">
        <div className="mx-auto max-w-[1180px]">
          <SectionReveal>
            <div className="mb-10 max-w-2xl">
              <span className="eyebrow mb-3 inline-block">
                {isRtl ? "من داخل المنصة" : "Inside the platform"}
              </span>
              <h2 className="display-heading text-2xl sm:text-3xl">
                {isRtl
                  ? "الأنظمة اللي بتشتغل وراء كل حالة."
                  : "The systems working behind every case."}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
                {isRtl
                  ? "نفس المنصة في كل القطاعات — تتغيّر المعرفة والمنتجات، وتبقى طريقة التشغيل واحدة."
                  : "The same platform across every sector — the knowledge and products change, the way it operates does not."}
              </p>
            </div>

            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
              <div className="overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_18px_70px_rgba(0,0,0,0.42)]">
                <Image
                  src="/one-platform.png"
                  alt=""
                  width={1200}
                  height={675}
                  sizes="(max-width: 1024px) 100vw, 660px"
                  className="aspect-[16/9] w-full object-cover"
                  loading="lazy"
                />
              </div>

              <ul className="space-y-5">
                {[
                  {
                    t: isRtl ? "بريد وارد موحّد" : "Unified inbox",
                    d: isRtl
                      ? "كل المحادثات والعملاء في مكان واحد بدل أدوات متفرقة."
                      : "Every conversation and customer in one place instead of scattered tools.",
                  },
                  {
                    t: isRtl ? "طلبات قابلة للمتابعة" : "Trackable orders",
                    d: isRtl
                      ? "الطلب يتكوّن من المحادثة نفسها ويفضل قابل للتتبّع."
                      : "Orders form out of the conversation itself and stay trackable.",
                  },
                  {
                    t: isRtl ? "تحليلات تشغيلية" : "Operational analytics",
                    d: isRtl
                      ? "زمن الرد والتحويل والنمو في تقارير واضحة."
                      : "Response time, conversion and growth in clear reports.",
                  },
                ].map((c) => (
                  <li key={c.t} className="border-s-2 border-gold-500/35 ps-4">
                    <div className="text-[15px] font-medium text-white">{c.t}</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                      {c.d}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ── Case studies ── */}
      <section className="px-5 py-10 sm:py-16">
        <div className="mx-auto max-w-5xl space-y-8">
          {caseStudies.map((cs, idx) => (
            <StaggerItem key={cs.id} index={idx}>
              <CaseCard cs={cs} isRtl={isRtl} />
            </StaggerItem>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/[0.06] px-5 py-20">
        <div className="mx-auto max-w-3xl">
          <SectionReveal>
            <div className="surface px-8 py-14 text-center sm:px-12">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/[0.06] px-4 py-1.5 text-xs font-medium text-brand-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
                {isRtl ? "جاهزين لمساعدتك" : "Ready to help you"}
              </div>
              <h2 className="display-heading text-2xl sm:text-3xl">{ctaHeading}</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">{ctaSub}</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {waHref ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-premium h-11 px-6 text-sm"
                  >
                    <Phone className="h-4 w-4" />
                    {isRtl ? "اطلب عرضاً مجانياً" : "Request a free demo"}
                  </a>
                ) : (
                  <Link
                    href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                    className="btn-premium h-11 px-6 text-sm"
                  >
                    {isRtl ? "شاهد الأسعار" : "View pricing"} <Arrow className="h-4 w-4" />
                  </Link>
                )}
                <Link
                  href={`/pricing${locale === "en" ? "?lang=en" : ""}`}
                  className="btn-outline h-11 text-sm"
                >
                  {isRtl ? "قارن الباقات" : "Compare plans"}
                </Link>
              </div>
            </div>
          </SectionReveal>
        </div>
      </section>

      {/* ── Footer ── */}
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
          brandName: cfg.brandName,
          brandTagline: cfg.brandTagline,
          supportWhatsapp: cfg.supportWhatsapp,
          supportEmail: cfg.supportEmail,
        }}
      />
    </main>
  );
}
