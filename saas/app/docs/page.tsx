/**
 * /docs — PUBLIC customer documentation hub (Arabic, RTL). No auth, no internal
 * architecture. Step-by-step guides + common mistakes + troubleshooting for the
 * whole customer journey. Single page with an anchored index (no new routes).
 */
import Link from "next/link";

export const dynamic = "force-dynamic";

type Guide = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  mistakes?: string[];
  fixes?: string[];
};

const GUIDES: Guide[] = [
  {
    id: "quickstart",
    title: "🚀 البداية السريعة",
    intro: "من التسجيل إلى أول رد آلي في أقل من ١٥ دقيقة. اتبع قائمة «خطوات التفعيل» في لوحة التحكم — كل خطوة فيها زر مباشر.",
    steps: [
      "سجّل حسابك ثم ادخل إلى لوحة التحكم.",
      "اربط رقم واتساب عبر مسح كود QR (دقيقة واحدة).",
      "اضبط البوت: اسم المتجر، أسلوب الرد، ومعلومات المنتجات.",
      "جرّب أول رد من صفحة «المساعد الذكي» أو انتظر رسالة عميل.",
      "فعّل باقتك من «الاشتراك والدفع» لرفع الحدود.",
    ],
    mistakes: ["تخطّي ربط واتساب — بدونه لا تصل الرسائل.", "ترك معلومات المتجر فارغة فتأتي الردود عامة."],
    fixes: ["لو لم يبدأ البوت بالرد، تأكد أن حالة واتساب «متصل» من صفحة «صحة جلسة واتساب»."],
  },
  {
    id: "whatsapp",
    title: "📱 ربط واتساب",
    intro: "طريقتان: مسح كود QR (الأسرع، لكل الباقات) أو كود من ٨ أرقام (لو الكاميرا غير متاحة). أو Meta Cloud الرسمي للباقات الأعلى.",
    steps: [
      "افتح «العمليات ← ربط واتساب».",
      "اضغط «الربط بـ QR Code» وامسح الكود من تطبيق واتساب على هاتفك (الإعدادات ← الأجهزة المرتبطة).",
      "انتظر تغيّر الحالة إلى «متصل». راقبها لاحقًا من «صحة جلسة واتساب».",
    ],
    mistakes: ["استخدام رقم مرتبط بجهاز كثير.", "إغلاق الصفحة قبل اكتمال المسح."],
    fixes: ["انقطع الاتصال؟ من «صحة جلسة واتساب» اضغط «إعادة الربط» أو «إعادة تشغيل الجلسة».", "للوضع الرسمي استخدم «صحة اتصال Meta ← اختبار الاتصال»."],
  },
  {
    id: "payment",
    title: "💳 الاشتراك والدفع",
    intro: "ادفع يدويًا (فودافون كاش / إنستاباي / Binance / USDT / تحويل بنكي…) وارفع صورة الإيصال — يعتمدها فريق المالية فيُفعّل اشتراكك ويُشحن رصيدك تلقائيًا.",
    steps: [
      "افتح «الإعدادات ← الاشتراك والدفع».",
      "اختر الباقة وطريقة الدفع — سيظهر الحساب الذي تحوّل إليه (الاسم، الرقم، زر نسخ).",
      "حوّل المبلغ، ثم اسحب صورة الإيصال إلى المربّع أو اضغط لاختيارها.",
      "اضغط «إرسال طلب الدفع» وتابع الحالة في الجدول الزمني.",
    ],
    mistakes: ["التحويل لحساب غير الظاهر في الصفحة.", "رفع صورة غير واضحة للإيصال."],
    fixes: ["رُفض الطلب؟ سترى السبب، ويمكنك «رفع إيصال جديد وإعادة المحاولة» فورًا.", "المدة المتوقعة للمراجعة: خلال ٢٤ ساعة. تحتاج مساعدة؟ مركز المساعدة."],
  },
  {
    id: "wallet",
    title: "👛 المحفظة والرصيد",
    intro: "رصيد مسبق الدفع يُخصم حسب الاستخدام (محادثات Meta). الاعتماد يشحن المحفظة تلقائيًا.",
    steps: [
      "افتح «الإعدادات ← المحفظة والرصيد» لرؤية الرصيد والحركات.",
      "اشحن عبر «الاشتراك والدفع».",
      "راقب الاستهلاك المتوقع قبل نفاد الرصيد.",
    ],
    mistakes: ["ترك الرصيد ينفد فيتوقف الإرسال."],
    fixes: ["توقّف الإرسال فجأة؟ تحقق من الرصيد أولًا — قد يكون صفرًا."],
  },
  {
    id: "crm",
    title: "👥 إدارة العملاء (CRM)",
    intro: "كل من يراسلك يُحفظ تلقائيًا كعميل مع سجل المحادثة. صنّف، تابع، وحوّل المحتملين.",
    steps: [
      "افتح «العملاء» لرؤية القائمة وسجل كل عميل.",
      "استخدم «العملاء المحتملون» لمتابعة من أبدى نية شراء.",
      "تابع الطلبات من «المبيعات ← الطلبات».",
    ],
    mistakes: ["تجاهل المحتملين دون متابعة."],
    fixes: ["لا يظهر عميل؟ تأكد أن واتساب متصل وأن الرسالة وصلت فعلًا."],
  },
  {
    id: "brain",
    title: "🧠 العقل والردود الذكية",
    intro: "علّم المساعد عن متجرك ليرد بدقة. أضف معرفة، اضبط الأسلوب، وراقب الأداء.",
    steps: [
      "افتح «المساعد الذكي» لضبط الاسم والأسلوب.",
      "أضف معلومات من «المعرفة» (منتجات، أسئلة شائعة، سياسات).",
      "اختبر في «المساعد الذكي»، وراقب المزوّد من «عمليات الذكاء».",
    ],
    mistakes: ["معرفة ناقصة فتأتي ردود عامة."],
    fixes: ["ردود ضعيفة أو متوقفة؟ من «عمليات الذكاء» اضغط «اختبار المزوّد» وتحقق من المفتاح."],
  },
  {
    id: "broadcast",
    title: "📣 الحملات (Broadcast)",
    intro: "أرسل رسائل جماعية لعملائك مع جدولة ذكية واحترام حدود الإرسال.",
    steps: [
      "افتح «الإرسال الجماعي» أو «حملات الرصيد (QR)».",
      "اختر الجمهور، اكتب الرسالة، وراجع المعاينة.",
      "أرسل الآن أو جدول الوقت المناسب وتابع نسب التفاعل.",
    ],
    mistakes: ["إرسال لجمهور كبير دفعة واحدة دون مراعاة الحدود."],
    fixes: ["ظهرت تحذيرات حدود؟ راجع «صحة جلسة واتساب» وخفّف وتيرة الإرسال."],
  },
  {
    id: "qr",
    title: "📅 حجز جلسات QR",
    intro: "احجز نافذة جلسة لربط/تشغيل واتساب ضمن السعة المتاحة.",
    steps: ["افتح «حجز جلسات QR».", "اختر الوقت المتاح واحجزه.", "اربط واتساب خلال نافذتك."],
    fixes: ["لا توجد مواعيد؟ جرّب لاحقًا أو تواصل مع الدعم."],
  },
  {
    id: "finance",
    title: "💼 دليل المالية (للموظفين)",
    intro: "موظف المالية يراجع المدفوعات ويعتمدها/يرفضها دون صلاحيات المالك الكاملة.",
    steps: [
      "ادخل بحساب الدور «finance» ← تُفتح صفحة «مراجعة المدفوعات».",
      "عاين صورة الإيصال (اضغط للتكبير).",
      "«اعتماد» يشحن المحفظة ويفعّل الباقة، أو «رفض» مع ذكر سبب يراه العميل.",
    ],
    mistakes: ["الاعتماد دون فتح صورة الإيصال.", "الرفض دون سبب واضح للعميل."],
    fixes: ["كل إجراء يُسجَّل في سجل التدقيق للمساءلة."],
  },
  {
    id: "support",
    title: "🛟 دليل الدعم",
    intro: "كيف تحصل على المساعدة، وكيف يتابع الفريق الحوادث.",
    steps: [
      "استخدم زر «مساعدة» داخل اللوحة، أو روابط التواصل في الأسفل.",
      "للفِرق: الحوادث تُوجَّه تلقائيًا لمالك ولها أولوية وموعد استحقاق وسجل.",
    ],
    fixes: ["مشكلة عاجلة؟ تواصل عبر واتساب الدعم الظاهر في صفحة الأسعار/الفوتر."],
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12" dir="rtl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold mb-2">مركز المساعدة والتوثيق</h1>
        <p className="text-slate-400">كل ما تحتاجه لإطلاق متجرك على واتساب — خطوة بخطوة.</p>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-6">
        {/* sticky index */}
        <nav className="md:sticky md:top-6 self-start card p-4 h-max">
          <div className="text-xs text-slate-500 mb-2">المحتويات</div>
          <ul className="space-y-1 text-sm">
            {GUIDES.map((g) => (
              <li key={g.id}><a href={`#${g.id}`} className="text-slate-300 hover:text-white block py-0.5">{g.title}</a></li>
            ))}
            <li className="pt-2 mt-2 border-t border-white/10"><Link href="/dashboard/developer/docs" className="text-brand-300 hover:underline block py-0.5">{"</>"} توثيق المطوّرين (API)</Link></li>
          </ul>
        </nav>

        {/* guides */}
        <div className="space-y-5">
          {GUIDES.map((g) => (
            <section key={g.id} id={g.id} className="card p-6 scroll-mt-6">
              <h2 className="text-xl font-bold mb-1">{g.title}</h2>
              <p className="text-sm text-slate-400 mb-4">{g.intro}</p>
              <ol className="space-y-2 mb-4">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 text-xs font-bold">{i + 1}</span>
                    <span className="text-slate-200">{s}</span>
                  </li>
                ))}
              </ol>
              {g.mistakes && g.mistakes.length > 0 && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 mb-2">
                  <div className="text-xs font-semibold text-amber-300 mb-1">أخطاء شائعة</div>
                  <ul className="list-disc pe-5 space-y-0.5 text-xs text-slate-300">{g.mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
              {g.fixes && g.fixes.length > 0 && (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                  <div className="text-xs font-semibold text-emerald-300 mb-1">حل المشكلات</div>
                  <ul className="list-disc pe-5 space-y-0.5 text-xs text-slate-300">{g.fixes.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
            </section>
          ))}
          <p className="text-center text-xs text-slate-500">لقطات الشاشة والفيديوهات التوضيحية قادمة قريبًا. تحتاج مساعدة فورية؟ استخدم زر «مساعدة» داخل اللوحة.</p>
        </div>
      </div>
    </div>
  );
}
