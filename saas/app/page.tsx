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
  const waNum = (cfg.supportWhatsapp || "").replace(/[^\d]/g, "");

  return (
    <main className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* ───────── Nav ───────── */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-slate-950/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Logo />
            <span>{cfg.brandName}</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm text-slate-300">
            <a href="#features" className="hover:text-white">
              المميزات
            </a>
            <a href="#how" className="hover:text-white">
              طريقة العمل
            </a>
            <Link href="/pricing" className="hover:text-white">
              الأسعار
            </Link>
            <a href="#faq" className="hover:text-white">
              الأسئلة
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm text-slate-300 hover:text-white px-3 py-1.5"
            >
              تسجيل دخول
            </Link>
            {waNum ? (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent("أريد طلب اشتراك في " + cfg.brandName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium bg-brand-500 hover:bg-brand-600 transition px-4 py-2 rounded-lg shadow-lg shadow-brand-500/20 inline-flex items-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" /> اطلب حسابك
              </a>
            ) : (
              <Link
                href="/pricing"
                className="text-sm font-medium bg-brand-500 hover:bg-brand-600 transition px-4 py-2 rounded-lg shadow-lg shadow-brand-500/20"
              >
                الباقات
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ───────── Hero ───────── */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)",
          }}
        />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-500/20 blur-[120px] rounded-full -z-10" />

        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs text-slate-300 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            منصة AI Business Operations متاحة الآن
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight mb-6">
            منصة ذكاء اصطناعي تدير عملاءك وطلباتك
            <br />
            <span className="bg-gradient-to-l from-brand-300 via-brand-400 to-emerald-400 bg-clip-text text-transparent">
              من واتساب حتى المبيعات
            </span>
          </h1>

          <p className="text-slate-300 text-lg max-w-2xl mx-auto mb-8">
            KEYONE يحوّل محادثات واتساب إلى نظام تشغيل ذكي للدعم، المبيعات،
            الطلبات، المتابعة، والتحليلات — يعمل لحظياً ويحافظ على سياق كل عميل.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            {waNum ? (
              <a
                href={`https://wa.me/${waNum}?text=${encodeURIComponent("أريد طلب حساب جديد في " + cfg.brandName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 transition px-6 py-3 rounded-xl font-medium shadow-xl shadow-brand-500/30"
              >
                <Phone className="w-4 h-4" /> اطلب اشتراكك عبر واتساب
              </a>
            ) : (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 transition px-6 py-3 rounded-xl font-medium shadow-xl shadow-brand-500/30"
              >
                شاهد الباقات <ArrowLeft className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 transition px-6 py-3 rounded-xl text-sm"
            >
              عرض الأسعار
            </Link>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              بنية آمنة للأعمال
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-400" />
              تشغيل ومتابعة لحظية
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              جاهز للفرق والشركات
            </div>
          </div>
        </div>

        {/* Mock chat preview */}
        <div className="max-w-3xl mx-auto mt-16 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10 pointer-events-none" />
          <ChatPreview />
        </div>
      </section>

      {/* ───────── Live AI operations ───────── */}
      <section className="px-4 pb-8 -mt-8 relative z-20">
        <div className="max-w-6xl mx-auto bg-slate-900/80 border border-white/10 rounded-2xl px-4 py-4 backdrop-blur-sm shadow-xl shadow-brand-500/5">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs text-slate-300">
            {[
              { label: "AI يرد الآن", dot: "bg-emerald-400" },
              { label: "طلبات يتم اكتشافها", dot: "bg-brand-400" },
              { label: "Broadcasts نشطة", dot: "bg-amber-400" },
              { label: "عملاء متصلون", dot: "bg-cyan-400" },
              { label: "WhatsApp Online", dot: "bg-emerald-400" },
            ].map((item) => (
              <div
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5"
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${item.dot} opacity-60`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${item.dot}`}
                  />
                </span>
                {item.label}
              </div>
            ))}
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
              { icon: Bot, title: "AI Customer Support" },
              { icon: Sparkles, title: "AI Sales Assistant" },
              { icon: MessageSquare, title: "WhatsApp Automation" },
              { icon: Users, title: "CRM" },
              { icon: ShoppingCart, title: "Order Management" },
              { icon: Clock, title: "Follow-ups" },
              { icon: Send, title: "Broadcasts" },
              { icon: BarChart3, title: "Analytics" },
              { icon: Brain, title: "AI Memory" },
              { icon: Inbox, title: "Team Inbox" },
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
              { icon: Shirt, label: "ملابس" },
              { icon: Building2, label: "عقارات" },
              { icon: Stethoscope, label: "عيادات" },
              { icon: ShoppingCart, label: "Ecommerce" },
              { icon: GraduationCap, label: "كورسات" },
              { icon: Truck, label: "شحن" },
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
                title: "Smart Protection",
                desc: "حماية من الاستخدام غير الطبيعي",
              },
              {
                icon: Lock,
                title: "Secure Infrastructure",
                desc: "بنية آمنة لحفظ بيانات العملاء",
              },
              {
                icon: RotateCcw,
                title: "Backups",
                desc: "نسخ احتياطية للحفاظ على استمرارية العمل",
              },
              {
                icon: Activity,
                title: "Realtime Monitoring",
                desc: "متابعة حالة التشغيل لحظة بلحظة",
              },
              {
                icon: Server,
                title: "Stable Operations",
                desc: "تشغيل مستقر للفرق والشركات",
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

function Logo() {
  return (
    <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 text-white"
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

function ChatPreview() {
  return (
    <div className="relative bg-slate-900/80 border border-white/10 rounded-3xl shadow-2xl shadow-brand-500/10 overflow-hidden backdrop-blur-sm">
      {/* Chat header */}
      <div className="bg-emerald-600/90 px-5 py-3 flex items-center gap-3 border-b border-emerald-500/20">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="font-medium text-sm">متجر شركتك</div>
          <div className="text-xs text-emerald-100/90 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-200" /> متصل
            الآن
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="px-4 py-5 space-y-3 bg-[#0a141d]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(34,197,94,0.06), transparent 50%)",
        }}
      >
        <Bubble side="left" name="عميل">
          السلام عليكم، عاوز أعرف أسعار الخدمة عندكم؟
        </Bubble>
        <Bubble side="right">
          وعليكم السلام 👋 الباقة الأساسية تبدأ من $29 شهرياً وتشمل 2000 رسالة.
          عاوز أعرض عليك التفاصيل الكاملة؟
        </Bubble>
        <Bubble side="left" name="عميل">
          آه ممكن، عاوز للمتجر بتاعي ١٠ آلاف رسالة شهرياً
        </Bubble>
        <Bubble side="right">
          الباقة الاحترافية مناسبة لك: $79/شهر، 10,000 رسالة، تشمل ربط رقمين
          واتساب وتحليلات متقدمة. أحوّلك لفريق المبيعات لتفعيل الاشتراك؟
        </Bubble>
        <Bubble side="left" name="عميل">
          تمام، يلا
        </Bubble>
        <Bubble side="right">
          ممتاز ✅ أرسل اسمك واسم متجرك وهنبعتلك تفاصيل الدفع خلال دقائق.
        </Bubble>
        <div className="text-center text-xs text-emerald-400/80 mt-2">
          ⚡ رد خلال 5 ثوانٍ
        </div>
      </div>
    </div>
  );
}

function Bubble({
  children,
  side,
  name,
}: {
  children: React.ReactNode;
  side: "left" | "right";
  name?: string;
}) {
  const isRight = side === "right";
  return (
    <div className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow ${
          isRight
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-slate-800 text-slate-100 rounded-bl-sm"
        }`}
      >
        {name && !isRight && (
          <div className="text-[10px] text-emerald-300 mb-0.5">{name}</div>
        )}
        {children}
      </div>
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
