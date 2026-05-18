import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSiteConfig } from "@/lib/admin";
import {
  MessageSquare,
  Clock,
  BarChart3,
  Shield,
  Globe,
  Check,
  ArrowLeft,
  Bell,
  Database,
  Users,
  Sparkles,
  Phone,
  Bot,
  ShoppingCart,
  Send,
  Brain,
  Inbox,
  Utensils,
  Shirt,
  Building2,
  Stethoscope,
  GraduationCap,
  Truck,
  Lock,
  Activity,
  Server,
  RotateCcw,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getPlans() {
  try {
    return await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    return [];
  }
}

export default async function LandingPage() {
  const [plans, cfg] = await Promise.all([getPlans(), getSiteConfig()]);
  const brandName = cfg.brandName || "KEYONE";
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");
  const waHref = waNum
    ? "https://wa.me/" +
      waNum +
      "?text=" +
      encodeURIComponent("أريد طلب حساب جديد في " + brandName)
    : "";

  return (
    <main className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* ───────── Nav ───────── */}
      <nav className="fixed top-0 inset-x-0 z-50">
        <div className="hidden md:flex max-w-[1440px] mx-auto h-24 items-center justify-end px-8 lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-3 font-black tracking-tight text-white drop-shadow-[0_0_24px_rgba(34,197,94,0.25)]"
          >
            <span className="text-3xl leading-none">{brandName}</span>
            <Logo
              className="h-14 w-14 rounded-[1.35rem]"
              iconClassName="h-8 w-8"
            />
          </Link>
        </div>

        <div
          dir="ltr"
          className="md:hidden h-[100px] border-b border-white/10 bg-[#020806]/95 px-5 min-[420px]:px-9 flex items-center justify-between backdrop-blur-xl"
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 font-black tracking-tight text-white"
          >
            <span className="text-2xl leading-none min-[420px]:text-[28px]">
              {brandName}
            </span>
            <Logo
              className="h-11 w-11 rounded-2xl min-[420px]:h-12 min-[420px]:w-12"
              iconClassName="h-6 w-6 min-[420px]:h-7 min-[420px]:w-7"
            />
          </Link>

          <div className="flex items-center gap-4 min-[420px]:gap-7">
            {waNum ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                dir="rtl"
                className="rounded-xl border border-brand-500/70 px-4 py-3 text-base font-black text-brand-400 shadow-[0_0_24px_rgba(34,197,94,0.14)] min-[420px]:px-6 min-[420px]:text-lg"
              >
                اطلب حسابك
              </a>
            ) : (
              <Link
                href="/pricing"
                dir="rtl"
                className="rounded-xl border border-brand-500/70 px-4 py-3 text-base font-black text-brand-400 shadow-[0_0_24px_rgba(34,197,94,0.14)] min-[420px]:px-6 min-[420px]:text-lg"
              >
                الباقات
              </Link>
            )}
            <button
              type="button"
              aria-label="فتح القائمة"
              className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 min-[420px]:h-11 min-[420px]:w-11"
            >
              <span className="block h-1 w-9 rounded-full bg-white min-[420px]:w-11" />
              <span className="block h-1 w-9 rounded-full bg-white min-[420px]:w-11" />
              <span className="block h-1 w-9 rounded-full bg-white min-[420px]:w-11" />
            </button>
          </div>
        </div>
      </nav>

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

        <div
          dir="ltr"
          className="relative z-10 mx-auto max-w-[1440px] px-6 sm:px-10 lg:px-16"
        >
          <div className="flex flex-col lg:min-h-[calc(100vh-7rem)] lg:justify-center">
            <div
              dir="rtl"
              className="mx-auto w-full max-w-[720px] text-center lg:mx-0 lg:max-w-[690px] lg:pb-12 lg:text-right"
            >
              <div className="inline-flex items-center justify-center gap-3 rounded-full border border-brand-500/60 bg-[#06100d]/80 px-6 py-3 text-base font-black text-white shadow-[0_0_36px_rgba(34,197,94,0.12)] sm:text-lg">
                <span>منصة الذكاء الاصطناعي للأعمال</span>
                <span className="h-3.5 w-3.5 rounded-full bg-brand-500 shadow-[0_0_18px_rgba(34,197,94,0.9)]" />
              </div>

              <h1 className="mt-8 text-[2.65rem] font-black leading-[1.34] tracking-[-0.045em] text-white drop-shadow-[0_3px_0_rgba(255,255,255,0.08)] sm:text-[3.8rem] lg:text-[4.25rem] xl:text-[4.65rem]">
                <span>منصة ذكاء اصطناعي</span>
                <br />
                <span>تدير عملك وطلباتك</span>
                <br />
                <span className="bg-gradient-to-l from-brand-300 via-brand-400 to-brand-600 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(34,197,94,0.24)]">
                  من واتساب حتى المبيعات
                </span>
              </h1>

              <p className="mx-auto mt-8 max-w-[640px] text-lg font-medium leading-9 text-white/90 sm:text-[1.45rem] sm:leading-[2.5rem] lg:mx-0 lg:text-[1.35rem] lg:leading-10">
                <span className="font-black text-brand-400">{brandName}</span>{" "}
                يحول محادثات واتساب إلى نظام تشغيل ذكي لدعم المبيعات، الطلبات،
                المتابعة، والتحليلات — يعمل لحظياً ويحافظ على سياق كل عميل.
              </p>

              <div className="mt-10 flex flex-col items-center gap-4 lg:flex-row lg:justify-start">
                {waNum ? (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-[78px] w-full max-w-[540px] items-center justify-center gap-4 rounded-xl bg-gradient-to-l from-brand-400 to-brand-600 px-7 text-xl font-black text-white shadow-[0_0_34px_rgba(34,197,94,0.36)] transition hover:scale-[1.01] hover:shadow-[0_0_44px_rgba(34,197,94,0.48)] lg:h-[74px] lg:w-auto lg:min-w-[368px]"
                  >
                    <WhatsAppIcon className="h-9 w-9" />
                    <span>اطلب إشتراكك عبر واتساب</span>
                  </a>
                ) : (
                  <Link
                    href="/pricing"
                    className="inline-flex h-[78px] w-full max-w-[540px] items-center justify-center gap-4 rounded-xl bg-gradient-to-l from-brand-400 to-brand-600 px-7 text-xl font-black text-white shadow-[0_0_34px_rgba(34,197,94,0.36)] transition hover:scale-[1.01] hover:shadow-[0_0_44px_rgba(34,197,94,0.48)] lg:h-[74px] lg:w-auto lg:min-w-[368px]"
                  >
                    شاهد الباقات
                    <ArrowLeft className="h-6 w-6" />
                  </Link>
                )}
                <Link
                  href="/pricing"
                  className="inline-flex h-[74px] w-full max-w-[540px] items-center justify-center rounded-xl border border-white/30 bg-black/20 px-7 text-xl font-black text-white shadow-[inset_0_0_0_1px_rgba(34,197,94,0.15)] transition hover:border-brand-400/80 hover:bg-brand-500/10 lg:w-auto lg:min-w-[238px]"
                >
                  عرض الأسعار
                </Link>
              </div>

              <div className="mx-auto mt-11 grid w-full max-w-[660px] grid-cols-3 text-white/90 lg:mx-0">
                {[
                  { icon: Lock, label: "بنية آمنة للأعمال" },
                  { icon: Shield, label: "تشغيل ومتابعة لحظية" },
                  { icon: Users, label: "جاهز للفرق والشركات" },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={
                        "flex min-h-[88px] flex-col items-center justify-center gap-2 px-2 text-center " +
                        (index > 0 ? "border-r border-brand-500/30" : "")
                      }
                    >
                      <Icon className="h-8 w-8 text-brand-400" />
                      <span className="text-sm font-bold leading-6 sm:text-base">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

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
                dir="rtl"
                className="absolute bottom-8 left-9 right-9 rounded-3xl border border-brand-500/30 bg-[#0b2119]/90 p-5 shadow-2xl shadow-brand-500/25 backdrop-blur-xl"
              >
                <div className="flex items-center justify-start gap-4">
                  <Logo
                    className="h-14 w-14 rounded-2xl"
                    iconClassName="h-8 w-8"
                  />
                  <div className="text-right">
                    <div className="text-2xl font-black text-white">
                      متاح شاتك
                    </div>
                    <div className="mt-1 flex items-center justify-start gap-2 text-base font-semibold text-white/80">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-400 shadow-[0_0_14px_rgba(34,197,94,0.9)]" />
                      <span>متصل الآن</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Stats ───────── */}
      <section className="py-12 px-4 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { num: "5", unit: "ثوانٍ", label: "متوسط زمن الرد" },
            { num: "24/7", unit: "", label: "تشغيل متواصل" },
            { num: "99.9%", unit: "", label: "ضمان الجاهزية" },
            { num: "100K+", unit: "", label: "رسالة شهرياً للباقات" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-3xl sm:text-4xl font-bold">
                {s.num}
                {s.unit && (
                  <span className="text-base font-normal text-slate-400 mr-1">
                    {s.unit}
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── Platform capabilities ───────── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs px-3 py-1 rounded-full mb-4">
              <Bot className="w-3 h-3" /> قدرات المنصة
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              أكثر من بوت واتساب — منصة تدير التشغيل اليومي
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              KEYONE يجمع المحادثات، الطلبات، المبيعات، والمتابعة داخل نظام ذكي
              واحد.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              {
                icon: Bot,
                title: "دعم عملاء AI",
                desc: "يرد بدقة وبنبرة نشاطك",
              },
              {
                icon: Sparkles,
                title: "مساعد مبيعات",
                desc: "يقترح ويقرب قرار الشراء",
              },
              {
                icon: MessageSquare,
                title: "أتمتة واتساب",
                desc: "تشغيل الرسائل والسيناريوهات",
              },
              {
                icon: Users,
                title: "CRM العملاء",
                desc: "تجميع بيانات وسياق كل عميل",
              },
              {
                icon: ShoppingCart,
                title: "إدارة الطلبات",
                desc: "اكتشاف الطلبات وتحويلها للفريق",
              },
              {
                icon: Clock,
                title: "متابعات ذكية",
                desc: "تذكير العملاء في الوقت المناسب",
              },
              {
                icon: Send,
                title: "Broadcasts",
                desc: "حملات واتساب منظمة وآمنة",
              },
              {
                icon: BarChart3,
                title: "تحليلات",
                desc: "رؤية أوضح للرسائل والطلبات",
              },
              {
                icon: Brain,
                title: "ذاكرة AI",
                desc: "يحافظ على سياق المحادثات",
              },
              {
                icon: Inbox,
                title: "Team Inbox",
                desc: "صندوق موحد لتدخل الفريق",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-brand-500/30 hover:bg-white/[0.07] transition"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-medium leading-snug">
                    {item.title}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section
        id="features"
        className="py-24 px-4 bg-white/[0.02] border-y border-white/5"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs px-3 py-1 rounded-full mb-4">
              <Sparkles className="w-3 h-3" /> المميزات
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              كل اللي محتاجه في مكان واحد
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              مصممة لتغطية كل احتياجات الشركات والمتاجر الإلكترونية
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={MessageSquare}
              color="brand"
              title="ردود طبيعية بالعربي"
              desc="مساعد ذكي يتحدث بأسلوب عربي طبيعي، ويفهم سياق المحادثة، ولا يخترع معلومات."
            />
            <FeatureCard
              icon={Bell}
              color="amber"
              title="تنبيهات الطلبات الفورية"
              desc="بمجرد ظهور كلمة 'طلب' أو 'تحويل' أو 'دفع' في محادثة، يصلك إشعار واتساب فوري."
            />
            <FeatureCard
              icon={Database}
              color="emerald"
              title="قاعدة معرفة لنشاطك"
              desc="ارفع أسعارك، خدماتك، وسياساتك. البوت يرد بالمعلومات الصحيحة دائماً."
            />
            <FeatureCard
              icon={BarChart3}
              color="purple"
              title="تقارير وتحليلات"
              desc="شاهد عدد العملاء، الرسائل، المعدلات الزمنية، والطلبات في لوحة احترافية."
            />
            <FeatureCard
              icon={Globe}
              color="cyan"
              title="ربط متعدد القنوات"
              desc="ربط رقم أو أكثر من واتساب. تكامل مع n8n، Make، Zapier، وأنظمة CRM."
            />
            <FeatureCard
              icon={Shield}
              color="rose"
              title="حماية وخصوصية"
              desc="تشفير TLS، بيانات محمية، نسخ احتياطي يومي، التزام كامل بسياسات الخصوصية."
            />
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section
        id="how"
        className="py-24 px-4 bg-white/[0.02] border-y border-white/5"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              3 خطوات بسيطة للبدء
            </h2>
            <p className="text-slate-400">
              من التسجيل حتى أول رد على عميلك خلال أقل من ربع ساعة
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                num: "01",
                title: "تواصل معنا",
                desc: "اطلب باقتك عبر واتساب. الإدارة تنشئ حسابك وتُرسل بيانات الدخول بعد تأكيد الدفع.",
              },
              {
                num: "02",
                title: "اربط واتساب وأضف بياناتك",
                desc: "امسح كود QR لربط رقمك. ارفع أسعارك وخدماتك وسياسات نشاطك في قاعدة المعرفة.",
              },
              {
                num: "03",
                title: "دع البوت يبيع لك",
                desc: "العملاء يكلمون رقمك، البوت يرد فوراً، وأنت تستلم تنبيهات الطلبات الجاهزة.",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="relative bg-slate-900/60 border border-white/10 rounded-2xl p-6"
              >
                <div className="text-5xl font-bold text-brand-400/20 mb-3">
                  {step.num}
                </div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Pricing preview ───────── */}
      <section id="pricing" className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              باقات تناسب حجم أعمالك
            </h2>
            <p className="text-slate-400">
              اشترك مباشرة عبر واتساب. الترقية أو الإلغاء في أي وقت.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan: any) => {
              const features: string[] = JSON.parse(
                plan.features || "[]",
              ).slice(0, 4);
              const popular = plan.popular;
              return (
                <div
                  key={plan.slug}
                  className={`relative rounded-2xl p-6 border transition ${
                    popular
                      ? "bg-gradient-to-br from-brand-500/15 to-transparent border-brand-500/40"
                      : "bg-white/5 border-white/10"
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
                  <p className="text-xs text-slate-400 mt-1 min-h-[2rem]">
                    {plan.description}
                  </p>
                  <div className="my-4">
                    <span className="text-3xl font-bold">${plan.priceUsd}</span>
                    <span className="text-slate-400 text-sm">/شهر</span>
                  </div>
                  <ul className="space-y-2 mb-5 text-sm text-slate-200">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />{" "}
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 px-6 py-3 rounded-xl font-medium"
            >
              مقارنة كاملة بين الباقات <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Industries ───────── */}
      <section className="py-20 px-4 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              مناسب لأنواع أعمال مختلفة
            </h2>
            <p className="text-slate-400 text-sm">
              نفس المنصة، إعدادات ومعرفة مخصصة لكل نشاط.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            {[
              { icon: Utensils, label: "مطاعم" },
              { icon: Shirt, label: "علامات ملابس" },
              { icon: Building2, label: "عقارات" },
              { icon: Stethoscope, label: "عيادات" },
              { icon: ShoppingCart, label: "متاجر إلكترونية" },
              { icon: GraduationCap, label: "كورسات" },
              { icon: Truck, label: "شركات شحن" },
            ].map((u) => {
              const Icon = u.icon;
              return (
                <div
                  key={u.label}
                  className="bg-slate-900/60 border border-white/10 rounded-xl p-4 text-center hover:border-brand-500/40 transition"
                >
                  <div className="w-10 h-10 mx-auto rounded-xl bg-white/5 border border-white/10 text-brand-300 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-sm">{u.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── Trust & reliability ───────── */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full mb-4">
              <Shield className="w-3 h-3" /> الثقة والاستقرار
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              مبني ليعمل بثبات مع عملياتك اليومية
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              حماية ذكية ومراقبة مستمرة تساعد فريقك يثق في المنصة وقت الذروة.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                icon: Shield,
                title: "حماية ذكية",
                desc: "تقليل المخاطر والاستخدام غير الطبيعي",
              },
              {
                icon: Lock,
                title: "بنية آمنة",
                desc: "حفظ بيانات العملاء داخل تشغيل موثوق",
              },
              {
                icon: RotateCcw,
                title: "نسخ احتياطية",
                desc: "جاهزية أفضل لاستمرارية العمل",
              },
              {
                icon: Activity,
                title: "مراقبة لحظية",
                desc: "متابعة حالة التشغيل وقت الذروة",
              },
              {
                icon: Server,
                title: "تشغيل مستقر",
                desc: "اعتمادية أعلى للفرق والشركات",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5"
                >
                  <Icon className="w-5 h-5 text-emerald-400 mb-3" />
                  <h3 className="font-bold text-sm mb-2">{item.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            أسئلة شائعة
          </h2>
          <div className="space-y-3">
            {FAQ.map((q) => (
              <details
                key={q.q}
                className="group bg-white/5 border border-white/10 rounded-xl overflow-hidden"
              >
                <summary className="cursor-pointer px-5 py-4 flex items-center justify-between list-none">
                  <span className="font-medium">{q.q}</span>
                  <span className="text-brand-400 group-open:rotate-45 transition">
                    +
                  </span>
                </summary>
                <div className="px-5 pb-4 text-sm text-slate-300 leading-relaxed">
                  {q.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto rounded-3xl bg-gradient-to-br from-brand-500/20 via-brand-500/10 to-transparent border border-brand-500/30 p-10 sm:p-14 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            ابدأ تستقبل طلبات أكثر اليوم
          </h2>
          <p className="text-slate-300 mb-7 max-w-xl mx-auto">
            انضم لمئات الشركات اللي بتعتمد على {cfg.brandName} في الرد على
            عملاءها
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {waNum ? (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent("أريد طلب اشتراك في " + cfg.brandName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-500 hover:bg-brand-600 px-6 py-3 rounded-xl font-medium inline-flex items-center gap-2"
              >
                <Phone className="w-4 h-4" /> اطلب اشتراكك الآن
              </a>
            ) : (
              <Link
                href="/pricing"
                className="bg-brand-500 hover:bg-brand-600 px-6 py-3 rounded-xl font-medium inline-flex items-center gap-2"
              >
                شاهد الباقات <ArrowLeft className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="/pricing"
              className="bg-white/10 hover:bg-white/15 border border-white/15 px-6 py-3 rounded-xl text-sm inline-flex items-center gap-2"
            >
              عرض الأسعار
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-white/5 py-10 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-4 gap-6 text-sm">
          <div>
            <div className="flex items-center gap-2 font-bold mb-3">
              <Logo />
              <span>{cfg.brandName}</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              {cfg.brandTagline}
            </p>
          </div>
          <div>
            <div className="font-medium mb-3 text-slate-300">المنتج</div>
            <ul className="space-y-2 text-slate-400">
              <li>
                <a href="#features" className="hover:text-white">
                  المميزات
                </a>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-white">
                  الأسعار
                </Link>
              </li>
              <li>
                <a href="#faq" className="hover:text-white">
                  الأسئلة
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-3 text-slate-300">الشركة</div>
            <ul className="space-y-2 text-slate-400">
              <li>
                <Link href="/terms" className="hover:text-white">
                  الشروط
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-white">
                  الخصوصية
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
            <div className="font-medium mb-3 text-slate-300">تواصل</div>
            <ul className="space-y-2 text-slate-400">
              {waNum && (
                <li>
                  <a
                    href={`https://wa.me/${waNum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white inline-flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" /> واتساب الدعم
                  </a>
                </li>
              )}
              <li>
                <Link href="/login" className="hover:text-white">
                  تسجيل دخول
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/5 text-xs text-slate-500 text-center">
          © {new Date().getFullYear()} {cfg.brandName}. جميع الحقوق محفوظة.
        </div>
      </footer>
    </main>
  );
}

/* ─────────── Helper components ─────────── */

function WhatsAppIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M9.2 8.7c.2-.4.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.4.5c.5.9 1.2 1.6 2.1 2.1l.5-.4c.2-.2.5-.2.7-.1l1.7.7c.3.1.4.3.4.6v.5c0 .3-.1.5-.4.7-.4.3-.9.4-1.5.3-3.1-.5-5.6-3-6.1-6.1-.1-.5 0-1 .2-1.4Z" />
    </svg>
  );
}

function Logo({
  className = "h-9 w-9 rounded-xl",
  iconClassName = "h-5 w-5",
}: {
  className?: string;
  iconClassName?: string;
} = {}) {
  return (
    <span
      className={`${className} bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`${iconClassName} text-white`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  color,
}: {
  icon: any;
  title: string;
  desc: string;
  color: "brand" | "amber" | "emerald" | "purple" | "cyan" | "rose";
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
    <div className="group bg-white/5 hover:bg-white/[0.07] border border-white/10 rounded-2xl p-6 transition">
      <div
        className={`w-11 h-11 rounded-xl bg-gradient-to-br ${colorMap[color]} border flex items-center justify-center mb-4`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{desc}</p>
    </div>
  );
}

const FAQ = [
  {
    q: "هل يحتاج البوت لتدريب أو خبرة برمجية؟",
    a: "لا، الإعداد كله من خلال واجهة بسيطة بالعربي. ترفع أسعارك ومعلومات نشاطك في صفحة قاعدة المعرفة والبوت يبدأ يرد فوراً.",
  },
  {
    q: "هل البوت يستبدل الموظفين تماماً؟",
    a: "البوت يتولى الردود الروتينية والاستفسارات الأساسية ويتنبه للطلبات والحالات اللي تحتاج تدخّل بشري. أنت تشوف كل المحادثات وتقدر تتدخل في أي وقت.",
  },
  {
    q: "كم رقم واتساب يقدر يربط البوت؟",
    a: "حسب الباقة: من رقم واحد في باقة البداية حتى أرقام غير محدودة في باقة المؤسسات.",
  },
  {
    q: "كيف تتم عملية الدفع؟",
    a: "الدفع يتم عبر واتساب بفودافون كاش، إنستاباي، تحويل بنكي، أو فيزا. التفعيل خلال دقائق من تأكيد التحويل.",
  },
  {
    q: "هل يمكنني إلغاء الاشتراك في أي وقت؟",
    a: "نعم، بدون التزام طويل. الاشتراك الشهري يمكن إلغاؤه أو الترقية في أي وقت.",
  },
  {
    q: "ماذا لو وصلت لحد رسائل الباقة؟",
    a: "ستصلك تنبيهات قبل الوصول للحد. يمكنك ترقية الباقة أو الانتظار لبداية الشهر التالي لإعادة العداد.",
  },
];
